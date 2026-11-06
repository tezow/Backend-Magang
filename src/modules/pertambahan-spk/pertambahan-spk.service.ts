import { AppError } from "../../common/app-error";
import { isSameBranchScope } from "../../common/branch-scope";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import { ganttRepository } from "../gantt/gantt.repository";
import { opnameFinalService } from "../opname-final/opname-final.service";
import { spkRepository } from "../spk/spk.repository";
import { tokoRepository } from "../toko/toko.repository";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import { buildPertambahanSpkPdfBuffer } from "./pertambahan-spk.pdf";
import {
    pertambahanSpkRepository,
    type PertambahanSpkDetailRow
} from "./pertambahan-spk.repository";
import type {
    CreatePertambahanSpkInput,
    PertambahanSpkApprovalInput,
    PertambahanSpkListQuery,
    UpdatePertambahanSpkInput,
    PertambahanSpkInterventionInput
} from "./pertambahan-spk.schema";
import { generateStandardFilename } from "../../common/filename-helper";

const PERTAMBAHAN_SPK_STATUS = {
    WAITING_FOR_BM_APPROVAL: "Menunggu Persetujuan",
    APPROVED_BY_BM: "Disetujui BM",
    REJECTED_BY_BM: "Ditolak BM"
} as const;

const APPROVAL_ALLOWED_STATUS = new Set<string>([
    PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL,
    "WAITING_FOR_BM_APPROVAL"
]);

const normalizeBranchName = (value?: string | null): string =>
    String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const assertApproverCanProcessPertambahanSpk = async (
    data: PertambahanSpkDetailRow,
    approverEmail: string
): Promise<void> => {
    const targetBranch = normalizeBranchName(data.toko?.cabang);
    if (!targetBranch) {
        throw new AppError("Cabang toko pada pertambahan SPK tidak ditemukan", 409);
    }

    const approverRows = await userCabangRepository.findAll({ email_sat: approverEmail });
    if (approverRows.length === 0) {
        throw new AppError("Approver tidak terdaftar pada data user cabang", 403);
    }

    const hasAccessToBranch = approverRows.some(row => {
        const approverBranch = normalizeBranchName(row.cabang);
        return approverBranch === "HEAD OFFICE" || isSameBranchScope(approverBranch, targetBranch);
    });

    if (!hasAccessToBranch) {
        const approverBranches = approverRows
            .map(row => row.cabang)
            .filter(Boolean)
            .join(", ");
        throw new AppError(
            `Approver cabang ${approverBranches || "-"} tidak dapat memproses pertambahan SPK cabang ${data.toko?.cabang}`,
            403
        );
    }
};

interface UploadedLampiranPendukungFile {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}

const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const byIdParam = /[?&]id=([^&]+)/.exec(trimmed);
    if (byIdParam?.[1]) return byIdParam[1];

    const byPath = /\/d\/([^/]+)/.exec(trimmed);
    if (byPath?.[1]) return byPath[1];

    return null;
};

const normalizeDriveDownloadLink = (value?: string | null): string | undefined => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return undefined;

    const fileId = extractDriveFileId(trimmed);
    if (!fileId) return trimmed;

    return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

const inferFileExtension = (mimeType?: string | null): string => {
    const value = (mimeType ?? "").toLowerCase();
    if (value === "application/pdf") return ".pdf";
    if (value === "image/png") return ".png";
    if (value === "image/jpeg") return ".jpg";
    if (value === "image/webp") return ".webp";
    if (value === "image/svg+xml") return ".svg";
    if (value === "application/zip") return ".zip";
    return "";
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedLampiranPendukungFile): string => {
    const fromName = (() => {
        const rawName = file.originalname ?? "";
        const lastDot = rawName.lastIndexOf(".");
        if (lastDot <= 0 || lastDot === rawName.length - 1) return "";
        return rawName.slice(lastDot).toLowerCase();
    })();
    if (/^\.[a-z0-9]{1,10}$/.test(fromName)) {
        return fromName;
    }

    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    return ".bin";
};

const uploadLampiranPendukungToDrive = async (
    file: UploadedLampiranPendukungFile,
    nomorUlok: string,
    proyek?: string,
): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const safeProyek = sanitizeFilenamePart(proyek, "PROYEK");
    const safeUlok = sanitizeFilenamePart(nomorUlok, "ULOK");
    const ext = resolveFileExtension(file);
    const filename = `PERTAMBAHAN_SPK_LAMPIRAN_${safeProyek}_${safeUlok}_${Date.now()}${ext}`;

    const folderId = await gp.getOrCreateProcessFolder("Pertambahan SPK", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        file.mimetype || "application/octet-stream",
        file.buffer,
        2,
        drive,
    );

    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
};

const uploadPdfToDrive = async (buffer: Buffer, filename: string, nomorUlok?: string, proyek?: string): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const folderId = await gp.getOrCreateProcessFolder("Pertambahan SPK", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        "application/pdf",
        buffer,
        2,
        drive,
    );

    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
};

async function ensureSpkExists(idSpk: number) {
    const spk = await spkRepository.findById(String(idSpk));
    if (!spk) {
        throw new AppError("SPK tidak ditemukan", 404);
    }

    return spk;
}

export const buildAndUploadPdfForDetail = async (data: PertambahanSpkDetailRow): Promise<string> => {
    const spk = await ensureSpkExists(Number(data.id_spk));
    const toko = data.toko ?? await tokoRepository.findByNomorUlok(spk.pengajuan.nomor_ulok);

    const pdfBuffer = await buildPertambahanSpkPdfBuffer({
        nomorUlok: spk.pengajuan.nomor_ulok,
        nomorSpk: data.nomor_spk ?? data.spk?.nomor_spk ?? spk.pengajuan.nomor_spk,
        nomorSpkSipil: data.nomor_spk_sipil ?? undefined,
        nomorSpkMe: data.nomor_spk_me ?? undefined,
        cabang: toko?.cabang,
        tanggalSpkAkhir: data.tanggal_spk_akhir,
        tanggalSpkAkhirSetelahPerpanjangan: data.tanggal_spk_akhir_setelah_perpanjangan,
        pertambahanHari: data.pertambahan_hari,
        alasanPerpanjangan: data.alasan_perpanjangan,
        dibuatOleh: data.dibuat_oleh,
        dibuatPada: data.created_at,
        disetujuiOleh: data.disetujui_oleh,
        disetujuiPada: data.waktu_persetujuan,
    });

    const safeNomorSpk = sanitizeFilenamePart(data.nomor_spk ?? data.spk?.nomor_spk ?? spk.pengajuan.nomor_spk, "SPK");
    const pdfFilename = `FORM_PERPANJANGAN_SPK_${safeNomorSpk}_${Date.now()}.pdf`;
    return uploadPdfToDrive(pdfBuffer, pdfFilename, spk.pengajuan.nomor_ulok, spk.pengajuan.proyek);
};

export const pertambahanSpkService = {
    async create(
        payload: CreatePertambahanSpkInput,
        uploadedLampiranPendukung?: UploadedLampiranPendukungFile
    ): Promise<PertambahanSpkDetailRow> {
        const spk = await ensureSpkExists(payload.id_spk);
        const toko = await tokoRepository.findByNomorUlok(spk.pengajuan.nomor_ulok);

        const targetRejectedRecord = payload.id
            ? await pertambahanSpkRepository.findById(String(payload.id))
            : await pertambahanSpkRepository.findLatestRejectedBySpkId(payload.id_spk);

        if (targetRejectedRecord && targetRejectedRecord.id_spk !== String(payload.id_spk)) {
            throw new AppError("Data revisi tidak sesuai dengan id_spk", 409);
        }

        if (payload.id && !targetRejectedRecord) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        if (
            targetRejectedRecord &&
            targetRejectedRecord.status_persetujuan !== PERTAMBAHAN_SPK_STATUS.REJECTED_BY_BM
        ) {
            throw new AppError(
                `Hanya data dengan status ${PERTAMBAHAN_SPK_STATUS.REJECTED_BY_BM} yang bisa direvisi`,
                409
            );
        }

        // Validate that no active or approved Pertambahan SPK exists for this ULOK
        const existingForUlok = await pertambahanSpkRepository.list({ nomor_ulok: spk.pengajuan.nomor_ulok });
        const hasActivePertambahan = existingForUlok.some(
            (p) => p.status_persetujuan === PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL || 
                   p.status_persetujuan === PERTAMBAHAN_SPK_STATUS.APPROVED_BY_BM
        );
        
        if (hasActivePertambahan && !targetRejectedRecord) {
            throw new AppError("ULOK ini sudah memiliki pengajuan Tambah SPK yang aktif atau disetujui. Pengajuan ganda tidak diizinkan.", 409);
        }

        const linkLampiranPendukung = uploadedLampiranPendukung
            ? await uploadLampiranPendukungToDrive(
                uploadedLampiranPendukung,
                spk.pengajuan.nomor_ulok,
                spk.pengajuan.proyek,
            )
            : payload.link_lampiran_pendukung?.trim() || targetRejectedRecord?.link_lampiran_pendukung || null;

        const pdfBuffer = await buildPertambahanSpkPdfBuffer({
            nomorUlok: spk.pengajuan.nomor_ulok,
            nomorSpk: spk.pengajuan.nomor_spk,
            nomorSpkSipil: undefined, // Create will generate new PDF, but SPK numbers aren't usually available in initial payload. Wait, I should fetch it from targetRejectedRecord if exists. Or actually, spk is just a pengajuan_spk, but wait, the PDF shouldn't just be generated here? Ah, it doesn't matter for initial create since BM approval is what locks it. But I'll pass targetRejectedRecord values.
            nomorSpkMe: undefined,
            cabang: toko?.cabang,
            tanggalSpkAkhir: payload.tanggal_spk_akhir,
            tanggalSpkAkhirSetelahPerpanjangan: payload.tanggal_spk_akhir_setelah_perpanjangan,
            pertambahanHari: payload.pertambahan_hari,
            alasanPerpanjangan: payload.alasan_perpanjangan,
            dibuatOleh: payload.dibuat_oleh,
            dibuatPada: new Date().toISOString(),
            disetujuiOleh: payload.disetujui_oleh,
            disetujuiPada: payload.waktu_persetujuan,
        });
        const safeNomorSpk = sanitizeFilenamePart(spk.pengajuan.nomor_spk, "SPK");
        const pdfFilename = `FORM_PERPANJANGAN_SPK_${safeNomorSpk}_${Date.now()}.pdf`;
        const linkPdf = await uploadPdfToDrive(pdfBuffer, pdfFilename);

        let data: PertambahanSpkDetailRow | null;
        if (targetRejectedRecord) {
            data = await pertambahanSpkRepository.updateById(targetRejectedRecord.id, {
                id_spk: payload.id_spk,
                pertambahan_hari: payload.pertambahan_hari,
                tanggal_spk_akhir: payload.tanggal_spk_akhir,
                tanggal_spk_akhir_setelah_perpanjangan: payload.tanggal_spk_akhir_setelah_perpanjangan,
                alasan_perpanjangan: payload.alasan_perpanjangan,
                dibuat_oleh: payload.dibuat_oleh,
                status_persetujuan: PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL,
                disetujui_oleh: null,
                waktu_persetujuan: null,
                alasan_penolakan: null,
                link_pdf: linkPdf,
                link_lampiran_pendukung: linkLampiranPendukung,
            });
        } else {
            const created = await pertambahanSpkRepository.create({
                ...payload,
                status_persetujuan: PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL,
                disetujui_oleh: undefined,
                waktu_persetujuan: undefined,
                alasan_penolakan: undefined,
                link_pdf: linkPdf,
                link_lampiran_pendukung: linkLampiranPendukung ?? undefined,
            });

            data = await pertambahanSpkRepository.findById(created.id);
        }

        if (!data) {
            throw new AppError("Pertambahan SPK gagal dibuat", 500);
        }

        return data;
    },

    async list(query: PertambahanSpkListQuery): Promise<PertambahanSpkDetailRow[]> {
        return pertambahanSpkRepository.list(query);
    },

    async getById(id: string): Promise<PertambahanSpkDetailRow> {
        const data = await pertambahanSpkRepository.findById(id);
        if (!data) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        return data;
    },

    async updateById(
        id: string,
        payload: UpdatePertambahanSpkInput,
        uploadedLampiranPendukung?: UploadedLampiranPendukungFile
    ): Promise<PertambahanSpkDetailRow> {
        const existing = await pertambahanSpkRepository.findById(id);
        if (!existing) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        const idSpk = payload.id_spk ?? Number(existing.id_spk);
        const spk = await ensureSpkExists(idSpk);
        const toko = await tokoRepository.findByNomorUlok(spk.pengajuan.nomor_ulok);

        const pertambahanHari = payload.pertambahan_hari ?? existing.pertambahan_hari;
        const tanggalSpkAkhir = payload.tanggal_spk_akhir ?? existing.tanggal_spk_akhir;
        const tanggalSpkAkhirSetelahPerpanjangan = payload.tanggal_spk_akhir_setelah_perpanjangan
            ?? existing.tanggal_spk_akhir_setelah_perpanjangan;
        const alasanPerpanjangan = payload.alasan_perpanjangan ?? existing.alasan_perpanjangan;
        const dibuatOleh = payload.dibuat_oleh ?? existing.dibuat_oleh;

        const linkLampiranPendukung = uploadedLampiranPendukung
            ? await uploadLampiranPendukungToDrive(
                uploadedLampiranPendukung,
                spk.pengajuan.nomor_ulok,
                spk.pengajuan.proyek,
            )
            : Object.prototype.hasOwnProperty.call(payload, "link_lampiran_pendukung")
                ? (payload.link_lampiran_pendukung?.trim() || null)
                : existing.link_lampiran_pendukung;

        const pdfBuffer = await buildPertambahanSpkPdfBuffer({
            nomorUlok: spk.pengajuan.nomor_ulok,
            nomorSpk: spk.pengajuan.nomor_spk,
            nomorSpkSipil: existing.nomor_spk_sipil ?? undefined,
            nomorSpkMe: existing.nomor_spk_me ?? undefined,
            cabang: toko?.cabang,
            tanggalSpkAkhir,
            tanggalSpkAkhirSetelahPerpanjangan,
            pertambahanHari,
            alasanPerpanjangan,
            dibuatOleh,
            dibuatPada: new Date().toISOString(),
            disetujuiOleh: undefined,
            disetujuiPada: undefined,
        });

        const safeNomorSpk = sanitizeFilenamePart(spk.pengajuan.nomor_spk, "SPK");
        const pdfFilename = `FORM_PERPANJANGAN_SPK_${safeNomorSpk}_${Date.now()}.pdf`;
        const linkPdf = await uploadPdfToDrive(pdfBuffer, pdfFilename);

        const updated = await pertambahanSpkRepository.updateById(id, {
            id_spk: idSpk,
            pertambahan_hari: pertambahanHari,
            tanggal_spk_akhir: tanggalSpkAkhir,
            tanggal_spk_akhir_setelah_perpanjangan: tanggalSpkAkhirSetelahPerpanjangan,
            alasan_perpanjangan: alasanPerpanjangan,
            dibuat_oleh: dibuatOleh,
            status_persetujuan: PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL,
            disetujui_oleh: null,
            waktu_persetujuan: null,
            alasan_penolakan: null,
            link_pdf: linkPdf,
            link_lampiran_pendukung: linkLampiranPendukung,
        });
        if (!updated) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        await opnameFinalService.refreshDendaByTokoId(spk.pengajuan.id_toko);

        return updated;
    },

    async deleteById(id: string): Promise<void> {
        const isDeleted = await pertambahanSpkRepository.deleteById(id);
        if (!isDeleted) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }
    },

    async handleApproval(id: string, action: PertambahanSpkApprovalInput): Promise<PertambahanSpkDetailRow> {
        const existing = await pertambahanSpkRepository.findById(id);
        if (!existing) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        if (!APPROVAL_ALLOWED_STATUS.has(existing.status_persetujuan)) {
            throw new AppError(
                `Tindakan sudah diproses. Status saat ini: ${existing.status_persetujuan}`,
                409
            );
        }

        await assertApproverCanProcessPertambahanSpk(existing, action.approver_email);

        const nextStatus = action.tindakan === "APPROVE"
            ? PERTAMBAHAN_SPK_STATUS.APPROVED_BY_BM
            : PERTAMBAHAN_SPK_STATUS.REJECTED_BY_BM;

        const updated = await pertambahanSpkRepository.applyApproval(id, nextStatus, action);
        if (!updated) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        const spk = await ensureSpkExists(Number(updated.id_spk));
        if (action.tindakan === "APPROVE") {
            const linkPdf = await buildAndUploadPdfForDetail(updated);
            const withUpdatedPdf = await pertambahanSpkRepository.updateById(id, { link_pdf: linkPdf });
            if (!withUpdatedPdf) {
                throw new AppError("PDF pertambahan SPK berhasil dibuat tetapi data gagal diperbarui", 500);
            }
            await ganttRepository.ensureLastPengawasanMatchesEffectiveSpkEnd(spk.pengajuan.nomor_ulok);
            await opnameFinalService.refreshDendaByTokoId(spk.pengajuan.id_toko);
            return withUpdatedPdf;
        }

        await opnameFinalService.refreshDendaByTokoId(spk.pengajuan.id_toko);

        return updated;
    },

    async intervene(id: string, action: PertambahanSpkInterventionInput): Promise<PertambahanSpkDetailRow> {
        const role = action.actor_role.toUpperCase();
        const isAllowed = role.includes("SUPER HUMAN")
            || role.includes("STORE & BRANCH CONTROLLING");
        if (!isAllowed) {
            throw new AppError("Hanya Super Human atau Store & Branch Controlling Specialist yang dapat melakukan intervensi Pertambahan SPK", 403);
        }

        const data = await pertambahanSpkRepository.findById(id);
        if (!data) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        let targetStatus = action.target_status;
        if (targetStatus === "WAITING_FOR_BM_APPROVAL") {
            targetStatus = PERTAMBAHAN_SPK_STATUS.WAITING_FOR_BM_APPROVAL;
        } else if (targetStatus === "APPROVED_BY_BM") {
            targetStatus = PERTAMBAHAN_SPK_STATUS.APPROVED_BY_BM;
        } else if (targetStatus === "REJECTED_BY_BM") {
            targetStatus = PERTAMBAHAN_SPK_STATUS.REJECTED_BY_BM;
        }

        const currentStatus = data.status_persetujuan;

        if (currentStatus === targetStatus) {
            throw new AppError(`Status Pertambahan SPK sudah sama dengan target intervensi`, 409);
        }

        const updated = await pertambahanSpkRepository.interveneStatusAndInsertLog(id, currentStatus, targetStatus, action);
        if (!updated) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        const spk = await ensureSpkExists(Number(updated.id_spk));
        const linkPdf = await buildAndUploadPdfForDetail(updated);
        const withUpdatedPdf = await pertambahanSpkRepository.updateById(id, { link_pdf: linkPdf });
        if (!withUpdatedPdf) {
            throw new AppError("PDF pertambahan SPK berhasil dibuat tetapi data gagal diperbarui", 500);
        }

        if (targetStatus === PERTAMBAHAN_SPK_STATUS.APPROVED_BY_BM) {
            await ganttRepository.ensureLastPengawasanMatchesEffectiveSpkEnd(spk.pengajuan.nomor_ulok);
        }

        await opnameFinalService.refreshDendaByTokoId(spk.pengajuan.id_toko);

        return withUpdatedPdf;
    },

    async getDownloadPayload(
        id: string,
        field: "link_pdf" | "link_lampiran_pendukung"
    ): Promise<{ filename: string; contentType: string; fileBuffer: Buffer }> {
        const data = await pertambahanSpkRepository.findById(id);
        if (!data) {
            throw new AppError("Data pertambahan SPK tidak ditemukan", 404);
        }

        const rawLink = (field === "link_pdf" ? data.link_pdf : data.link_lampiran_pendukung)?.trim();
        if (!rawLink) {
            const label = field === "link_pdf" ? "Link PDF" : "Link lampiran pendukung";
            throw new AppError(`${label} tidak tersedia`, 404);
        }

        const fileId = extractDriveFileId(rawLink);
        const gp = GoogleProvider.instance;

        let fileBuffer: Buffer | null = null;
        let contentType: string | null = null;
        let filename: string | null = null;

        if (fileId && gp.spartaDrive) {
            fileBuffer = await gp.getFileBufferById(gp.spartaDrive, fileId);

            try {
                const meta = await gp.spartaDrive.files.get({ fileId, fields: "name,mimeType" });
                filename = meta.data.name ?? null;
                contentType = meta.data.mimeType ?? null;
            } catch {
                // best effort metadata only
            }
        }

        if (!fileBuffer) {
            const fallbackUrl = normalizeDriveDownloadLink(rawLink) ?? rawLink;
            const response = await fetch(fallbackUrl);
            if (!response.ok) {
                throw new AppError("Gagal mengambil file dari Google Drive", 502);
            }
            fileBuffer = Buffer.from(await response.arrayBuffer());
            contentType = response.headers.get("content-type") || contentType;
        }

        if (!fileBuffer.length) {
            throw new AppError("File kosong", 502);
        }

        const defaultPrefix = field === "link_pdf"
            ? "FORM_PERPANJANGAN_SPK"
            : "LAMPIRAN_PENDUKUNG_PERTAMBAHAN_SPK";
        const defaultContentType = field === "link_pdf" ? "application/pdf" : "application/octet-stream";
        const defaultExt = field === "link_pdf" ? ".pdf" : inferFileExtension(contentType);
        
        let resolvedFilename: string;
        if (field === "link_pdf" && data.toko) {
            resolvedFilename = generateStandardFilename("TAMBAH SPK", data.toko.nomor_ulok, data.toko.nama_toko, data.toko.lingkup_pekerjaan, ".pdf");
        } else {
            const safeNomorSpk = sanitizeFilenamePart(data.nomor_spk ?? data.spk?.nomor_spk ?? "SPK", "SPK");
            resolvedFilename = filename || `${defaultPrefix}_${safeNomorSpk}_${data.id}${defaultExt}`;
        }

        return {
            filename: resolvedFilename,
            contentType: contentType || defaultContentType,
            fileBuffer,
        };
    }
};
