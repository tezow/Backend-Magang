import { AppError } from "../../common/app-error";
import { generateStandardFilename } from "../../common/filename-helper";
import { pool } from "../../db/pool";
import { GoogleProvider } from "../../common/google";
import * as XLSX from "xlsx";
import { env } from "../../config/env";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import type { ApprovalActionInput } from "../approval/approval.schema";
import { calculateDendaByTokoId } from "../denda/denda-keterlambatan";
import { instruksiLapanganRepository } from "../instruksi-lapangan/instruksi-lapangan.repository";
import { rabRepository } from "../rab/rab.repository";
import { buildOpnameFinalPdfBuffer } from "./opname-final.pdf";
import {
    calculateEffectiveInstruksiLapanganAmount,
    calculateOpnameFinalFinancials,
    isNoPpnArea,
} from "./opname-final.financial";
import { OPNAME_FINAL_STATUS, type OpnameFinalStatus } from "./opname-final.constants";
import { opnameFinalRepository } from "./opname-final.repository";
import type { OpnameFinalDetail, OpnameFinalIdRow } from "./opname-final.repository";
import type { LockOpnameFinalInput, OpnameFinalInterventionInput, OpnameFinalListQueryInput } from "./opname-final.schema";

type PgError = {
    code?: string;
    constraint?: string;
};

const toPgError = (error: unknown): PgError => {
    if (typeof error === "object" && error !== null) {
        return error as PgError;
    }

    return {};
};

const mapPgError = (error: unknown): never => {
    const pgError = toPgError(error);

    if (pgError.code === "23503" && pgError.constraint === "fk_opname_final_toko") {
        throw new AppError("id_toko tidak ditemukan di tabel toko", 404);
    }

    if (pgError.code === "23503" && pgError.constraint === "fk_opname_item_rab_item") {
        throw new AppError("id_rab_item tidak ditemukan di tabel rab_item", 404);
    }

    if (pgError.code === "23503" && pgError.constraint === "fk_opname_item_instruksi_lapangan_item") {
        throw new AppError("id_instruksi_lapangan_item tidak ditemukan di tabel instruksi_lapangan_item", 404);
    }

    if (pgError.code === "23503" && pgError.constraint === "fk_opname_item_toko") {
        throw new AppError("id_toko tidak ditemukan di tabel toko", 404);
    }

    if (pgError.code === "23514" && pgError.constraint === "chk_opname_item_status") {
        throw new AppError("status opname item tidak valid (gunakan: pending, disetujui, ditolak)", 400);
    }

    if (pgError.code === "23514" && pgError.constraint === "chk_opname_item_source") {
        throw new AppError("Sumber item opname tidak valid. Isi tepat salah satu: id_rab_item atau id_instruksi_lapangan_item", 400);
    }

    throw error;
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const toNumber = (value: string | number | null | undefined): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseAreaNumber = (value?: string | number | null): number => {
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const normalized = raw
        .replace(/\s+/g, "")
        .replace(/,/g, ".")
        .replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const resolveStatusTransition = (
    currentStatus: OpnameFinalStatus,
    action: ApprovalActionInput,
    cabang?: string | null
): OpnameFinalStatus => {
    if (action.tindakan === "APPROVE") {
        if (action.jabatan === "KOORDINATOR") {
            if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_COORDINATOR) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval koordinator`, 409);
            }
            if (cabang?.toUpperCase() === "BATAM") {
                return OPNAME_FINAL_STATUS.WAITING_FOR_DIREKTUR;
            }
            return OPNAME_FINAL_STATUS.WAITING_FOR_MANAGER;
        }

        if (action.jabatan === "MANAGER") {
            if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_MANAGER) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval manager`, 409);
            }
            return OPNAME_FINAL_STATUS.WAITING_FOR_DIREKTUR;
        }

        if (action.jabatan === "DIREKTUR") {
            if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_DIREKTUR) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval direktur`, 409);
            }
            return OPNAME_FINAL_STATUS.APPROVED;
        }

        throw new AppError(`Jabatan "${action.jabatan}" tidak dikenali`, 400);
    }

    if (action.jabatan === "DIREKTUR") {
        if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_DIREKTUR) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject direktur`, 409);
        }
        return OPNAME_FINAL_STATUS.REJECTED_BY_DIREKTUR;
    }

    if (action.jabatan === "KOORDINATOR") {
        if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_COORDINATOR) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject koordinator`, 409);
        }
        return OPNAME_FINAL_STATUS.REJECTED_BY_COORDINATOR;
    }

    if (action.jabatan === "MANAGER") {
        if (currentStatus !== OPNAME_FINAL_STATUS.WAITING_FOR_MANAGER) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject manager`, 409);
        }
        return OPNAME_FINAL_STATUS.REJECTED_BY_MANAGER;
    }

    throw new AppError(`Jabatan "${action.jabatan}" tidak dikenali`, 400);
};

const uploadPdfToDrive = async (buffer: Buffer, filename: string, nomorUlok?: string | null, proyek?: string | null): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) {
        throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);
    }

    const folderId = await gp.getOrCreateProcessFolder("Opname", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        "application/pdf",
        buffer,
        2,
        drive
    );

    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
};

const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const byIdParam = /[?&]id=([^&]+)/.exec(trimmed);
    if (byIdParam?.[1]) return byIdParam[1];

    const byPath = /\/d\/([^/]+)/.exec(trimmed);
    if (byPath?.[1]) return byPath[1];

    if (!trimmed.startsWith("http") && /^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
        return trimmed;
    }

    return null;
};

const normalizeDriveDownloadLink = (value: string): string => {
    const fileId = extractDriveFileId(value);
    if (!fileId) return value;
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
};

const downloadStoredPdfBuffer = async (linkPdf?: string | null): Promise<Buffer | null> => {
    if (!linkPdf) return null;

    const gp = GoogleProvider.instance;
    const fileId = extractDriveFileId(linkPdf);
    let buffer: Buffer | null = null;

    if (fileId && gp.spartaDrive) {
        buffer = await gp.getFileBufferById(gp.spartaDrive, fileId, 5000);
    }

    if (!buffer && fileId && gp.docDrive) {
        buffer = await gp.getFileBufferById(gp.docDrive, fileId, 5000);
    }

    if (!buffer && !fileId && /^https?:\/\//i.test(linkPdf)) {
        try {
            const response = await fetch(normalizeDriveDownloadLink(linkPdf), {
                redirect: "follow",
                signal: AbortSignal.timeout(5000),
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; SPARTA-PDF/1.0)"
                }
            });
            if (response.ok && !(response.headers.get("content-type") ?? "").includes("text/html")) {
                buffer = Buffer.from(await response.arrayBuffer());
            }
        } catch {
            // Fall back to regeneration below.
        }
    }

    return buffer && buffer.length > 0 ? buffer : null;
};

const loadInstruksiLapanganItems = async (idToko: number) => {
    const approvedInstruksi = await instruksiLapanganRepository.getApprovedByTokoId(idToko);
    if (approvedInstruksi.length === 0) {
        return [];
    }

    const itemGroups = await Promise.all(
        approvedInstruksi.map((instruksi) => instruksiLapanganRepository.getItems(instruksi.id))
    );
    return itemGroups.flat();
};

const sumEffectiveInstruksiLapanganTotal = (
    instruksiLapanganItems: Awaited<ReturnType<typeof loadInstruksiLapanganItems>>,
    opnameItems: OpnameFinalDetail["items"] = []
): number => {
    const opnameByInstruksiId = new Map<number, OpnameFinalDetail["items"][number]>();
    for (const item of opnameItems) {
        const instruksiId = Number(item.id_instruksi_lapangan_item ?? 0);
        if (instruksiId > 0) opnameByInstruksiId.set(instruksiId, item);
    }

    return instruksiLapanganItems.reduce((acc, item) => {
        const opnameItem = opnameByInstruksiId.get(Number(item.id));
        return acc + calculateEffectiveInstruksiLapanganAmount(item, opnameItem).totalHarga;
    }, 0);
};

const loadRabData = async (opnameFinalId: number, idToko: number) => {
    const items = await rabRepository.listItemsByOpnameFinalId(opnameFinalId);
    if (items.length === 0) {
        return { header: null, items: [] };
    }

    const rabId = items[0]?.id_rab;
    const header = rabId ? (await rabRepository.findById(String(rabId)))?.rab ?? null : null;
    
    // Filter out "Tidak Dikerjakan" items from the RAB items list
    const { rows: pengawasanRows } = await pool.query(
        `SELECT p.kategori_pekerjaan, p.jenis_pekerjaan, p.status 
         FROM pengawasan p
         JOIN gantt_chart g ON p.id_gantt = g.id
         WHERE g.id_toko = $1
         ORDER BY p.id DESC`,
        [idToko]
    );

    const excludedKeys = new Set<string>();
    pengawasanRows.forEach(row => {
        const k = (row.kategori_pekerjaan || '').toUpperCase();
        const j = (row.jenis_pekerjaan || row.kategori_pekerjaan || '').toUpperCase();
        const key = `${k}|${j}`;
        if (!excludedKeys.has(key) && !excludedKeys.has(`NOT_${key}`)) {
            if (row.status?.toLowerCase().replace(/\s+/g, '_') === 'tidak_dikerjakan') {
                excludedKeys.add(key);
            } else {
                excludedKeys.add(`NOT_${key}`);
            }
        }
    });

    const filteredItems = items.filter(item => {
        const k = (item.kategori_pekerjaan || '').toUpperCase();
        const j = (item.jenis_pekerjaan || item.kategori_pekerjaan || '').toUpperCase();
        return !excludedKeys.has(`${k}|${j}`);
    });

    return { header, items: filteredItems };
};

const calculateOpnameKtkTotal = (
    detail: OpnameFinalDetail,
    instruksiLapanganItems: Awaited<ReturnType<typeof loadInstruksiLapanganItems>>,
    rabData: Awaited<ReturnType<typeof loadRabData>>
): number => {
    const noPpn = isNoPpnArea(detail.toko);
    const opnameItems = detail.items ?? [];
    const rabItems = rabData.items ?? [];
    const kerjaTambahItems = opnameItems.filter((item) => toNumber(item.total_selisih) > 0);
    const kerjaKurangItems = opnameItems.filter((item) => toNumber(item.total_selisih) < 0);
    const totalRabItems = rabItems.reduce((acc, item) => acc + toNumber(item.total_harga), 0);
    const totalIl = sumEffectiveInstruksiLapanganTotal(instruksiLapanganItems, opnameItems);
    const totalKerjaTambah = kerjaTambahItems.reduce((acc, item) => acc + toNumber(item.total_selisih), 0);
    const totalKerjaKurang = kerjaKurangItems.reduce((acc, item) => acc + toNumber(item.total_selisih), 0);
    const nilaiDenda = toNumber(detail.opname_final.nilai_denda);

    return calculateOpnameFinalFinancials({
        rab: totalRabItems,
        instruksiLapangan: totalIl,
        kerjaTambah: totalKerjaTambah,
        kerjaKurang: totalKerjaKurang,
        denda: nilaiDenda,
        noPpn,
    }).totalFinal;
};

const applyRukoConversionIfNeeded = async (
    detail: OpnameFinalDetail,
    instruksiLapanganItems: Awaited<ReturnType<typeof loadInstruksiLapanganItems>>,
    rabData: Awaited<ReturnType<typeof loadRabData>>
) => {
    if (detail.opname_final.status_opname_final !== OPNAME_FINAL_STATUS.APPROVED) return null;

    const context = await opnameFinalRepository.getRukoConversionContext(detail.toko.id);
    if (!context?.is_ruko) return null;

    const luasAreaTerbangun = parseAreaNumber(context.luas_area_terbangun);
    if (luasAreaTerbangun <= 0) return null;

    const totalOpnameKtk = calculateOpnameKtkTotal(detail, instruksiLapanganItems, rabData);
    const costPerM2 = totalOpnameKtk / luasAreaTerbangun;
    if (costPerM2 <= 900000) return null;

    const result = await opnameFinalRepository.applyNonRukoConversion(detail.toko.id);
    console.info("[opname-final] Ruko dikonversi otomatis ke Non-Ruko", {
        id_toko: detail.toko.id,
        nomor_ulok: detail.toko.nomor_ulok,
        total_opname_ktk: totalOpnameKtk,
        luas_area_terbangun: luasAreaTerbangun,
        cost_per_m2: costPerM2,
        ...result,
    });

    return {
        total_opname_ktk: totalOpnameKtk,
        luas_area_terbangun: luasAreaTerbangun,
        cost_per_m2: costPerM2,
        ...result,
    };
};

type DendaPayload = {
    hari_denda: number;
    nilai_denda: number;
    tanggal_akhir_spk: string | null;
    tanggal_serah_terima: string | null;
};

const zeroAllocatedDenda = (): DendaPayload => ({
    hari_denda: 0,
    nilai_denda: 0,
    tanggal_akhir_spk: null,
    tanggal_serah_terima: null,
});

const isSipilScope = (row: OpnameFinalIdRow): boolean =>
    String(row.lingkup_pekerjaan ?? "").trim().toUpperCase() === "SIPIL";

const resolvePenaltyOwner = (rows: OpnameFinalIdRow[]): OpnameFinalIdRow | null => {
    if (rows.length === 0) return null;
    return rows.find(isSipilScope) ?? rows[0];
};

const refreshDenda = async (opnameFinalId: string, idToko: number) => {
    const denda = await calculateDendaByTokoId(idToko);
    const scopedRows = await opnameFinalRepository.listIdsByPenaltyScope(idToko);
    const owner = resolvePenaltyOwner(scopedRows);
    const isCurrentOwner = !owner || String(owner.id) === String(opnameFinalId);
    const allocatedDenda = isCurrentOwner ? denda : zeroAllocatedDenda();

    // Safety guard: jangan overwrite denda valid jika perhitungan baru gagal (return 0)
    if (isCurrentOwner && denda.hari_denda === 0 && denda.tanggal_akhir_spk === null) {
        const existing = await opnameFinalRepository.findById(opnameFinalId);
        const existingHari = Number(existing?.opname_final.hari_denda ?? 0);
        if (existingHari > 0) {
            console.warn(`[DENDA] Skip update opname_final ${opnameFinalId}: calculated=0 but existing=${existingHari}. Keeping existing data.`);
            return {
                hari_denda: existingHari,
                nilai_denda: Number(existing!.opname_final.nilai_denda ?? 0),
                tanggal_akhir_spk: existing!.opname_final.tanggal_akhir_spk_denda ?? null,
                tanggal_serah_terima: existing!.opname_final.tanggal_serah_terima_denda ?? null,
            };
        }
    }

    await opnameFinalRepository.updateDenda(opnameFinalId, allocatedDenda);
    return allocatedDenda;
};


const refreshDendaByTokoScope = async (idToko: number) => {
    const rows = await opnameFinalRepository.listIdsByPenaltyScope(idToko);
    if (rows.length === 0) {
        return 0;
    }

    const denda = await calculateDendaByTokoId(idToko);
    const owner = resolvePenaltyOwner(rows);

    await Promise.all(rows.map(async (row) => {
        const allocatedDenda = owner && String(row.id) === String(owner.id) ? denda : zeroAllocatedDenda();
        await opnameFinalRepository.updateDenda(String(row.id), allocatedDenda);
        await opnameFinalRepository.updateTotals(String(row.id));
    }));
    return rows.length;
};

const refreshDendaAllocation = async (opnameFinalId: string, idToko: number) => {
    const updatedCount = await refreshDendaByTokoScope(idToko);
    if (updatedCount === 0) {
        await refreshDenda(opnameFinalId, idToko);
    }
    return updatedCount;
};

const regeneratePdfAndUpload = async (opnameFinalId: string): Promise<string> => {
    const detail = await opnameFinalRepository.findById(opnameFinalId);
    if (!detail) {
        throw new AppError("Data opname_final tidak ditemukan", 404);
    }

    const instruksiLapanganItems = await loadInstruksiLapanganItems(detail.toko.id);
    const rabData = await loadRabData(detail.opname_final.id, detail.toko.id);
    await applyRukoConversionIfNeeded(detail, instruksiLapanganItems, rabData);
    const pdfBuffer = await buildOpnameFinalPdfBuffer(detail, instruksiLapanganItems, rabData);
    const prefix = detail.opname_final.tipe_opname === "OPNAME" ? "OPNAME" : "KTK";
    const filename = generateStandardFilename(
        prefix,
        detail.toko.nomor_ulok,
        detail.toko.nama_toko,
        detail.toko.lingkup_pekerjaan,
        ".pdf"
    );

    return uploadPdfToDrive(pdfBuffer, filename, detail.toko.nomor_ulok, detail.toko.proyek);
};

const runningRegenerateJobs = new Set<string>();

const regeneratePdfInBackground = (id: string): boolean => {
    if (runningRegenerateJobs.has(id)) return false;
    runningRegenerateJobs.add(id);

    setImmediate(() => {
        opnameFinalRepository.findById(id)
            .then(async (detail) => {
                if (!detail) {
                    throw new AppError("Data opname_final tidak ditemukan", 404);
                }

                await refreshDendaAllocation(id, detail.toko.id);
                await opnameFinalRepository.updateTotals(id);
                return regeneratePdfAndUpload(id);
            })
            .then((linkPdf) => opnameFinalRepository.updatePdfLink(id, linkPdf))
            .catch((error) => {
                console.warn("[opname-final] Background regenerate PDF gagal", {
                    id,
                    message: error instanceof Error ? error.message : String(error)
                });
            })
            .finally(() => {
                runningRegenerateJobs.delete(id);
            });
    });

    return true;
};

export const opnameFinalService = {
    async list(query: OpnameFinalListQueryInput) {
        return opnameFinalRepository.list(query);
    },

    async getById(id: string) {
        await opnameFinalRepository.updateTotals(id);
        const data = await opnameFinalRepository.findById(id);
        if (!data) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        return data;
    },

    async handleApproval(id: string, action: ApprovalActionInput) {
        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        if ((detail.opname_final.aksi || "").toLowerCase() !== "terkunci") {
            throw new AppError("Opname final belum dikunci. Approval hanya bisa dilakukan saat aksi = terkunci", 409);
        }

        const currentStatus = detail.opname_final.status_opname_final;
        const newStatus = resolveStatusTransition(currentStatus, action, detail.toko.cabang);

        await opnameFinalRepository.updateApproval(id, newStatus, action);
        await refreshDendaAllocation(id, detail.toko.id);
        await opnameFinalRepository.updateTotals(id);

        const linkPdf = await regeneratePdfAndUpload(id);
        await opnameFinalRepository.updatePdfLink(id, linkPdf);

        return {
            id: Number(id),
            old_status: currentStatus,
            new_status: newStatus,
            link_pdf_opname: linkPdf
        };
    },

    async intervene(id: string, action: OpnameFinalInterventionInput) {
        const role = action.actor_role.toUpperCase();
        const isAllowed = role.includes("SUPER HUMAN")
            || role.includes("STORE & BRANCH CONTROLLING");
        if (!isAllowed) {
            throw new AppError("Hanya Super Human atau Store & Branch Controlling Specialist yang dapat melakukan intervensi KTK", 403);
        }

        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        const currentStatus = detail.opname_final.status_opname_final;
        const targetStatus = action.target_status as OpnameFinalStatus;

        if (currentStatus === targetStatus) {
            throw new AppError("Status KTK sudah sama dengan target intervensi", 409);
        }

        await opnameFinalRepository.interveneStatus(id, targetStatus, action.alasan_intervensi);
        await refreshDendaAllocation(id, detail.toko.id);
        await opnameFinalRepository.updateTotals(id);

        await activityLogRepository.insert({
            entity_type: "OPNAME_FINAL",
            entity_id: Number(id),
            actor_email: action.actor_email,
            actor_role: action.actor_role,
            action: "INTERVENTION",
            status_before: currentStatus,
            status_after: targetStatus,
            reason: action.alasan_intervensi,
            metadata: {
                id_toko: detail.toko.id,
                nomor_ulok: detail.toko.nomor_ulok,
                lingkup_pekerjaan: detail.toko.lingkup_pekerjaan,
                source: "super_human_intervention",
            },
        });

        return {
            id: Number(id),
            old_status: currentStatus,
            new_status: targetStatus,
        };
    },

    async generatePdf(id: string, options?: { forceRegenerate?: boolean }) {
        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        const prefix = detail.opname_final.tipe_opname === "OPNAME" ? "OPNAME" : "KTK";
        const filename = generateStandardFilename(
            prefix,
            detail.toko.nomor_ulok,
            detail.toko.nama_toko,
            detail.toko.lingkup_pekerjaan,
            ".pdf"
        );

        const storedBuffer = await downloadStoredPdfBuffer(detail.opname_final.link_pdf_opname);
        if (storedBuffer) {
            if (options?.forceRegenerate) {
                regeneratePdfInBackground(id);
                return {
                    filename,
                    pdfBuffer: storedBuffer,
                    source: "stored-regenerating" as const
                };
            }

            return {
                filename,
                pdfBuffer: storedBuffer,
                source: "stored" as const
            };
        }

        await refreshDendaAllocation(id, detail.toko.id);
        await opnameFinalRepository.updateTotals(id);
        const refreshedDetail = await opnameFinalRepository.findById(id);
        if (!refreshedDetail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        const instruksiLapanganItems = await loadInstruksiLapanganItems(refreshedDetail.toko.id);
        const rabData = await loadRabData(refreshedDetail.opname_final.id, refreshedDetail.toko.id);
        await applyRukoConversionIfNeeded(refreshedDetail, instruksiLapanganItems, rabData);
        const pdfBuffer = await buildOpnameFinalPdfBuffer(refreshedDetail, instruksiLapanganItems, rabData);
        uploadPdfToDrive(pdfBuffer, filename, refreshedDetail.toko.nomor_ulok, refreshedDetail.toko.proyek).then((linkPdf) =>
            opnameFinalRepository.updatePdfLink(id, linkPdf)
        ).catch((error) => {
            console.warn("[opname-final] Gagal menyimpan cache PDF hasil generate; tetap mengirim PDF ke user", {
                id,
                message: error instanceof Error ? error.message : String(error)
            });
        });

        return {
            filename,
            pdfBuffer,
            source: "generated" as const
        };
    },

    async queueRegeneratePdf(id: string) {
        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        const queued = regeneratePdfInBackground(id);
        return {
            id: Number(id),
            queued,
            message: queued
                ? "Generate ulang PDF KTK sedang diproses di background"
                : "Generate ulang PDF KTK sudah berjalan"
        };
    },

    async lockOpnameFinal(id: string, payload: LockOpnameFinalInput) {
        try {
            // Validasi: Pastikan Serah Terima dan Pengawasan sudah selesai sebelum Kunci Finalisasi KTK
            // Kecualikan data V1 (tidak ada gantt_chart)
            const gantt = await pool.query(`SELECT id, status FROM gantt_chart WHERE id_toko = $1 ORDER BY id DESC LIMIT 1`, [payload.id_toko]);
            
            if ((gantt.rowCount ?? 0) > 0) {
                // Cek apakah ada Serah Terima. 
                // Karena Serah Terima hanya bisa digenerate jika Pengawasan sudah selesai, 
                // mengecek keberadaan Serah Terima sudah mencakup validasi Pengawasan.
                const st = await pool.query(`SELECT id FROM berkas_serah_terima WHERE id_toko = $1`, [payload.id_toko]);
                const hasSerahTerima = (st.rowCount ?? 0) > 0;
                
                if (!hasSerahTerima) {
                    throw new AppError("Tidak dapat melakukan Kunci Finalisasi KTK. Pastikan Pengawasan sudah terisi penuh dan Serah Terima sudah dilakukan.", 403);
                }
            }

            const result = await opnameFinalRepository.lockById(id, payload);
            if (result.item_count === 0) {
                throw new AppError("Data opname_final tidak ditemukan", 404);
            }

            await refreshDendaAllocation(id, payload.id_toko);
            await opnameFinalRepository.updateTotals(id);
            const linkPdf = await regeneratePdfAndUpload(id);
            await opnameFinalRepository.updatePdfLink(id, linkPdf);

            return {
                id: Number(id),
                id_toko: payload.id_toko,
                aksi: payload.aksi ?? "terkunci",
                status_opname_final: OPNAME_FINAL_STATUS.WAITING_FOR_COORDINATOR,
                item_count: result.item_count,
                link_pdf_opname: linkPdf
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            return mapPgError(error);
        }
    },

    async refreshDendaAndPdfById(id: string) {
        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        await refreshDendaAllocation(id, detail.toko.id);
        await opnameFinalRepository.updateTotals(id);
        const linkPdf = await regeneratePdfAndUpload(id);
        await opnameFinalRepository.updatePdfLink(id, linkPdf);

        return {
            id: Number(id),
            link_pdf_opname: linkPdf
        };
    },

    async refreshDendaByTokoId(idToko: number) {
        const updatedCount = await refreshDendaByTokoScope(idToko);

        return {
            id_toko: idToko,
            updated_count: updatedCount
        };
    },

    async exportOpnameFinalExcel(id: string): Promise<{ filename: string; excelBuffer: Buffer }> {
        const detail = await opnameFinalRepository.findById(id);
        if (!detail) {
            throw new AppError("Data opname_final tidak ditemukan", 404);
        }

        const items = detail.items;
        
        const excelData = items.map((item, index) => {
            const sumber = item.id_instruksi_lapangan_item ? "Instruksi Lapangan" : "RAB";
            const originalItem = item.id_instruksi_lapangan_item ? item.instruksi_lapangan_item : item.rab_item;
            const hargaSatuan = originalItem ? (Number(originalItem.harga_material || 0) + Number(originalItem.harga_upah || 0)) : 0;
            
            return {
                "No": index + 1,
                "Sumber": sumber,
                "Kategori Pekerjaan": item.kategori_pekerjaan || originalItem?.kategori_pekerjaan || "",
                "Jenis Pekerjaan": item.jenis_pekerjaan || originalItem?.jenis_pekerjaan || "",
                "Satuan": item.satuan || originalItem?.satuan || "",
                "Volume Awal": Number(item.volume_rab) || 0,
                "Volume Akhir": Number(item.volume_akhir) || 0,
                "Selisih Volume": Number(item.selisih_volume) || 0,
                "Harga Satuan": hargaSatuan,
                "Total Selisih": Number(item.total_selisih) || 0,
                "Total Harga Opname": Number(item.total_harga_opname) || 0,
                "Status": item.status || "",
                "Catatan": item.catatan || ""
            };
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        
        const wscols = [
            { wch: 5 },  // No
            { wch: 15 }, // Sumber
            { wch: 30 }, // Kategori
            { wch: 40 }, // Pekerjaan
            { wch: 10 }, // Satuan
            { wch: 15 }, // Vol Awal
            { wch: 15 }, // Vol Akhir
            { wch: 15 }, // Selisih Vol
            { wch: 15 }, // Harga Satuan
            { wch: 15 }, // Tot Selisih
            { wch: 15 }, // Tot Harga Opname
            { wch: 15 }, // Status
            { wch: 30 }  // Catatan
        ];
        worksheet["!cols"] = wscols;

        const prefix = detail.opname_final.tipe_opname === "OPNAME" ? "OPNAME" : "KTK";
        const sheetTitle = prefix === "OPNAME" ? "Opname Items" : "KTK Items";
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);
        
        const filename = generateStandardFilename(
            prefix,
            detail.toko.nomor_ulok,
            detail.toko.nama_toko,
            detail.toko.lingkup_pekerjaan,
            ".xlsx"
        );
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

        return {
            filename,
            excelBuffer
        };
    }
};
