import { AppError } from "../../common/app-error";
import { normalizeProjectByUlok } from "../../common/project-type";
import * as xlsx from "xlsx";
import { tokoRepository } from "../toko/toko.repository";
import { picPengawasanService } from "../pic-pengawasan/pic-pengawasan.service";
import { rabRepository } from "../rab/rab.repository";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { GANTT_STATUS } from "./gantt.constants";
import { ganttRepository } from "./gantt.repository";
import { spkRepository } from "../spk/spk.repository";
import { SPK_APPROVED_STATUSES } from "../spk/spk.constants";
import { opnameService, uploadFotoOpnameToDrive } from "../opname/opname.service";
import { uploadDokumentasiToDrive } from "../pengawasan/pengawasan.service";
import { pool } from "../../db/pool";
import type {
    AddDayItemsInput,
    CreateGanttNoteInput,
    DayGanttItemInput,
    GanttInterventionInput,
    GanttListQuery,
    ManagePengawasanInput,
    SubmitGanttInput,
    UpdateGanttInput,
    UpdateKecepatanInput,
    UpdateKeterlambatanInput,
    SubmitTakeoverInspectionInput
} from "./gantt.schema";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const normalizeKategoriKey = (value: string) =>
    value
        .trim()
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, " ")
        .toUpperCase();

const appendUniqueKategori = (kategoriList: string[], kategori: string) => {
    const cleanKategori = kategori.trim();
    const key = normalizeKategoriKey(cleanKategori);
    if (!key) return;

    const exists = kategoriList.some((existing) => normalizeKategoriKey(existing) === key);
    if (!exists) kategoriList.push(cleanKategori);
};

const includeDependencyCategories = (
    kategoriList: string[],
    dependencies?: Array<{ kategori_pekerjaan: string; kategori_pekerjaan_terikat: string }>
) => {
    if (!dependencies) return;

    dependencies.forEach((dependency) => {
        appendUniqueKategori(kategoriList, dependency.kategori_pekerjaan);
        appendUniqueKategori(kategoriList, dependency.kategori_pekerjaan_terikat);
    });
};

const normalizeUpdateDayItems = (dayItems?: UpdateGanttInput["day_items"]): DayGanttItemInput[] | undefined => {
    if (!dayItems) return undefined;

    return dayItems.map((item: NonNullable<UpdateGanttInput["day_items"]>[number], index: number) => {
        if (!item.h_awal || !item.h_akhir) {
            throw new AppError(
                `day_items[${index}] wajib memiliki h_awal dan h_akhir`,
                400
            );
        }

        return {
            kategori_pekerjaan: item.kategori_pekerjaan,
            h_awal: item.h_awal,
            h_akhir: item.h_akhir,
            keterlambatan: item.keterlambatan,
            kecepatan: item.kecepatan,
        };
    });
};

const normalizeUpdateKategoriPekerjaan = (
    kategori?: UpdateGanttInput["kategori_pekerjaan"]
): string[] | undefined => {
    if (!kategori || kategori.length === 0) return undefined;
    return kategori;
};

const deriveKategoriPekerjaanFromDayItems = (
    dayItems?: DayGanttItemInput[]
): string[] | undefined => {
    if (!dayItems || dayItems.length === 0) return undefined;

    const uniqueKategori = Array.from(
        new Set(
            dayItems
                .map((item) => item.kategori_pekerjaan)
                .filter((value): value is string => Boolean(value && value.trim()))
        )
    );

    return uniqueKategori.length > 0 ? uniqueKategori : undefined;
};

const normalizeUpdatePengawasan = (
    pengawasan?: UpdateGanttInput["pengawasan"]
): UpdateGanttInput["pengawasan"] | undefined => {
    if (!pengawasan || pengawasan.length === 0) return undefined;
    return pengawasan;
};

const releaseRabApprovalAfterGantt = async (tokoId: number, source: string) => {
    const releasedCount = await rabRepository.releaseWaitingGanttByTokoId(tokoId);
    if (releasedCount > 0) {
        console.log(`[GANTT ${source}] RAB masuk antrean approval setelah Gantt tersedia`, {
            tokoId,
            releasedCount
        });
    }
};

const isScopeReadyForSerahTerima = (scope: any) => {
    const hasGanttAndOpname = Boolean(scope.gantt_id) && Boolean(scope.opname_final_id);
    if (!hasGanttAndOpname) return false;

    // Escape hatch untuk data migrasi V1: opname_final APPROVED dianggap sudah final.
    if (scope.status_opname_final === "APPROVED") {
        return true;
    }

    const checkpoints = Array.isArray(scope.checkpoints) ? scope.checkpoints : [];
    const opnameItems = checkpoints.reduce((sum: number, checkpoint: any) => sum + Number(checkpoint?.opname_items || 0), 0);
    const readyOpnameItems = checkpoints.reduce((sum: number, checkpoint: any) => sum + Number(checkpoint?.ready_opname_items || 0), 0);
    const missingPengawasan = Number(scope.missing_pengawasan_checkpoints || 0);

    return opnameItems > 0 && readyOpnameItems === 0 && missingPengawasan === 0;
};

const normalizePengawasanDate = (value: any): string => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
    if (slashMatch) {
        const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
        return `${slashMatch[1].padStart(2, "0")}/${slashMatch[2].padStart(2, "0")}/${year}`;
    }

    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
    if (isoMatch) {
        return `${isoMatch[3].padStart(2, "0")}/${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
    }

    return raw;
};

const parseDateKey = (value: string): number => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalizePengawasanDate(value));
    if (!match) return Number.MAX_SAFE_INTEGER;
    return Number(`${match[3]}${match[2]}${match[1]}`);
};

const sortDates = (dates: string[]) =>
    [...dates].map(normalizePengawasanDate).filter(Boolean).sort((left, right) => parseDateKey(left) - parseDateKey(right));

const normalizeScopeName = (scope: any): string =>
    String(scope?.lingkup_pekerjaan || "").trim().toUpperCase();

const getScopeCheckpoints = (scope: any): any[] =>
    Array.isArray(scope?.checkpoints) ? scope.checkpoints : [];

const buildUnifiedSupervisionMetadata = (scopes: any[]) => {
    const activeScopes = scopes.filter((scope) => scope.gantt_id);
    const sipilScope = activeScopes.find((scope) => normalizeScopeName(scope) === "SIPIL");
    const meScope = activeScopes.find((scope) => normalizeScopeName(scope) === "ME");
    const masterScope = sipilScope ?? meScope ?? activeScopes[0] ?? scopes[0];
    const masterScopeName = sipilScope && meScope
        ? "SIPIL"
        : normalizeScopeName(masterScope) || "single";

    const allDates = new Set<string>();
    activeScopes.forEach((scope) => {
        getScopeCheckpoints(scope).forEach((checkpoint) => {
            const dateStr = normalizePengawasanDate(checkpoint.tanggal_pengawasan);
            if (dateStr) allDates.add(dateStr);
        });
    });
    const masterDates = sortDates([...allDates]);

    const dateSetByScope = new Map<number, Set<string>>();
    const checkpointByScopeAndDate = new Map<number, Map<string, any>>();

    activeScopes.forEach((scope) => {
        const dateSet = new Set<string>();
        const checkpointByDate = new Map<string, any>();

        getScopeCheckpoints(scope).forEach((checkpoint) => {
            if (!checkpoint?.tanggal_pengawasan) return;
            const dateKey = normalizePengawasanDate(checkpoint.tanggal_pengawasan);
            if (!dateKey) return;
            dateSet.add(dateKey);
            checkpointByDate.set(dateKey, {
                ...checkpoint,
                tanggal_pengawasan: dateKey,
            });
        });

        dateSetByScope.set(Number(scope.id_toko), dateSet);
        checkpointByScopeAndDate.set(Number(scope.id_toko), checkpointByDate);
    });

    const scopeDateAlignment = activeScopes.map((scope) => {
        const scopeDates = dateSetByScope.get(Number(scope.id_toko)) ?? new Set<string>();
        const masterDateSet = new Set(masterDates);

        return {
            id_toko: scope.id_toko,
            gantt_id: scope.gantt_id,
            lingkup_pekerjaan: scope.lingkup_pekerjaan,
            is_master: Number(scope.id_toko) === Number(masterScope?.id_toko),
            missing_from_scope: sortDates(masterDates.filter((date) => !scopeDates.has(date))),
            extra_in_scope: sortDates([...scopeDates].filter((date) => !masterDateSet.has(date))),
        };
    });

    const unifiedCheckpoints = masterDates.map((date) => {
        const scopeCheckpoints = activeScopes.map((scope) => {
            const checkpoint = checkpointByScopeAndDate.get(Number(scope.id_toko))?.get(date) ?? null;
            return {
                id_toko: scope.id_toko,
                gantt_id: scope.gantt_id,
                lingkup_pekerjaan: scope.lingkup_pekerjaan,
                checkpoint,
            };
        });

        return {
            tanggal_pengawasan: date,
            total_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.total_items || 0), 0),
            selesai_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.selesai_items || 0), 0),
            documented_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.documented_items || 0), 0),
            missing_documentation_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.missing_documentation_items || 0), 0),
            ready_opname_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.ready_opname_items || 0), 0),
            opname_items: scopeCheckpoints.reduce((sum, item) => sum + Number(item.checkpoint?.opname_items || 0), 0),
            scopes: scopeCheckpoints,
        };
    });

    return {
        master_scope: masterScopeName,
        master_scope_id_toko: masterScope?.id_toko ?? null,
        master_gantt_id: masterScope?.gantt_id ?? null,
        unified_dates: masterDates,
        unified_checkpoints: unifiedCheckpoints,
        scope_date_alignment: scopeDateAlignment,
        has_date_mismatch: scopeDateAlignment.some((scope) =>
            scope.missing_from_scope.length > 0 || scope.extra_in_scope.length > 0
        ),
    };
};

async function autoSyncPicPengawasanForGantt(
    tokoId: number, 
    ganttId: number, 
    nomorUlok: string
) {
    try {
        const { tokoRepository } = await import("../toko/toko.repository");
        const siblings = await tokoRepository.findAllByNomorUlok(nomorUlok);
        if (siblings.length <= 1) return;

        let sourcePicInfo: { pic: any, dates: string[] } | null = null;
        for (const sibling of siblings) {
            if (sibling.id === tokoId) continue;
            
            const { ganttRepository } = await import("./gantt.repository");
            const siblingGantt = await ganttRepository.findLatestActiveByTokoId(sibling.id);
            if (!siblingGantt) continue;
            
            const pgList = await ganttRepository.getPengawasanGanttByIdGantt(siblingGantt.id);
            if (pgList.length === 0) continue;
            
            const picId = pgList.find(p => p.id_pic_pengawasan)?.id_pic_pengawasan;
            if (picId) {
                const { picPengawasanService } = await import("../pic-pengawasan/pic-pengawasan.service");
                const pic = await picPengawasanService.getById(String(picId));
                if (pic) {
                    sourcePicInfo = {
                        pic,
                        dates: pgList.map(p => p.tanggal_pengawasan)
                    };
                    break;
                }
            }
        }
        
        if (!sourcePicInfo) return;
        
        const { pool } = await import("../../db/pool");
        const spkRes = await pool.query(`SELECT id, durasi, waktu_mulai FROM pengajuan_spk WHERE id_toko = $1 AND UPPER(TRIM(COALESCE(status, ''))) IN ('DISETUJUI', 'APPROVED') ORDER BY id DESC LIMIT 1`, [tokoId]);
        const currentSpk = spkRes.rows[0];
        if (!currentSpk) return;
        
        const rabRes = await pool.query(`SELECT id FROM rab WHERE id_toko = $1 AND UPPER(TRIM(COALESCE(status, ''))) IN ('DISETUJUI', 'APPROVED') ORDER BY id DESC LIMIT 1`, [tokoId]);
        const currentRabId = rabRes.rows[0]?.id;
        if (!currentRabId) return;

        const { picPengawasanService } = await import("../pic-pengawasan/pic-pengawasan.service");
        const newPic = await picPengawasanService.create({
            id_toko: tokoId,
            nomor_ulok: nomorUlok,
            id_rab: currentRabId,
            id_spk: currentSpk.id,
            kategori_lokasi: sourcePicInfo.pic.kategori_lokasi || '-',
            durasi: currentSpk.durasi ? `${currentSpk.durasi} Hari` : sourcePicInfo.pic.durasi,
            tanggal_mulai_spk: currentSpk.waktu_mulai || sourcePicInfo.pic.tanggal_mulai_spk,
            plc_building_support: sourcePicInfo.pic.plc_building_support,
        });

        const { ganttRepository } = await import("./gantt.repository");
        await ganttRepository.addPengawasan(
            String(ganttId), 
            sourcePicInfo.dates, 
            newPic.id
        );
        
        console.log(`[AutoSync] Successfully synced PIC Pengawasan from sibling to Gantt ${ganttId}`);
    } catch (e) {
        console.error(`[AutoSync] Failed to sync PIC Pengawasan for Gantt ${ganttId}:`, e);
    }
}

export const ganttService = {
    async getSupervisionWorkspace(nomorUlok: string, takeoverSequence?: number) {
        const scopes = await ganttRepository.findSupervisionWorkspace(nomorUlok, takeoverSequence);
        if (scopes.length === 0) {
            throw new AppError("ULOK tidak ditemukan", 404);
        }
        
        let tanggalTakeover: string | null = null;
        try {
            const { rows } = await pool.query(
                `SELECT tanggal_takeover FROM takeover_inspections WHERE nomor_ulok = $1 ORDER BY id DESC LIMIT 1`,
                [nomorUlok]
            );
            if (rows.length > 0) {
                tanggalTakeover = rows[0].tanggal_takeover;
            }
        } catch (e) {
            console.error("Error fetching tanggal_takeover:", e);
        }

        const unifiedMetadata = buildUnifiedSupervisionMetadata(scopes);
        const activeScopes = scopes.filter((scope) => scope.gantt_id);
        const allActiveScopesReady = activeScopes.length > 0
            && activeScopes.every((scope) => isScopeReadyForSerahTerima(scope));
        const masterScopeHasGeneratedPdf = activeScopes.some((scope) =>
            scope.id_toko === unifiedMetadata.master_scope_id_toko
            && Boolean(scope.link_pdf_serah_terima)
        );
        const allReadyScopesGenerated = allActiveScopesReady
            && masterScopeHasGeneratedPdf;
        const allActiveScopesHaveExistingPdf = activeScopes.length > 0
            && activeScopes.every((scope) => Boolean(scope.link_pdf_serah_terima));

        return {
            nomor_ulok: nomorUlok,
            nama_toko: scopes[0]?.nama_toko ?? null,
            kode_toko: scopes[0]?.kode_toko ?? null,
            cabang: scopes[0]?.cabang ?? null,
            pic_bersama: scopes.find((scope) => scope.plc_building_support)?.plc_building_support ?? null,
            tanggal_takeover: tanggalTakeover,
            scopes,
            serah_terima_ready: scopes
                .filter((scope) => scope.gantt_id)
                .some((scope) => isScopeReadyForSerahTerima(scope)),
            serah_terima_generated: scopes
                .filter((scope) => scope.gantt_id)
                .some((scope) => Boolean(scope.link_pdf_serah_terima)),
            unified_serah_terima_ready: allActiveScopesReady,
            unified_serah_terima_generated: allReadyScopesGenerated || allActiveScopesHaveExistingPdf,
            ...unifiedMetadata,
        };
    },
    async submit(payload: SubmitGanttInput) {
        const kategoriPekerjaan = [...payload.kategori_pekerjaan];
        includeDependencyCategories(kategoriPekerjaan, payload.dependencies);
        const normalizedProject = normalizeProjectByUlok(payload.nomor_ulok, payload.proyek);

        // 1. Jika sudah ada gantt aktif untuk ULOK ini, lakukan replace data (bukan create baru)

        const existingToko = await tokoRepository.findByNomorUlokAndLingkup(
            payload.nomor_ulok,
            payload.lingkup_pekerjaan,
            payload.takeover_sequence
        );

        if (existingToko) {
            const activeGantt = await ganttRepository.findLatestActiveByTokoId(existingToko.id);
            if (activeGantt) {
                await ganttRepository.updateTokoFieldsById(existingToko.id, {
                    lingkup_pekerjaan: payload.lingkup_pekerjaan,
                    nama_toko: payload.nama_toko,
                    kode_toko: payload.kode_toko,
                    proyek: normalizedProject,
                    cabang: payload.cabang,
                });

                await ganttRepository.updateWithDetails(String(activeGantt.id), {
                    kategori_pekerjaan: kategoriPekerjaan,
                    day_items: payload.day_items,
                    pengawasan: payload.pengawasan,
                    dependencies: payload.dependencies,
                });

                const refreshed = await ganttRepository.findById(String(activeGantt.id));
                if (!refreshed) {
                    throw new AppError("Gantt Chart tidak ditemukan setelah update", 500);
                }

                await releaseRabApprovalAfterGantt(existingToko.id, "SUBMIT");

                await autoSyncPicPengawasanForGantt(refreshed.gantt.id_toko, refreshed.gantt.id, payload.nomor_ulok);

                return {
                    ...refreshed.gantt,
                    toko_id: refreshed.gantt.id_toko,
                };
            }
        }

        // 2. Jika belum ada gantt aktif, buat data baru
        const gantt = await ganttRepository.createWithDetails({
            // toko fields
            nomor_ulok: payload.nomor_ulok,
            takeover_sequence: payload.takeover_sequence,
            lingkup_pekerjaan: payload.lingkup_pekerjaan,
            nama_toko: payload.nama_toko,
            kode_toko: payload.kode_toko,
            proyek: normalizedProject,
            cabang: payload.cabang,
            // gantt fields
            email_pembuat: payload.email_pembuat,
            status: GANTT_STATUS.ACTIVE,
            // children
            kategori_pekerjaan: kategoriPekerjaan,
            day_items: payload.day_items,
            pengawasan: payload.pengawasan,
            dependencies: payload.dependencies
        });

        await releaseRabApprovalAfterGantt(gantt.toko_id, "SUBMIT");

        await autoSyncPicPengawasanForGantt(gantt.toko_id, gantt.id, payload.nomor_ulok);

        return gantt;
    },

    async list(query: GanttListQuery) {
        return ganttRepository.list(query);
    },

    async getById(id: string, idToko?: number) {
        const data = await ganttRepository.findById(id, idToko);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }
        return data;
    },

    async listNotes(id: string) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        return ganttRepository.listNotes(id);
    },

    async createNote(id: string, payload: CreateGanttNoteInput) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        return ganttRepository.createNote(id, payload);
    },

    async update(id: string, payload: UpdateGanttInput) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        if (data.gantt.status === GANTT_STATUS.TERKUNCI) {
            throw new AppError("Gantt Chart sudah terkunci, tidak bisa diubah", 409);
        }

        const normalizedDayItems = normalizeUpdateDayItems(payload.day_items);
        const normalizedKategoriPekerjaan =
            normalizeUpdateKategoriPekerjaan(payload.kategori_pekerjaan)
            ?? deriveKategoriPekerjaanFromDayItems(normalizedDayItems);
        if (normalizedKategoriPekerjaan) {
            includeDependencyCategories(normalizedKategoriPekerjaan, payload.dependencies);
        }
        const normalizedPengawasan = normalizeUpdatePengawasan(payload.pengawasan);

        const shouldReplaceMainData = Boolean(
            normalizedKategoriPekerjaan
            && normalizedDayItems
            && normalizedKategoriPekerjaan.length > 0
            && normalizedDayItems.length > 0
        );

        await ganttRepository.updateWithDetails(id, {
            kategori_pekerjaan: shouldReplaceMainData ? normalizedKategoriPekerjaan : undefined,
            day_items: shouldReplaceMainData ? normalizedDayItems : undefined,
            pengawasan: normalizedPengawasan,
            dependencies: payload.dependencies,
        });

        return ganttRepository.findById(id);
    },

    async lock(id: string, email: string) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        const tokoStableFields = {
            kode_toko: data.toko.kode_toko,
            alamat: data.toko.alamat,
            nama_kontraktor: data.toko.nama_kontraktor,
        };

        if (data.gantt.status === GANTT_STATUS.TERKUNCI) {
            throw new AppError("Gantt Chart sudah terkunci", 409);
        }

        try {
            await ganttRepository.updateStatus(id, GANTT_STATUS.TERKUNCI);
        } finally {
            await ganttRepository.restoreTokoStableFieldsByGanttId(id, tokoStableFields);
        }

        await releaseRabApprovalAfterGantt(data.gantt.id_toko, "LOCK");

        return {
            id,
            old_status: data.gantt.status,
            new_status: GANTT_STATUS.TERKUNCI,
            locked_by: email
        };
    },

    async intervene(id: string, action: GanttInterventionInput) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        if (data.gantt.status === action.target_status) {
            throw new AppError("Status Gantt Chart sudah sama dengan target intervensi", 409);
        }

        const tokoStableFields = {
            kode_toko: data.toko.kode_toko,
            alamat: data.toko.alamat,
            nama_kontraktor: data.toko.nama_kontraktor,
        };

        try {
            await ganttRepository.updateStatus(id, action.target_status);
        } finally {
            await ganttRepository.restoreTokoStableFieldsByGanttId(id, tokoStableFields);
        }

        if (action.target_status === GANTT_STATUS.TERKUNCI) {
            await releaseRabApprovalAfterGantt(data.gantt.id_toko, "INTERVENTION");
        }

        await activityLogRepository.insert({
            entity_type: "GANTT",
            entity_id: Number(id),
            actor_email: action.actor_email,
            actor_role: action.actor_role,
            action: "INTERVENTION",
            status_before: data.gantt.status,
            status_after: action.target_status,
            reason: action.alasan_intervensi,
            metadata: {
                id_toko: data.gantt.id_toko,
                nomor_ulok: data.toko.nomor_ulok,
                source: "super_human_intervention",
            },
        });

        return {
            id,
            old_status: data.gantt.status,
            new_status: action.target_status,
        };
    },

    async remove(id: string) {
        const data = await ganttRepository.findById(id);
        if (!data) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        if (data.gantt.status === GANTT_STATUS.TERKUNCI) {
            throw new AppError("Gantt Chart sudah terkunci, tidak bisa dihapus", 409);
        }

        await ganttRepository.deleteById(id);
        return { id, deleted: true };
    },

    async addDayItems(id: string, payload: AddDayItemsInput) {
        const status = await ganttRepository.findStatusById(id);
        if (status === null) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }
        if (status === GANTT_STATUS.TERKUNCI) {
            throw new AppError("Gantt Chart sudah terkunci", 409);
        }

        const inserted = await ganttRepository.addDayItems(id, payload.day_items);
        return { inserted };
    },

    async updateKeterlambatan(id: string, payload: UpdateKeterlambatanInput) {
        const status = await ganttRepository.findStatusById(id);
        if (status === null) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        const updates = payload.updates && payload.updates.length > 0
            ? payload.updates
            : payload.kategori_pekerjaan !== undefined && payload.keterlambatan !== undefined
                ? [{
                    kategori_pekerjaan: payload.kategori_pekerjaan,
                    keterlambatan: payload.keterlambatan
                }]
                : [];

        if (updates.length === 0) {
            throw new AppError(
                "Payload tidak valid, isi 'updates' atau 'kategori_pekerjaan' + 'keterlambatan'",
                400
            );
        }

        const updatedCategories: Array<{
            kategori_pekerjaan: string;
            keterlambatan: string;
            day_ids: number[];
        }> = [];
        const notFoundCategories: string[] = [];

        for (const item of updates) {
            const result = await ganttRepository.updateKeterlambatan(
                id,
                item.kategori_pekerjaan,
                item.keterlambatan
            );

            if (!result) {
                notFoundCategories.push(item.kategori_pekerjaan);
                continue;
            }

            updatedCategories.push({
                kategori_pekerjaan: item.kategori_pekerjaan,
                keterlambatan: item.keterlambatan,
                day_ids: result.day_ids
            });
        }

        if (updatedCategories.length === 0 && !payload.next_tanggal_pengawasan) {
            throw new AppError("Kategori pekerjaan tidak ditemukan pada gantt ini", 404);
        }

        const delayTargetPengawasan = await ganttRepository.ensureDelayTargetPengawasan(
            id,
            payload.next_tanggal_pengawasan,
            true // Gunakan target ST (termasuk delay keterlambatan) sebagai fallback
        );

        return {
            total_rows_updated: updatedCategories.reduce(
                (sum, item) => sum + item.day_ids.length,
                0
            ),
            updated_categories: updatedCategories,
            not_found_categories: notFoundCategories,
            delay_target_pengawasan: delayTargetPengawasan
        };
    },

    async updateKecepatan(id: string, payload: UpdateKecepatanInput) {
        const status = await ganttRepository.findStatusById(id);
        if (status === null) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        const result = await ganttRepository.updateKecepatan(
            id,
            payload.kategori_pekerjaan,
            payload.h_awal,
            payload.h_akhir,
            payload.kecepatan
        );

        if (!result) {
            throw new AppError("Day item tidak ditemukan untuk kombinasi tersebut", 404);
        }

        return { day_id: result.day_id, kecepatan: payload.kecepatan };
    },

    async managePengawasan(id: string, payload: ManagePengawasanInput) {
        const status = await ganttRepository.findStatusById(id);
        if (status === null) {
            throw new AppError("Gantt Chart tidak ditemukan", 404);
        }

        const gantt = await ganttRepository.findById(id);
        if (gantt) {
            const { rows: takeoverRows } = await pool.query(
                `SELECT 1 FROM takeover_inspections WHERE nomor_ulok = $1 LIMIT 1`,
                [gantt.toko.nomor_ulok]
            );
            if (takeoverRows.length > 0) {
                throw new AppError("ULOK ini sudah di-takeover. Tidak dapat mengisi pengawasan lagi.", 403);
            }

            const isSpkApproved = await spkRepository.existsApprovedByUlokAndLingkup(
                gantt.toko.nomor_ulok,
                gantt.toko.lingkup_pekerjaan ?? ""
            );
            if (!isSpkApproved) {
                throw new AppError("SPK untuk lingkup ini belum disetujui (Approved). Tidak dapat mengisi pengawasan.", 403);
            }
        }

        if (payload.tanggal_pengawasan) {
            const tanggalList = Array.isArray(payload.tanggal_pengawasan)
                ? payload.tanggal_pengawasan
                : [payload.tanggal_pengawasan];

            let idPicPengawasan: number | undefined;
            if (payload.pic_pengawasan) {
                const pic = await picPengawasanService.create(payload.pic_pengawasan);
                idPicPengawasan = pic.id;
            }

            const result = await ganttRepository.addPengawasan(id, tanggalList, idPicPengawasan);
            return {
                action: "added" as const,
                inserted: result.inserted,
                ids: result.ids,
                id_pic_pengawasan: idPicPengawasan ?? null
            };
        }

        if (payload.remove_tanggal_pengawasan) {
            await ganttRepository.removePengawasan(id, payload.remove_tanggal_pengawasan);
            return { action: "removed" as const };
        }

        throw new AppError(
            "Field 'tanggal_pengawasan' atau 'remove_tanggal_pengawasan' wajib diisi",
            400
        );
    },

    async getDetailByTokoId(idToko: number) {
        const data = await ganttRepository.findDetailByTokoId(idToko);
        if (!data) {
            throw new AppError("Toko tidak ditemukan", 404);
        }
        return data;
    },

    async previewMigrationExcel(buffer: Buffer) {
        const workbook = xlsx.read(buffer, { type: "buffer" });

        const sheetGantt = workbook.Sheets['gantt_chart'] || workbook.Sheets[workbook.SheetNames[0]];
        const sheetDay   = workbook.Sheets['day_gantt_chart'];

        if (!sheetGantt) {
            throw new AppError("File Excel kosong atau sheet gantt_chart tidak ditemukan", 400);
        }

        const ganttRows = xlsx.utils.sheet_to_json<any>(sheetGantt, { defval: "", raw: false });
        const dayRows   = sheetDay ? xlsx.utils.sheet_to_json<any>(sheetDay, { defval: "", raw: false }) : [];

        if (!ganttRows || ganttRows.length === 0) {
            throw new AppError("Sheet gantt_chart kosong atau tidak valid", 400);
        }

        let readyCount   = 0;
        let skippedCount = 0;
        const details: Array<{ nomor_ulok: string; lingkup_pekerjaan: string; status: string; sheet_count?: number }> = [];

        for (const gRow of ganttRows) {
            const noUlok  = String(gRow["Nomor Ulok"]       || "").trim();
            const lingkup = String(gRow["Lingkup_Pekerjaan"] || "").trim();
            if (!noUlok) continue;

            // Hitung baris di day_gantt_chart yang cocok
            const dayCount = dayRows.filter(r =>
                String(r["Nomor Ulok"] || "").trim() === noUlok &&
                String(r["Lingkup_Pekerjaan"] || "").trim() === lingkup
            ).length;

            const existingToko = await tokoRepository.findByNomorUlokAndLingkup(noUlok, lingkup);
            if (existingToko) {
                const existingGantt = await ganttRepository.findLatestByTokoId(existingToko.id);
                if (existingGantt) {
                    skippedCount++;
                    details.push({ nomor_ulok: noUlok, lingkup_pekerjaan: lingkup, status: "Di-skip (Sudah ada Gantt)", sheet_count: dayCount });
                    continue;
                }
            }

            readyCount++;
            details.push({ nomor_ulok: noUlok, lingkup_pekerjaan: lingkup, status: "Siap Insert", sheet_count: dayCount });
        }

        return {
            total_groups:  ganttRows.length,
            ready_count:   readyCount,
            skipped_count: skippedCount,
            details,
            total_rows:    dayRows.length,
        };
    },

    async commitMigrationExcel(buffer: Buffer, emailPembuat: string, limit?: number) {
        const workbook = xlsx.read(buffer, { type: "buffer" });
        
        // Baca 3 sheet yang saling berkaitan
        const sheetGantt = workbook.Sheets['gantt_chart'] || workbook.Sheets[workbook.SheetNames[0]];
        const sheetDay = workbook.Sheets['day_gantt_chart'];
        const sheetDep = workbook.Sheets['dependency_gantt'];

        if (!sheetGantt) {
            throw new AppError("File Excel kosong atau sheet gantt_chart tidak ditemukan", 400);
        }

        // Parse semua sheet sekaligus
        const ganttRows = xlsx.utils.sheet_to_json<any>(sheetGantt, { defval: "", raw: false });
        const dayRows  = sheetDay ? xlsx.utils.sheet_to_json<any>(sheetDay,  { defval: "", raw: false }) : [];
        const depRows  = sheetDep ? xlsx.utils.sheet_to_json<any>(sheetDep,  { defval: "", raw: false }) : [];

        if (!ganttRows || ganttRows.length === 0) {
            throw new AppError("Sheet gantt_chart kosong atau tidak valid", 400);
        }

        const parseDateString = (val: any): string => {
            if (!val) return "";
            if (typeof val === 'number') {
                const date = new Date((val - 25569) * 86400 * 1000);
                const yyyy = date.getFullYear();
                const mm   = String(date.getMonth() + 1).padStart(2, '0');
                const dd   = String(date.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
            let dateStr = String(val).trim();
            if (dateStr.includes("/")) {
                const parts = dateStr.split("/");
                if (parts.length === 3) {
                    let yyyy = parts[2];
                    if (yyyy.length === 2) yyyy = `20${yyyy}`;
                    return `${yyyy}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            if (dateStr.includes("-")) {
                const parts = dateStr.split("-");
                if (parts.length === 3 && parts[0].length <= 2) {
                    let yyyy = parts[2];
                    if (yyyy.length === 2) yyyy = `20${yyyy}`;
                    return `${yyyy}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            return dateStr;
        };

        const isDatePattern = /^\d{4}-\d{2}-\d{2}$/;
        let insertedCount = 0;
        let skippedCount  = 0;

        for (const gRow of ganttRows) {
            if (limit !== undefined && insertedCount >= limit) break;

            const noUlok = String(gRow["Nomor Ulok"] || "").trim();
            const lingkup = String(gRow["Lingkup_Pekerjaan"] || "").trim();
            if (!noUlok) continue;

            // Cek duplikasi
            const existingToko = await tokoRepository.findByNomorUlokAndLingkup(noUlok, lingkup);
            if (existingToko) {
                const existingGantt = await ganttRepository.findLatestByTokoId(existingToko.id);
                if (existingGantt) { skippedCount++; continue; }
            }

            // ─── 1. Kategori Pekerjaan (dari kolom Kategori_1 … Kategori_30) ────────
            const kategoriPekerjaan: string[] = [];
            for (let i = 1; i <= 30; i++) {
                const kName = String(gRow[`Kategori_${i}`] || "").trim();
                appendUniqueKategori(kategoriPekerjaan, kName);
            }

            // ─── 2. Day Items (dari sheet day_gantt_chart) ────────────────────────────
            const groupDayRows = dayRows.filter(r =>
                String(r["Nomor Ulok"] || "").trim() === noUlok &&
                String(r["Lingkup_Pekerjaan"] || "").trim() === lingkup
            );

            const rawItems = groupDayRows.map(row => ({
                kategori_pekerjaan: String(row["Kategori"] || "").trim(),
                raw_h_awal: parseDateString(row["h_awal"]),
                raw_h_akhir: parseDateString(row["h_akhir"]),
                keterlambatan: (row["keterlambatan"] !== undefined && row["keterlambatan"] !== "") ? String(row["keterlambatan"]) : null,
                kecepatan:     (row["kecepatan"]     !== undefined && row["kecepatan"]     !== "") ? String(row["kecepatan"])     : null,
            })).filter(item => item.kategori_pekerjaan && item.raw_h_awal && item.raw_h_akhir);

            if (rawItems.length === 0) { skippedCount++; continue; }

            // Deteksi format: tanggal aktual vs indeks hari relatif
            const allAwalAreDates = rawItems.every(r => isDatePattern.test(r.raw_h_awal));
            let dayItems: DayGanttItemInput[] = [];
            let minDate: Date | null = null;

            if (allAwalAreDates) {
                minDate = rawItems.reduce<Date>((min, item) => {
                    const d = new Date(item.raw_h_awal);
                    return d < min ? d : min;
                }, new Date(rawItems[0].raw_h_awal));

                dayItems = rawItems.map(item => {
                    const diffAwal  = Math.floor((new Date(item.raw_h_awal).getTime() - minDate!.getTime()) / 86_400_000);
                    const diffAkhir = Math.floor((new Date(item.raw_h_akhir).getTime() - minDate!.getTime()) / 86_400_000);
                    return {
                        kategori_pekerjaan: item.kategori_pekerjaan,
                        h_awal:  String(diffAwal  + 1),
                        h_akhir: String(diffAkhir + 1),
                        keterlambatan: item.keterlambatan,
                        kecepatan:     item.kecepatan,
                    };
                });
            } else {
                dayItems = rawItems.map(item => ({
                    kategori_pekerjaan: item.kategori_pekerjaan,
                    h_awal:  item.raw_h_awal,
                    h_akhir: item.raw_h_akhir,
                    keterlambatan: item.keterlambatan,
                    kecepatan:     item.kecepatan,
                }));
            }

            // Tambahkan kategori yang muncul di day_items tapi belum ada di list
            dayItems.forEach(d => {
                appendUniqueKategori(kategoriPekerjaan, d.kategori_pekerjaan);
            });
            if (kategoriPekerjaan.length === 0) { skippedCount++; continue; }

            // Kolom Pengawasan_1 ... Pengawasan_20 pada sheet migrasi
            const pengawasanItems: { tanggal_pengawasan: string }[] = [];
            for (let i = 1; i <= 20; i++) {
                const pVal = String(gRow[`Pengawasan_${i}`] || "").trim();
                if (pVal) {
                    let rawDate = "";
                    if (isDatePattern.test(pVal) || pVal.includes('/')) {
                        rawDate = parseDateString(pVal);
                    } else if (!isNaN(Number(pVal)) && minDate) {
                        // Konversi dari day index ke tanggal riil
                        const pDate = new Date(minDate.getTime());
                        pDate.setDate(pDate.getDate() + (Number(pVal) - 1));
                        const yyyy = pDate.getFullYear();
                        const mm = String(pDate.getMonth() + 1).padStart(2, '0');
                        const dd = String(pDate.getDate()).padStart(2, '0');
                        rawDate = `${yyyy}-${mm}-${dd}`;
                    }

                    if (rawDate) {
                        const trimmed = rawDate.trim();
                        const isoLike = /^(\d{4})[-\/](\d{2})[-\/](\d{2})$/.exec(trimmed);
                        if (isoLike) {
                            const [, year, month, day] = isoLike;
                            pengawasanItems.push({ tanggal_pengawasan: `${day}/${month}/${year}` });
                        } else {
                            pengawasanItems.push({ tanggal_pengawasan: trimmed.replace(/-/g, "/") });
                        }
                    }
                }
            }

            // ─── 4. Dependencies (dari sheet dependency_gantt) ───────────────────────
            const depItems: { kategori_pekerjaan: string; kategori_pekerjaan_terikat: string }[] = [];
            depRows
                .filter(r =>
                    String(r["Nomor Ulok"] || "").trim() === noUlok &&
                    String(r["Lingkup_Pekerjaan"] || "").trim() === lingkup
                )
                .forEach(r => {
                    const k1 = String(r["Kategori"] || "").trim();
                    const k2 = String(r["Kategori_Terikat"] || "").trim();
                    if (k1 && k2) depItems.push({ kategori_pekerjaan: k1, kategori_pekerjaan_terikat: k2 });
                });
            includeDependencyCategories(kategoriPekerjaan, depItems);

            // ─── 5. Simpan ke DB ─────────────────────────────────────────────────────
            const ganttData = await ganttRepository.createWithDetails({
                nomor_ulok:        noUlok,
                lingkup_pekerjaan: lingkup,
                nama_toko:         String(gRow["Nama_Toko"]       || "").trim() || "Data Toko",
                kode_toko:         String(gRow["Kode_Toko"]       || "").trim() || null,
                proyek:            String(gRow["Proyek"]          || "").trim() || null,
                cabang:            String(gRow["Cabang"]          || "").trim() || null,
                alamat:            String(gRow["Alamat"]          || "").trim() || null,
                nama_kontraktor:   String(gRow["Nama_Kontraktor"] || "").trim() || null,
                email_pembuat:     String(gRow["Email_Pembuat"]   || emailPembuat).trim(),
                gantt_timestamp:   (() => {
                    const ts = String(gRow["Timestamp"] || "").trim();
                    if (!ts) return null;
                    // Timestamp bisa berupa ISO string: "2025-12-29T11:18:39..."
                    const match = ts.match(/^(\d{4}-\d{2}-\d{2})/);
                    return match ? match[1] : null;
                })(),
                status: (() => {
                    const raw = String(gRow["Status"] || "").trim().toLowerCase();
                    if (raw === GANTT_STATUS.TERKUNCI) return GANTT_STATUS.TERKUNCI;
                    return GANTT_STATUS.ACTIVE;
                })(),
                kategori_pekerjaan: kategoriPekerjaan,
                day_items:          dayItems,
                pengawasan:         pengawasanItems,
                dependencies:       depItems,
            });

            await releaseRabApprovalAfterGantt(ganttData.toko_id, "MIGRASI_SUPER_HUMAN");
            insertedCount++;
        }

        return {
            inserted_count: insertedCount,
            skipped_count:  skippedCount,
            total_groups:   ganttRows.length,
            limit_applied:  limit,
        };
    },

    submitTakeoverInspection: async (input: SubmitTakeoverInspectionInput, files: Express.Multer.File[] = [], userEmail: string = "system") => {
        // Cek apakah sudah pernah diinspeksi
        const check = await pool.query(`SELECT id FROM takeover_inspections WHERE nomor_ulok = $1`, [input.nomor_ulok]);
        if (check.rowCount && check.rowCount > 0) {
            throw new AppError("Inspeksi Takeover untuk ULOK ini sudah pernah dilakukan.", 400);
        }

        // 1. Dapatkan ID Toko untuk setiap Gantt Chart yang terkait
        const ganttIds = Array.from(new Set(input.items.map(i => i.id_gantt)));
        const ganttTokoMap: Record<number, number> = {};
        const ganttPengawasanMap: Record<number, number> = {}; // Mapping id_gantt to id_pengawasan_gantt

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Parse tanggal_takeover
        let dateObj: Date;
        if (typeof input.tanggal_takeover === 'string') {
            dateObj = new Date(input.tanggal_takeover);
        } else {
            dateObj = new Date(input.tanggal_takeover);
        }

        // Format untuk kolom date di takeover_inspections (YYYY-MM-DD)
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const takeoverDateStr = `${yyyy}-${mm}-${dd}`;
        
        // Format untuk kolom varchar di pengawasan_gantt (DD/MM/YYYY)
        const takeoverDateStrPengawasan = `${dd}/${mm}/${yyyy}`;

        if (ganttIds.length > 0) {
                const { rows: ganttRows } = await client.query(
                    `SELECT g.id, t.id AS id_toko FROM gantt_chart g
                     JOIN toko t ON t.id = g.id_toko
                     WHERE g.id = ANY($1::int[])`,
                    [ganttIds]
                );
                for (const row of ganttRows) {
                    ganttTokoMap[row.id] = row.id_toko;
                }

                // Temukan atau buat pengawasan_gantt untuk tanggal_takeover
                
                for (const idGantt of ganttIds) {
                    const { rows: pgRows } = await client.query(
                        `SELECT id AS id_pengawasan_gantt FROM pengawasan_gantt 
                         WHERE id_gantt = $1 AND (tanggal_pengawasan = $2 OR tanggal_pengawasan = $3)`,
                        [idGantt, takeoverDateStrPengawasan, takeoverDateStr]
                    );
                    
                    if (pgRows.length > 0) {
                        ganttPengawasanMap[idGantt] = pgRows[0].id_pengawasan_gantt;
                    } else {
                        const { rows: inserted } = await client.query(
                            `INSERT INTO pengawasan_gantt (id_gantt, tanggal_pengawasan) 
                             VALUES ($1, $2) RETURNING id as id_pengawasan_gantt`,
                            [idGantt, takeoverDateStrPengawasan]
                        );
                        if (inserted.length > 0) {
                            ganttPengawasanMap[idGantt] = inserted[0].id_pengawasan_gantt;
                        }
                    }
                }
            }

            const opnamePayloadsByToko: Record<number, any[]> = {};

            // 2. Insert or update pengawasan items
            for (let i = 0; i < input.items.length; i++) {
                const item = input.items[i];
                const idToko = ganttTokoMap[item.id_gantt];
                if (!idToko) continue; // Gantt tidak valid
                
                // Cek dokumentasi pengawasan (untuk Tidak Dikerjakan, dsb)
                const fileDokumentasi = files.find(f => f.fieldname === `file_dokumentasi_${i}`);
                let dokumentasiLink: string | null = null;
                if (fileDokumentasi) {
                    dokumentasiLink = await uploadDokumentasiToDrive(item.id_gantt, fileDokumentasi as any);
                }

                const idPengawasanGantt = ganttPengawasanMap[item.id_gantt] || null;

                const updateArgs: any[] = [item.status, "Sistem: Pre-inspeksi Takeover", item.id_gantt, item.kategori_pekerjaan, item.jenis_pekerjaan || null, idPengawasanGantt];
                let setDokumentasi = "";
                if (dokumentasiLink) {
                    updateArgs.push(dokumentasiLink);
                    setDokumentasi = `, dokumentasi = $${updateArgs.length}`;
                }

                const updateRes = await client.query(
                    `UPDATE pengawasan
                     SET status = $1, catatan = $2, id_pengawasan_gantt = $6 ${setDokumentasi}
                     WHERE id_gantt = $3 AND kategori_pekerjaan = $4 AND (jenis_pekerjaan = $5 OR (jenis_pekerjaan IS NULL AND $5 IS NULL))
                     RETURNING id`,
                    updateArgs
                );

                if (updateRes.rowCount === 0) {
                    const insertArgs: any[] = [
                        item.id_gantt, 
                        item.kategori_pekerjaan, 
                        item.jenis_pekerjaan || null, 
                        item.status, 
                        "Sistem: Pre-inspeksi Takeover", 
                        idPengawasanGantt
                    ];
                    if (dokumentasiLink) insertArgs.push(dokumentasiLink);

                    await client.query(
                        `INSERT INTO pengawasan (id_gantt, kategori_pekerjaan, jenis_pekerjaan, status, catatan, id_pengawasan_gantt${dokumentasiLink ? ', dokumentasi' : ''})
                         VALUES ($1, $2, $3, $4, $5, $6${dokumentasiLink ? `, $7` : ''})`,
                        insertArgs
                    );
                }

                if (item.status === 'Selesai' && item.opname_data) {
                    const payload: any = {
                        ...item.opname_data,
                        status: "pending",
                        id_toko: idToko
                    };

                    const fileField = `file_opname_${i}`;
                    const uploadedFile = files.find(f => f.fieldname === fileField);
                    if (uploadedFile) {
                        payload.foto = await uploadFotoOpnameToDrive(idToko, uploadedFile as any);
                    }

                    if (!opnamePayloadsByToko[idToko]) opnamePayloadsByToko[idToko] = [];
                    opnamePayloadsByToko[idToko].push(payload);
                }
            }

            // 3. Simpan rekam inspeksi takeover
            const result = await client.query(
                `INSERT INTO takeover_inspections (nomor_ulok, tanggal_takeover)
                 VALUES ($1, $2) RETURNING id`,
                [input.nomor_ulok, takeoverDateStr]
            );

            // 4. Proses opname data (bulk insert ke opname_item per toko)
            for (const [tokoIdStr, payloads] of Object.entries(opnamePayloadsByToko)) {
                if (payloads.length === 0) continue;
                const tokoId = parseInt(tokoIdStr, 10);
                const opnameResult = await opnameService.createBulk({
                    id_toko: tokoId,
                    tipe_opname: "OPNAME",
                    email_pembuat: userEmail,
                    grand_total_opname: "0",
                    grand_total_rab: "0",
                    items: payloads
                }, [], undefined, client);

                if (opnameResult && (opnameResult as any).statusCode) {
                    throw new AppError((opnameResult as any).message || "Gagal menyimpan opname dari takeover.", (opnameResult as any).statusCode);
                }
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error: any) {
            await client.query('ROLLBACK');
            require('fs').appendFileSync('error.log', new Date().toISOString() + ' - Takeover Inspection Error: ' + (error.stack || error) + '\n');
            throw error;
        } finally {
            client.release();
        }
    }
};
