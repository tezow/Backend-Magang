import { pool, withTransaction } from "../../db/pool";
import type { PoolClient } from "pg";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import { REJECTED_RAB_STATUSES } from "../rab/rab.constants";
import type { PpStatus, PpRole, PpAksi } from "./project-planning.constants";
import type {
    SubmitProjekPlanningInput,
    ApprovalInput,
    PpApproval1Input,
    Upload3dInput,
    UploadRabInput,
    ListProjekPlanningQuery,
    ResubmitProjekPlanningInput,
} from "./project-planning.schema";

// ============================================================
// ROW TYPES
// ============================================================

export type ProjekPlanningRow = {
    id: number;
    id_toko: number;
    nomor_ulok: string;
    email_pembuat: string;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    alamat_toko: string | null;
    link_google_maps: string | null;
    akhir_masa_sewa: string | null;
    spd: string | null;
    link_ba_tidak_sesuai_standar: string | null;
    link_siteplan: string | null;
    proyek: string | null;
    lingkup_pekerjaan: string | null;
    jenis_proyek: string | null;
    estimasi_biaya: string | null;
    keterangan: string | null;

    // Identitas Pengajuan
    nama_pengaju: string | null;
    nama_lokasi: string | null;

    // Jenis Pengajuan Desain
    jenis_pengajuan: string | null;
    jenis_pengajuan_lainnya: string | null;
    // Fasilitas (dari tabel terpisah)
    fasilitas?: {
        id?: number;
        jenis_fasilitas: string;
        nama_fasilitas_lainnya?: string | null;
        is_tersedia: boolean;
        keterangan?: string | null;
    }[];

    // Ketentuan (dari tabel terpisah)
    ketentuan?: { id?: number; isi_ketentuan: string }[];

    // Catatan Desain (dari tabel terpisah)
    catatan_design?: { id?: number; isi_catatan: string }[];

    // Foto Lampiran FPD (dari tabel terpisah)
    foto_items?: { id?: number; item_index: number; link_foto: string }[];

    // Links
    link_fpd: string | null;
    link_rab: string | null;
    link_gambar_kerja: string | null;
    link_desain_3d: string | null;
    link_fpd_approved: string | null;
    link_gambar_kompetitor: string | null;
    link_rab_sipil: string | null;
    link_rab_me: string | null;
    link_gambar_kerja_final_sipil: string | null;
    link_gambar_kerja_final_me: string | null;
    link_pdf: string | null;
    id_rab_sipil: number | null;
    id_rab_me: number | null;
    luas_bangunan: string | null;
    luas_area_terbuka: string | null;
    luas_area_terbangun: string | null;
    luas_gudang: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    pxl_bangunan: string | null;
    pxl_area_parkir: string | null;
    p_bangunan: string | null;
    l_bangunan: string | null;
    p_area_parkir: string | null;
    l_area_parkir: string | null;
    jumlah_ac: number | null;
    pk_ac: string | null;
    listrik_va: number | null;
    listrik_phase: number | null;
    sumber_air_bersih: string | null;
    drainase_air_kotor: string | null;

    // Status & flags
    status: PpStatus;
    butuh_desain_3d: boolean;
    is_ruko: boolean;
    jumlah_lantai: number | null;
    is_head_to_head: boolean;
    jarak_head_to_head: string | null;
    is_seating_area: boolean;
    is_dark_store: boolean;
    beanspot_tipe: string | null;

    // Approval fields
    bm_approver_email: string | null;
    bm_waktu_persetujuan: string | null;
    bm_alasan_penolakan: string | null;
    pp1_approver_email: string | null;
    pp1_waktu_persetujuan: string | null;
    pp1_alasan_penolakan: string | null;
    pp_manager_approver_email: string | null;
    pp_manager_waktu_persetujuan: string | null;
    pp_manager_alasan_penolakan: string | null;
    pp2_approver_email: string | null;
    pp2_waktu_persetujuan: string | null;
    pp2_alasan_penolakan: string | null;
    bm2_approver_email: string | null;
    bm2_waktu_persetujuan: string | null;
    bm2_alasan_penolakan: string | null;
    bm_regional_approver_email: string | null;
    bm_regional_waktu_persetujuan: string | null;
    bm_regional_alasan_penolakan: string | null;
    bm_regional_rab_status: string | null;
    bm_regional_gambar_status: string | null;
    bm_regional_rab_rejected_item_ids: number[] | null;
    bm_regional_rab_rejected_item_notes: string | null;
    pp2_rab_status: string | null;
    pp2_gambar_status: string | null;
    pp2_rab_rejected_item_ids: number[] | null;
    pp2_rab_rejected_item_notes: string | null;
    pp_manager_rab_status: string | null;
    pp_manager_gambar_status: string | null;
    pp_manager_rab_rejected_item_ids: number[] | null;
    pp_manager_rab_rejected_item_notes: string | null;

    created_at: string;
    updated_at: string;
};

export type ProjekPlanningLogRow = {
    id: number;
    projek_planning_id: number;
    actor_email: string;
    role: PpRole;
    aksi: PpAksi;
    status_sebelum: string | null;
    status_sesudah: string | null;
    alasan_penolakan: string | null;
    keterangan: string | null;
    created_at: string;
};

export type RabRequestRow = {
    projek_planning_id: number;
    id_toko: number | null;
    nomor_ulok: string;
    nama_toko: string | null;
    nama_lokasi: string | null;
    cabang: string | null;
    alamat_toko: string | null;
    proyek: string | null;
    lingkup_pekerjaan: "SIPIL" | "ME";
    luas_bangunan: string | null;
    luas_area_terbuka: string | null;
    luas_area_terbangun: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    luas_gudang: string | null;
    created_at: string;
};

// ============================================================
// COLUMNS
// ============================================================

const PP_COLUMNS = `
    id, id_toko, nomor_ulok, email_pembuat,
    nama_toko, kode_toko, cabang, alamat_toko, link_google_maps,
    akhir_masa_sewa, spd, link_ba_tidak_sesuai_standar,
    link_siteplan, proyek, lingkup_pekerjaan,
    jenis_proyek, estimasi_biaya, keterangan,
    nama_pengaju, nama_lokasi,
    jenis_pengajuan, jenis_pengajuan_lainnya,
    link_fpd, link_rab, link_gambar_kerja, link_desain_3d, link_fpd_approved,
    link_gambar_kompetitor,
    link_rab_sipil, link_rab_me,
    link_gambar_kerja_final_sipil, link_gambar_kerja_final_me, link_pdf,
    id_rab_sipil, id_rab_me,
    luas_bangunan, luas_area_terbuka, luas_area_terbangun, luas_gudang,
    luas_area_parkir, luas_area_sales, pxl_bangunan, pxl_area_parkir,
    p_bangunan, l_bangunan, p_area_parkir, l_area_parkir,
    jumlah_ac, pk_ac, listrik_va, listrik_phase, sumber_air_bersih, drainase_air_kotor,
    status, butuh_desain_3d, is_ruko, jumlah_lantai,
    is_head_to_head, jarak_head_to_head, is_seating_area, is_dark_store, beanspot_tipe,
    bm_approver_email, bm_waktu_persetujuan, bm_alasan_penolakan,
    bm2_approver_email, bm2_waktu_persetujuan, bm2_alasan_penolakan,
    bm_regional_approver_email, bm_regional_waktu_persetujuan, bm_regional_alasan_penolakan,
    bm_regional_rab_status, bm_regional_gambar_status, bm_regional_rab_rejected_item_ids, bm_regional_rab_rejected_item_notes,
    pp1_approver_email, pp1_waktu_persetujuan, pp1_alasan_penolakan,
    pp_manager_approver_email, pp_manager_waktu_persetujuan, pp_manager_alasan_penolakan,
    pp2_approver_email, pp2_waktu_persetujuan, pp2_alasan_penolakan,
    pp2_rab_status, pp2_gambar_status, pp2_rab_rejected_item_ids, pp2_rab_rejected_item_notes,
    pp_manager_rab_status, pp_manager_gambar_status, pp_manager_rab_rejected_item_ids, pp_manager_rab_rejected_item_notes,
    created_at, updated_at
`;

const nullIfBlank = (value: unknown) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
};

// ============================================================
// REPOSITORY
// ============================================================

export const projekPlanningRepository = {

    // ----------------------------------------------------------
    // FIND
    // ----------------------------------------------------------

    async findById(id: number): Promise<{
        projek: ProjekPlanningRow;
        logs: ProjekPlanningLogRow[];
    } | null> {
        const headerResult = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS} FROM projek_planning WHERE id = $1`,
            [id]
        );

        if ((headerResult.rowCount ?? 0) === 0) return null;
        const projek = headerResult.rows[0];

        const [logsRes, fasilitasRes, ketentuanRes, catatanRes, fotoRes] = await Promise.all([
            pool.query<ProjekPlanningLogRow>(
                `SELECT * FROM projek_planning_log WHERE projek_planning_id = $1 ORDER BY created_at ASC`, [id]
            ),
            pool.query(
                `SELECT id, jenis_fasilitas, nama_fasilitas_lainnya, is_tersedia, keterangan FROM projek_planning_fasilitas WHERE projek_planning_id = $1`, [id]
            ),
            pool.query(
                `SELECT id, isi_ketentuan FROM projek_planning_ketentuan WHERE projek_planning_id = $1`, [id]
            ),
            pool.query(
                `SELECT id, isi_catatan FROM projek_planning_catatan WHERE projek_planning_id = $1`, [id]
            ),
            pool.query(
                `SELECT id, item_index, link_foto FROM projek_planning_foto_item WHERE id_projek_planning = $1 ORDER BY item_index ASC`, [id]
            )
        ]);

        projek.fasilitas = fasilitasRes.rows;
        projek.ketentuan = ketentuanRes.rows;
        projek.catatan_design = catatanRes.rows;
        projek.foto_items = fotoRes.rows;

        return {
            projek,
            logs: logsRes.rows,
        };
    },

    async findActiveByTokoId(idToko: number): Promise<ProjekPlanningRow | null> {
        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             WHERE id_toko = $1
               AND status NOT IN ('COMPLETED', 'REJECTED', 'DRAFT')
             ORDER BY created_at DESC
             LIMIT 1`,
            [idToko]
        );
        return result.rows[0] ?? null;
    },

    async findDraftByTokoId(idToko: number): Promise<ProjekPlanningRow | null> {
        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             WHERE id_toko = $1
               AND status = 'DRAFT'
             ORDER BY created_at DESC
             LIMIT 1`,
            [idToko]
        );
        return result.rows[0] ?? null;
    },

    async findApprovedRabsByNomorUlok(nomorUlok: string): Promise<Array<{
        id: number;
        id_toko: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string | null;
        nama_pt: string | null;
        status: string;
        link_pdf_gabungan: string | null;
        grand_total_final: string | null;
    }>> {
        const result = await pool.query(
            `SELECT r.id, r.id_toko, t.nomor_ulok, t.lingkup_pekerjaan,
                    r.nama_pt, r.status, r.link_pdf_gabungan, r.grand_total_final
             FROM rab r
             JOIN toko t ON t.id = r.id_toko
             WHERE t.nomor_ulok = $1
               AND r.status = 'Disetujui'
             ORDER BY r.created_at DESC`,
            [nomorUlok]
        );
        return result.rows;
    },

    async findLatestByTokoId(idToko: number): Promise<ProjekPlanningRow | null> {
        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             WHERE id_toko = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [idToko]
        );
        return result.rows[0] ?? null;
    },

    async findActiveByNomorUlok(nomorUlok: string): Promise<ProjekPlanningRow | null> {
        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             WHERE nomor_ulok = $1
               AND status NOT IN ('COMPLETED', 'REJECTED', 'DRAFT')
             ORDER BY created_at DESC
             LIMIT 1`,
            [nomorUlok]
        );
        return result.rows[0] ?? null;
    },

    async findDraftByNomorUlok(nomorUlok: string): Promise<ProjekPlanningRow | null> {
        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             WHERE nomor_ulok = $1
               AND status = 'DRAFT'
             ORDER BY created_at DESC
             LIMIT 1`,
            [nomorUlok]
        );
        return result.rows[0] ?? null;
    },

    async list(filter: ListProjekPlanningQuery): Promise<ProjekPlanningRow[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`status = $${values.length}`);
        }
        if (filter.nomor_ulok) {
            values.push(filter.nomor_ulok);
            conditions.push(`nomor_ulok = $${values.length}`);
        }
        if (filter.cabang_array && filter.cabang_array.length > 0) {
            values.push(filter.cabang_array.map((item) => item.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase()));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        }
        if (filter.cabang) {
            values.push(getBranchScopeCandidates(filter.cabang));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        }
        if (filter.email_pembuat) {
            values.push(filter.email_pembuat);
            conditions.push(`email_pembuat = $${values.length}`);
        }
        if (filter.id_toko) {
            values.push(filter.id_toko);
            conditions.push(`id_toko = $${values.length}`);
        }
        if (filter.jenis) {
            const rawList = Array.isArray(filter.jenis)
                ? filter.jenis
                : filter.jenis.split(",").map((j) => j.trim());
            const cleanList = rawList.map((j) => j.trim().toUpperCase()).filter(Boolean);
            if (cleanList.length > 0) {
                values.push(cleanList);
                // AND logic: array formed by comma-split tokens must contain ALL requested items
                conditions.push(`regexp_split_to_array(TRIM(UPPER(COALESCE(jenis_pengajuan, ''))), '\\s*,\\s*') @> $${values.length}::text[]`);
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<ProjekPlanningRow>(
            `SELECT ${PP_COLUMNS}
             FROM projek_planning
             ${whereClause}
             ORDER BY created_at DESC`,
            values
        );

        return result.rows;
    },

    async listRabRequests(actorEmail: string): Promise<RabRequestRow[]> {
        const result = await pool.query<RabRequestRow>(
            `SELECT
                pp.id AS projek_planning_id,
                pp.id_toko,
                pp.nomor_ulok,
                pp.nama_toko,
                pp.nama_lokasi,
                pp.cabang,
                pp.alamat_toko,
                COALESCE(NULLIF(pp.proyek, ''), NULLIF(pp.jenis_proyek, '')) AS proyek,
                scope.lingkup_pekerjaan,
                pp.luas_bangunan,
                pp.luas_area_terbuka,
                pp.luas_area_terbangun,
                pp.luas_area_parkir,
                pp.luas_area_sales,
                pp.luas_gudang,
                pp.created_at
             FROM projek_planning pp
             CROSS JOIN (VALUES ('SIPIL'::text), ('ME'::text)) AS scope(lingkup_pekerjaan)
             WHERE pp.status = 'WAITING_RAB_UPLOAD'
               AND EXISTS (
                    SELECT 1
                    FROM user_cabang uc
                    LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                    WHERE LOWER(TRIM(uc.email_sat)) = LOWER(TRIM($1))
                      AND (
                          LOWER(TRIM(uc.cabang)) = LOWER(TRIM(pp.cabang))
                          OR UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(pp.cabang))
                      )
                      AND UPPER(COALESCE(uc.jabatan, '')) LIKE '%KONTRAKTOR%'
               )
               AND NOT EXISTS (
                    SELECT 1
                    FROM toko t
                    JOIN rab r ON r.id_toko = t.id
                    WHERE t.nomor_ulok = pp.nomor_ulok
                      AND UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = scope.lingkup_pekerjaan
               )
             ORDER BY pp.created_at ASC, pp.id ASC, scope.lingkup_pekerjaan DESC`,
            [actorEmail]
        );
        return result.rows;
    },

    async canActorAccessBranch(actorEmail: string, cabang: string | null): Promise<boolean> {
        if (!cabang) return false;
        const branchCandidates = getBranchScopeCandidates(cabang);
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1
                FROM user_cabang
                WHERE LOWER(TRIM(email_sat)) = LOWER(TRIM($1))
                  AND UPPER(TRIM(cabang)) = ANY($2::text[])
                  AND UPPER(COALESCE(jabatan, '')) LIKE '%KONTRAKTOR%'
            ) AS exists`,
            [actorEmail, branchCandidates]
        );
        return result.rows[0]?.exists ?? false;
    },

    async existsRabByNomorUlokAndLingkup(nomorUlok: string, lingkup: "SIPIL" | "ME"): Promise<boolean> {
        // FORCE REBUILD: 2026-06-24 18:00 - Fix normalize ULOK query
        console.log('[PP DEBUG] existsRabByNomorUlokAndLingkup called:', { nomorUlok, lingkup });
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1
                FROM toko t
                JOIN rab r ON r.id_toko = t.id
                WHERE UPPER(TRIM(t.nomor_ulok)) = UPPER(TRIM($1))
                  AND UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = UPPER(TRIM($2))
                  AND r.status NOT IN ('REJECTED_BY_DIREKTUR', 'REJECTED_BY_KOORDINATOR', 'REJECTED_BY_MANAGER')
            ) AS exists`,
            [nomorUlok, lingkup]
        );
        console.log('[PP DEBUG] existsRabByNomorUlokAndLingkup result:', { exists: result.rows[0]?.exists });
        return result.rows[0]?.exists ?? false;
    },

    async countByStatuses(statuses: PpStatus[], cabang?: string, cabangArray?: string[]): Promise<number> {
        if (statuses.length === 0) return 0;

        const values: unknown[] = [statuses];
        const conditions = [`status = ANY($1::text[])`];

        if (cabangArray && cabangArray.length > 0) {
            values.push(cabangArray.map((item) => item.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase()));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        } else if (cabang && cabang.toUpperCase() !== "HEAD OFFICE") {
            values.push(getBranchScopeCandidates(cabang));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        }

        const result = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM projek_planning
             WHERE ${conditions.join(" AND ")}`,
            values
        );

        return Number(result.rows[0]?.count ?? 0);
    },

    async countCoordinatorTasks(cabang?: string, email?: string, cabangArray?: string[]): Promise<number> {
        const values: unknown[] = [[
            "DRAFT",
            "WAITING_RAB_UPLOAD",
        ]];
        const conditions = [`status = ANY($1::text[])`];

        if (cabangArray && cabangArray.length > 0) {
            values.push(cabangArray.map((item) => item.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase()));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        } else if (cabang && cabang.toUpperCase() !== "HEAD OFFICE") {
            values.push(getBranchScopeCandidates(cabang));
            conditions.push(`UPPER(TRIM(REPLACE(cabang, '_', ' '))) = ANY($${values.length}::text[])`);
        }

        if (email) {
            values.push(email);
            conditions.push(`(status <> 'DRAFT' OR LOWER(email_pembuat) = LOWER($${values.length}))`);
        }

        const result = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM projek_planning
             WHERE ${conditions.join(" AND ")}`,
            values
        );

        return Number(result.rows[0]?.count ?? 0);
    },

    // ----------------------------------------------------------
    // FOTO ITEMS
    // ----------------------------------------------------------

    async createFotoItemsBulk(id_projek_planning: number, items: { item_index: number; link_foto: string }[], client?: PoolClient): Promise<void> {
        const db = client ?? pool;
        for (const item of items) {
            await db.query(
                `INSERT INTO projek_planning_foto_item (id_projek_planning, item_index, link_foto) VALUES ($1, $2, $3)`,
                [id_projek_planning, item.item_index, item.link_foto]
            );
        }
    },

    async deleteFotoItemsBulk(id_projek_planning: number, client?: PoolClient): Promise<void> {
        const db = client ?? pool;
        await db.query(`DELETE FROM projek_planning_foto_item WHERE id_projek_planning = $1`, [id_projek_planning]);
    },

    async upsertFotoItem(id_projek_planning: number, item_index: number, link_foto: string, client?: PoolClient): Promise<void> {
        const db = client ?? pool;
        await db.query(`DELETE FROM projek_planning_foto_item WHERE id_projek_planning = $1 AND item_index = $2`, [id_projek_planning, item_index]);
        await db.query(`INSERT INTO projek_planning_foto_item (id_projek_planning, item_index, link_foto) VALUES ($1, $2, $3)`, [id_projek_planning, item_index, link_foto]);
    },

    // ----------------------------------------------------------
    // CREATE
    // ----------------------------------------------------------

    async create(payload: SubmitProjekPlanningInput & {
        nama_toko: string | null;
        kode_toko: string | null;
        cabang: string | null;
        alamat_toko: string | null;
        proyek: string | null;
        status: PpStatus;
    }): Promise<ProjekPlanningRow> {
        return withTransaction(async (client) => {
            const insertFields: Array<[string, unknown]> = [
                ["id_toko", payload.id_toko],
                ["nomor_ulok", payload.nomor_ulok],
                ["email_pembuat", payload.email_pembuat],
                ["nama_toko", payload.nama_toko],
                ["kode_toko", payload.kode_toko],
                ["cabang", payload.cabang],
                ["alamat_toko", payload.alamat_toko],
                ["link_google_maps", (payload as any).link_google_maps ?? null],
                ["akhir_masa_sewa", nullIfBlank((payload as any).akhir_masa_sewa)],
                ["spd", nullIfBlank((payload as any).spd)],
                ["link_ba_tidak_sesuai_standar", (payload as any).link_ba_tidak_sesuai_standar ?? null],
                ["proyek", payload.proyek],
                ["lingkup_pekerjaan", payload.lingkup_pekerjaan],
                ["jenis_proyek", payload.jenis_proyek],
                ["estimasi_biaya", nullIfBlank(payload.estimasi_biaya)],
                ["keterangan", payload.keterangan ?? null],
                ["link_fpd", payload.link_fpd ?? null],
                ["link_siteplan", (payload as any).link_siteplan ?? null],
                ["luas_bangunan", (payload as any).luas_bangunan ?? null],
                ["luas_area_terbuka", (payload as any).luas_area_terbuka ?? null],
                ["luas_area_terbangun", (payload as any).luas_area_terbangun ?? null],
                ["luas_gudang", (payload as any).luas_gudang ?? null],
                ["luas_area_parkir", (payload as any).luas_area_parkir ?? null],
                ["luas_area_sales", (payload as any).luas_area_sales ?? null],
                ["pxl_bangunan", (payload as any).pxl_bangunan ?? null],
                ["pxl_area_parkir", (payload as any).pxl_area_parkir ?? null],
                ["p_bangunan", nullIfBlank((payload as any).p_bangunan)],
                ["l_bangunan", nullIfBlank((payload as any).l_bangunan)],
                ["p_area_parkir", nullIfBlank((payload as any).p_area_parkir)],
                ["l_area_parkir", nullIfBlank((payload as any).l_area_parkir)],
                ["jumlah_ac", null],
                ["pk_ac", null],
                ["listrik_va", null],
                ["listrik_phase", null],
                ["sumber_air_bersih", null],
                ["drainase_air_kotor", null],
                ["nama_pengaju", payload.nama_pengaju],
                ["nama_lokasi", payload.nama_lokasi],
                ["jenis_pengajuan", payload.jenis_pengajuan],
                ["jenis_pengajuan_lainnya", payload.jenis_pengajuan_lainnya ?? null],
                ["link_gambar_kerja", (payload as any).link_gambar_kerja ?? null],
                ["link_gambar_kompetitor", (payload as any).link_gambar_kompetitor ?? null],
                ["is_ruko", (payload as any).is_ruko ?? false],
                ["jumlah_lantai", nullIfBlank((payload as any).jumlah_lantai)],
                ["is_head_to_head", (payload as any).is_head_to_head ?? false],
                ["jarak_head_to_head", (payload as any).jarak_head_to_head ?? null],
                ["is_seating_area", (payload as any).is_seating_area ?? false],
                ["is_dark_store", (payload as any).is_dark_store ?? false],
                ["beanspot_tipe", (payload as any).beanspot_tipe ?? null],
                ["status", payload.status],
                ["butuh_desain_3d", false],
            ];
            const insertColumns = insertFields.map(([column]) => column).join(", ");
            const insertPlaceholders = insertFields.map((_, index) => `$${index + 1}`).join(", ");
            const insertValues = insertFields.map(([, value]) => value);

            const result = await client.query<ProjekPlanningRow>(
                `INSERT INTO projek_planning (${insertColumns}, created_at, updated_at)
                VALUES (${insertPlaceholders}, NOW(), NOW())
                RETURNING ${PP_COLUMNS}`,
                insertValues
            );
            const row = result.rows[0];
            const ppId = row.id;

            if (payload.ketentuan && payload.ketentuan.length > 0) {
                for (const k of payload.ketentuan) {
                    await client.query(
                        `INSERT INTO projek_planning_ketentuan (projek_planning_id, isi_ketentuan) VALUES ($1, $2)`,
                        [ppId, k]
                    );
                }
            }
            if (payload.catatan_design && payload.catatan_design.length > 0) {
                for (const c of payload.catatan_design) {
                    await client.query(
                        `INSERT INTO projek_planning_catatan (projek_planning_id, isi_catatan) VALUES ($1, $2)`,
                        [ppId, c]
                    );
                }
            }
            row.ketentuan = payload.ketentuan?.map(k => ({ isi_ketentuan: k })) || [];
            row.catatan_design = payload.catatan_design?.map(c => ({ isi_catatan: c })) || [];
            row.fasilitas = [];
            
            return row;
        });
    },

    // ----------------------------------------------------------
    // RESUBMIT (update existing DRAFT record, dipakai saat coordinator submit ulang)
    // ----------------------------------------------------------

    async resubmitDraft(id: number, payload: ResubmitProjekPlanningInput & {
        id_toko: number;
        nomor_ulok: string | null;
        nama_toko: string | null;
        kode_toko: string | null;
        cabang: string | null;
        alamat_toko: string | null;
        proyek: string | null;
        status: PpStatus;
    }): Promise<ProjekPlanningRow> {
        return withTransaction(async (client) => {
            // Build update fields as paired array to avoid manual placeholder numbering errors
            const updateFields: Array<[string, unknown]> = [
                ["id_toko",                  payload.id_toko],
                ["nomor_ulok",               payload.nomor_ulok],
                ["email_pembuat",            payload.email_pembuat],
                ["lingkup_pekerjaan",        payload.lingkup_pekerjaan],
                ["jenis_proyek",             payload.jenis_proyek],
                ["estimasi_biaya",           nullIfBlank(payload.estimasi_biaya)],
                ["keterangan",               payload.keterangan ?? null],
                ["nama_toko",               payload.nama_toko],
                ["kode_toko",               payload.kode_toko],
                ["cabang",                  payload.cabang],
                ["alamat_toko",             payload.alamat_toko],
                ["link_google_maps",        (payload as any).link_google_maps ?? null],
                ["akhir_masa_sewa",         nullIfBlank((payload as any).akhir_masa_sewa)],
                ["spd",                     nullIfBlank((payload as any).spd)],
                ["proyek",                  payload.proyek],
                ["luas_bangunan",           (payload as any).luas_bangunan ?? null],
                ["luas_area_terbuka",       (payload as any).luas_area_terbuka ?? null],
                ["luas_area_terbangun",     (payload as any).luas_area_terbangun ?? null],
                ["luas_gudang",             (payload as any).luas_gudang ?? null],
                ["luas_area_parkir",        (payload as any).luas_area_parkir ?? null],
                ["luas_area_sales",         (payload as any).luas_area_sales ?? null],
                ["pxl_bangunan",            (payload as any).pxl_bangunan ?? null],
                ["pxl_area_parkir",         (payload as any).pxl_area_parkir ?? null],
                ["p_bangunan",              nullIfBlank((payload as any).p_bangunan)],
                ["l_bangunan",              nullIfBlank((payload as any).l_bangunan)],
                ["p_area_parkir",           nullIfBlank((payload as any).p_area_parkir)],
                ["l_area_parkir",           nullIfBlank((payload as any).l_area_parkir)],
                // Fasilitas teknis diset NULL di tahap 1 — diisi pada tahap 2
                ["jumlah_ac",               null],
                ["pk_ac",                   null],
                ["listrik_va",              null],
                ["listrik_phase",           null],
                ["sumber_air_bersih",       null],
                ["drainase_air_kotor",      null],
                ["nama_pengaju",            payload.nama_pengaju],
                ["nama_lokasi",             payload.nama_lokasi],
                ["jenis_pengajuan",         payload.jenis_pengajuan],
                ["jenis_pengajuan_lainnya", payload.jenis_pengajuan_lainnya ?? null],
                ["is_ruko",                 (payload as any).is_ruko ?? false],
                ["jumlah_lantai",           nullIfBlank((payload as any).jumlah_lantai)],
                ["is_head_to_head",         (payload as any).is_head_to_head ?? false],
                ["jarak_head_to_head",      (payload as any).jarak_head_to_head ?? null],
                ["is_seating_area",         (payload as any).is_seating_area ?? false],
                ["is_dark_store",           (payload as any).is_dark_store ?? false],
                ["beanspot_tipe",           (payload as any).beanspot_tipe ?? null],
                ["status",                  payload.status],
                ["butuh_desain_3d",         false],
                // Reset approval stamps
                ["bm_approver_email",               null],
                ["bm_waktu_persetujuan",            null],
                ["pp1_approver_email",              null],
                ["pp1_waktu_persetujuan",           null],
                ["pp_manager_approver_email",       null],
                ["pp_manager_waktu_persetujuan",    null],
                ["pp2_approver_email",              null],
                ["pp2_waktu_persetujuan",           null],
                ["bm2_approver_email",              null],
                ["bm2_waktu_persetujuan",           null],
                ["bm_regional_approver_email",      null],
                ["bm_regional_waktu_persetujuan",   null],
            ];

            // COALESCE columns: only overwrite if new value is not null
            const coalesceColumns = new Set(["link_fpd", "link_siteplan", "link_gambar_kerja", "link_gambar_kompetitor", "link_ba_tidak_sesuai_standar"]);

            // Append COALESCE columns separately so they are not overwritten with NULL
            const coalesceFields: Array<[string, unknown]> = [
                ["link_fpd",                payload.link_fpd ?? null],
                ["link_siteplan",           (payload as any).link_siteplan ?? null],
                ["link_gambar_kerja",       (payload as any).link_gambar_kerja ?? null],
                ["link_gambar_kompetitor",  (payload as any).link_gambar_kompetitor ?? null],
                ["link_ba_tidak_sesuai_standar", (payload as any).link_ba_tidak_sesuai_standar ?? null],
            ];

            // Build SET clause
            const values: unknown[] = [];
            const setClauses: string[] = [];

            for (const [col, val] of updateFields) {
                values.push(val);
                setClauses.push(`${col} = $${values.length}`);
            }
            for (const [col, val] of coalesceFields) {
                values.push(val);
                setClauses.push(`${col} = COALESCE($${values.length}, ${col})`);
            }
            // Append updated_at and id
            setClauses.push(`updated_at = NOW()`);
            values.push(id);
            const idPlaceholder = `$${values.length}`;

            const result = await client.query<ProjekPlanningRow>(
                `UPDATE projek_planning
                 SET ${setClauses.join(",\n                     ")}
                 WHERE id = ${idPlaceholder}
                 RETURNING ${PP_COLUMNS}`,
                values
            );
            const row = result.rows[0];

            // Re-create relations
            await client.query(`DELETE FROM projek_planning_ketentuan WHERE projek_planning_id = $1`, [id]);
            await client.query(`DELETE FROM projek_planning_catatan WHERE projek_planning_id = $1`, [id]);

            if (payload.ketentuan && payload.ketentuan.length > 0) {
                for (const k of payload.ketentuan) {
                    await client.query(`INSERT INTO projek_planning_ketentuan (projek_planning_id, isi_ketentuan) VALUES ($1, $2)`, [id, k]);
                }
            }
            if (payload.catatan_design && payload.catatan_design.length > 0) {
                for (const c of payload.catatan_design) {
                    await client.query(`INSERT INTO projek_planning_catatan (projek_planning_id, isi_catatan) VALUES ($1, $2)`, [id, c]);
                }
            }
            row.ketentuan = payload.ketentuan?.map(k => ({ isi_ketentuan: k })) || [];
            row.catatan_design = payload.catatan_design?.map(c => ({ isi_catatan: c })) || [];
            row.fasilitas = [];

            return row;
        });
    },

    // ----------------------------------------------------------
    // RESET ke DRAFT (saat ditolak oleh BM / PP1)
    // ----------------------------------------------------------

    async updateStatusAndRejectToDraft(
        id: number,
        role: PpRole,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const setRoleFields = role === "BM"
            ? `bm_approver_email = $2, bm_waktu_persetujuan = NOW(), bm_alasan_penolakan = $3`
            : `pp1_approver_email = $2, pp1_waktu_persetujuan = NOW(), pp1_alasan_penolakan = $3`;

        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = 'DRAFT',
                 butuh_desain_3d = FALSE,
                 ${setRoleFields},
                 updated_at = NOW()
             WHERE id = $1
             RETURNING ${PP_COLUMNS}`,
            [id, action.approver_email, action.alasan_penolakan ?? null]
        );
        return result.rows[0];
    },

    async updateStatusOnly(
        id: number,
        status: PpStatus,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $2,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING ${PP_COLUMNS}`,
            [id, status]
        );
        return result.rows[0];
    },

    // ----------------------------------------------------------
    // RESET ke RAB UPLOAD (saat ditolak oleh PP2 / PP Manager)
    // ----------------------------------------------------------

    async updateStatusAndRejectToRabUpload(
        id: number,
        role: PpRole,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const setRoleFields = role === "PP_MANAGER"
            ? `pp_manager_approver_email = $2, pp_manager_waktu_persetujuan = NOW(), pp_manager_alasan_penolakan = $3`
            : `pp2_approver_email = $2, pp2_waktu_persetujuan = NOW(), pp2_alasan_penolakan = $3`;

        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = 'WAITING_RAB_UPLOAD',
                 ${setRoleFields},
                 updated_at = NOW()
             WHERE id = $1
             RETURNING ${PP_COLUMNS}`,
            [id, action.approver_email, action.alasan_penolakan ?? null]
        );
        return result.rows[0];
    },

    // ----------------------------------------------------------
    // UPDATE STATUS + kolom approval spesifik (per tahap — hanya untuk APPROVE)
    // ----------------------------------------------------------

    async updateStatusAndBmApproval(
        id: number,
        newStatus: PpStatus,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 bm_approver_email = $2,
                 bm_waktu_persetujuan = NOW(),
                 bm_alasan_penolakan = NULL,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.approver_email, id]
        );
        return result.rows[0];
    },

    async updateStatusAndBm2Approval(
        id: number,
        newStatus: PpStatus,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 bm2_approver_email = $2,
                 bm2_waktu_persetujuan = NOW(),
                 bm2_alasan_penolakan = CASE WHEN $1::text = 'WAITING_RAB_UPLOAD' THEN $3 ELSE NULL END,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.approver_email, action.alasan_penolakan ?? null, id]
        );
        return result.rows[0];
    },

    async updateStatusAndBmRegionalApproval(
        id: number,
        newStatus: PpStatus,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 bm_regional_approver_email = $2,
                 bm_regional_waktu_persetujuan = NOW(),
                 bm_regional_alasan_penolakan = CASE WHEN $1::text = 'WAITING_RAB_UPLOAD' THEN $3 ELSE NULL END,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.approver_email, action.alasan_penolakan ?? null, id]
        );
        return result.rows[0];
    },

    async updateStatusAndBmRegionalFinalReview(
        id: number,
        newStatus: PpStatus,
        action: {
            approver_email: string;
            rab_tindakan: "APPROVE" | "REJECT";
            gambar_tindakan: "APPROVE" | "REJECT";
            alasan_penolakan?: string | null;
            rab_rejected_item_ids?: number[];
            rab_rejected_item_notes?: string | null;
        },
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 bm_regional_approver_email = $2,
                 bm_regional_waktu_persetujuan = NOW(),
                 bm_regional_alasan_penolakan = CASE WHEN $1::text = 'WAITING_RAB_UPLOAD' THEN $3 ELSE NULL END,
                 bm_regional_rab_status = $4,
                 bm_regional_gambar_status = $5,
                 bm_regional_rab_rejected_item_ids = $6,
                 bm_regional_rab_rejected_item_notes = $7,
                 updated_at = NOW()
             WHERE id = $8
             RETURNING ${PP_COLUMNS}`,
            [
                newStatus,
                action.approver_email,
                action.alasan_penolakan ?? null,
                action.rab_tindakan,
                action.gambar_tindakan,
                action.rab_rejected_item_ids && action.rab_rejected_item_ids.length > 0 ? action.rab_rejected_item_ids : null,
                action.rab_rejected_item_notes?.trim() || null,
                id,
            ]
        );
        return result.rows[0];
    },

    async updateStatusAndPp1Approval(
        id: number,
        newStatus: PpStatus,
        action: PpApproval1Input,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 butuh_desain_3d = $2,
                 pp1_approver_email = $3,
                 pp1_waktu_persetujuan = NOW(),
                 pp1_alasan_penolakan = NULL,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.butuh_desain_3d ?? false, action.approver_email, id]
        );
        return result.rows[0];
    },

    async updateDesain3d(
        id: number,
        newStatus: PpStatus,
        payload: Upload3dInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 link_desain_3d = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING ${PP_COLUMNS}`,
            [newStatus, payload.link_desain_3d, id]
        );
        return result.rows[0];
    },

    async updateRabUpload(
        id: number,
        newStatus: PpStatus,
        payload: {
            id_toko?: number;
            nomor_ulok?: string | null;
            nama_toko?: string | null;
            kode_toko?: string | null;
            cabang?: string | null;
            alamat_toko?: string | null;
            proyek?: string | null;
            jenis_proyek?: string | null;
            link_rab_sipil?: string;
            link_rab_me?: string;
            id_rab_sipil?: number;
            id_rab_me?: number;
            link_gambar_kerja_final_sipil?: string;
            link_gambar_kerja_final_me?: string;
            rab_changed?: boolean;
            gambar_changed?: boolean;
            fasilitas?: Array<{
                jenis_fasilitas: string;
                nama_fasilitas_lainnya?: string | null;
                is_tersedia: boolean;
                keterangan?: string | null;
            }>;
        },
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 link_rab_sipil = COALESCE($2, link_rab_sipil),
                 link_rab_me = COALESCE($3, link_rab_me),
                 id_rab_sipil = COALESCE($4, id_rab_sipil),
                 id_rab_me = COALESCE($5, id_rab_me),
                 link_gambar_kerja_final_sipil = COALESCE($6, link_gambar_kerja_final_sipil),
                 link_gambar_kerja_final_me = COALESCE($7, link_gambar_kerja_final_me),
                 nomor_ulok = COALESCE($11, nomor_ulok),
                 nama_toko = COALESCE($12, nama_toko),
                 kode_toko = COALESCE($13, kode_toko),
                 cabang = COALESCE($14, cabang),
                 alamat_toko = COALESCE($15, alamat_toko),
                 id_toko = COALESCE($16, id_toko),
                 proyek = COALESCE($17, proyek),
                 jenis_proyek = COALESCE($18, jenis_proyek),
                 bm2_approver_email = NULL,
                 bm2_waktu_persetujuan = NULL,
                 bm2_alasan_penolakan = NULL,
                 bm_regional_approver_email = NULL,
                 bm_regional_waktu_persetujuan = NULL,
                 bm_regional_alasan_penolakan = NULL,
                 bm_regional_rab_status = CASE WHEN $9::boolean OR bm_regional_rab_status = 'REJECT' THEN NULL ELSE bm_regional_rab_status END,
                 bm_regional_gambar_status = CASE WHEN $10::boolean OR bm_regional_gambar_status = 'REJECT' THEN NULL ELSE bm_regional_gambar_status END,
                 bm_regional_rab_rejected_item_ids = CASE WHEN $9::boolean OR bm_regional_rab_status = 'REJECT' THEN NULL ELSE bm_regional_rab_rejected_item_ids END,
                 bm_regional_rab_rejected_item_notes = CASE WHEN $9::boolean OR bm_regional_rab_status = 'REJECT' THEN NULL ELSE bm_regional_rab_rejected_item_notes END,
                 pp2_rab_status = CASE WHEN $9::boolean OR pp2_rab_status = 'REJECT' THEN NULL ELSE pp2_rab_status END,
                 pp2_gambar_status = CASE WHEN $10::boolean OR pp2_gambar_status = 'REJECT' THEN NULL ELSE pp2_gambar_status END,
                 pp2_alasan_penolakan = NULL,
                 pp2_rab_rejected_item_ids = CASE WHEN $9::boolean OR pp2_rab_status = 'REJECT' THEN NULL ELSE pp2_rab_rejected_item_ids END,
                 pp2_rab_rejected_item_notes = CASE WHEN $9::boolean OR pp2_rab_status = 'REJECT' THEN NULL ELSE pp2_rab_rejected_item_notes END,
                 pp_manager_rab_status = CASE WHEN $9::boolean OR pp_manager_rab_status = 'REJECT' THEN NULL ELSE pp_manager_rab_status END,
                 pp_manager_gambar_status = CASE WHEN $10::boolean OR pp_manager_gambar_status = 'REJECT' THEN NULL ELSE pp_manager_gambar_status END,
                 pp_manager_alasan_penolakan = NULL,
                 pp_manager_rab_rejected_item_ids = CASE WHEN $9::boolean OR pp_manager_rab_status = 'REJECT' THEN NULL ELSE pp_manager_rab_rejected_item_ids END,
                 pp_manager_rab_rejected_item_notes = CASE WHEN $9::boolean OR pp_manager_rab_status = 'REJECT' THEN NULL ELSE pp_manager_rab_rejected_item_notes END,
                 updated_at = NOW()
             WHERE id = $8
             RETURNING ${PP_COLUMNS}`,
            [
                newStatus,
                payload.link_rab_sipil ?? null,
                payload.link_rab_me ?? null,
                payload.id_rab_sipil ?? null,
                payload.id_rab_me ?? null,
                payload.link_gambar_kerja_final_sipil ?? null,
                payload.link_gambar_kerja_final_me ?? null,
                id,
                payload.rab_changed ?? false,
                payload.gambar_changed ?? false,
                payload.nomor_ulok ?? null,
                payload.nama_toko ?? null,
                payload.kode_toko ?? null,
                payload.cabang ?? null,
                payload.alamat_toko ?? null,
                payload.id_toko ?? null,
                payload.proyek ?? null,
                payload.jenis_proyek ?? null,
            ]
        );

        if (payload.fasilitas) {
            await db.query(`DELETE FROM projek_planning_fasilitas WHERE projek_planning_id = $1`, [id]);
            for (const f of payload.fasilitas) {
                await db.query(
                    `INSERT INTO projek_planning_fasilitas (projek_planning_id, jenis_fasilitas, nama_fasilitas_lainnya, is_tersedia, keterangan) VALUES ($1, $2, $3, $4, $5)`,
                    [id, f.jenis_fasilitas, f.nama_fasilitas_lainnya ?? null, f.is_tersedia, f.keterangan ?? null]
                );
            }
        }

        const row = result.rows[0];
        row.fasilitas = payload.fasilitas || [];
        return row;
    },

    async updateStatusAndPpManagerApproval(
        id: number,
        newStatus: PpStatus,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 pp_manager_approver_email = $2,
                 pp_manager_waktu_persetujuan = NOW(),
                 pp_manager_alasan_penolakan = NULL,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.approver_email, id]
        );
        return result.rows[0];
    },

    async updateStatusAndFinalReview(
        id: number,
        newStatus: PpStatus,
        role: "PP_SPECIALIST" | "PP_MANAGER",
        action: {
            approver_email: string;
            rab_tindakan: "APPROVE" | "REJECT";
            gambar_tindakan: "APPROVE" | "REJECT";
            alasan_penolakan?: string | null;
            rab_rejected_item_ids?: number[];
            rab_rejected_item_notes?: string | null;
        },
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const isManager = role === "PP_MANAGER";
        const setFields = isManager
            ? `pp_manager_approver_email = $2,
               pp_manager_waktu_persetujuan = NOW(),
               pp_manager_alasan_penolakan = $3,
               pp_manager_rab_status = $4,
               pp_manager_gambar_status = $5,
               pp_manager_rab_rejected_item_ids = $6,
               pp_manager_rab_rejected_item_notes = $7`
            : `pp2_approver_email = $2,
               pp2_waktu_persetujuan = NOW(),
               pp2_alasan_penolakan = $3,
               pp2_rab_status = $4,
               pp2_gambar_status = $5,
               pp2_rab_rejected_item_ids = $6,
               pp2_rab_rejected_item_notes = $7`;

        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 ${setFields},
                 updated_at = NOW()
             WHERE id = $8
             RETURNING ${PP_COLUMNS}`,
            [
                newStatus,
                action.approver_email,
                action.alasan_penolakan ?? null,
                action.rab_tindakan,
                action.gambar_tindakan,
                action.rab_rejected_item_ids && action.rab_rejected_item_ids.length > 0 ? action.rab_rejected_item_ids : null,
                action.rab_rejected_item_notes ?? null,
                id,
            ]
        );
        return result.rows[0];
    },

    async markRabNeedsRevision(
        rabIds: number[],
        actorEmail: string,
        reason: string,
        catatanPenolakan?: string | null,
        revisiItems?: Array<{ id_rab_item: number | null; catatan_item?: string | null }>,
        client?: PoolClient
    ): Promise<void> {
        if (rabIds.length === 0) return;
        const db = client ?? pool;
        const safeReason = reason.length > 252 ? `${reason.slice(0, 252)}...` : reason;
        
        await db.query(
            `UPDATE rab
             SET status = 'Ditolak oleh Koordinator',
                 alasan_penolakan = $1,
                 catatan_penolakan = $2,
                 ditolak_oleh = $3,
                 waktu_penolakan = NOW()
             WHERE id = ANY($4::int[])`,
            [safeReason, catatanPenolakan?.trim() || null, actorEmail, rabIds]
        );

        if (revisiItems && revisiItems.length > 0) {
            await db.query(`DELETE FROM rab_revisi_item WHERE id_rab = ANY($1::int[])`, [rabIds]);
            for (const item of revisiItems) {
                if (!item.id_rab_item) continue;
                await db.query(
                    `INSERT INTO rab_revisi_item (
                        id_rab, id_rab_item, approver_email, approver_role, catatan_item
                    )
                    SELECT id_rab, $1, $2, 'Ditolak oleh Koordinator', $3
                    FROM rab_item WHERE id = $1 AND id_rab = ANY($4::int[])`,
                    [
                        item.id_rab_item,
                        actorEmail,
                        item.catatan_item?.trim() || null,
                        rabIds
                    ]
                );
            }
        }

        // Aktifkan Gantt Chart
        await db.query(`
            UPDATE gantt_chart
            SET status = 'active'
            WHERE id IN (
                SELECT g.id
                FROM gantt_chart g
                JOIN rab r ON r.id_toko = g.id_toko
                WHERE r.id = ANY($1::int[])
            )
        `, [rabIds]);
    },

    async updateStatusAndPp2Approval(
        id: number,
        newStatus: PpStatus,
        action: ApprovalInput,
        client?: PoolClient
    ): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET status = $1::text,
                 pp2_approver_email = $2,
                 pp2_waktu_persetujuan = NOW(),
                 pp2_alasan_penolakan = NULL,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING ${PP_COLUMNS}`,
            [newStatus, action.approver_email, id]
        );
        return result.rows[0];
    },

    async updatePdfLink(id: number, linkPdf: string, client?: PoolClient): Promise<ProjekPlanningRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningRow>(
            `UPDATE projek_planning
             SET link_pdf = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING ${PP_COLUMNS}`,
            [linkPdf, id]
        );
        return result.rows[0];
    },

    // ----------------------------------------------------------
    // LOG
    // ----------------------------------------------------------

    async insertLog(payload: {
        projek_planning_id: number;
        actor_email: string;
        role: PpRole;
        aksi: PpAksi;
        status_sebelum: PpStatus | null;
        status_sesudah: PpStatus;
        alasan_penolakan?: string | null;
        keterangan?: string | null;
    }, client?: PoolClient): Promise<ProjekPlanningLogRow> {
        const db = client ?? pool;
        const result = await db.query<ProjekPlanningLogRow>(
            `INSERT INTO projek_planning_log (
                projek_planning_id, actor_email, role, aksi,
                status_sebelum, status_sesudah,
                alasan_penolakan, keterangan, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING *`,
            [
                payload.projek_planning_id,
                payload.actor_email,
                payload.role,
                payload.aksi,
                payload.status_sebelum ?? null,
                payload.status_sesudah,
                payload.alasan_penolakan ?? null,
                payload.keterangan ?? null,
            ]
        );
        return result.rows[0];
    },

    // Gabungkan update + insert log dalam satu transaksi (benar-benar atomic)
    async updateStatusWithLog(
        id: number,
        logPayload: {
            actor_email: string;
            role: PpRole;
            aksi: PpAksi;
            status_sebelum: PpStatus;
            status_sesudah: PpStatus;
            alasan_penolakan?: string | null;
            keterangan?: string | null;
        },
        // Closure yang menerima client untuk dipakai dalam transaksi
        updateQueryFn: (client: PoolClient) => Promise<ProjekPlanningRow>
    ): Promise<{ projek: ProjekPlanningRow; log: ProjekPlanningLogRow }> {
        let projek!: ProjekPlanningRow;
        let log!: ProjekPlanningLogRow;

        await withTransaction(async (client) => {
            // 1. Jalankan update status
            projek = await updateQueryFn(client);

            // 2. Insert log di transaksi yang sama
            const logResult = await client.query<ProjekPlanningLogRow>(
                `INSERT INTO projek_planning_log (
                    projek_planning_id, actor_email, role, aksi,
                    status_sebelum, status_sesudah,
                    alasan_penolakan, keterangan, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                RETURNING *`,
                [
                    id,
                    logPayload.actor_email,
                    logPayload.role,
                    logPayload.aksi,
                    logPayload.status_sebelum,
                    logPayload.status_sesudah,
                    logPayload.alasan_penolakan ?? null,
                    logPayload.keterangan ?? null,
                ]
            );
            log = logResult.rows[0];
        });

        return { projek, log };
    },
};
