import { pool, withTransaction } from "../../db/pool";
import type { PoolClient } from "pg";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import type { ApprovalActionInput } from "../approval/approval.schema";
import { calculateOpnameFinalFinancials, isNoPpnArea } from "./opname-final.financial";
import type { OpnameFinalStatus } from "./opname-final.constants";
import type { LockOpnameFinalInput, OpnameFinalListQueryInput } from "./opname-final.schema";

export type OpnameFinalRow = {
    id: number;
    id_toko: number;
    tipe_opname: string;
    aksi: "active" | "terkunci" | string;
    status_opname_final: OpnameFinalStatus;
    link_pdf_opname: string | null;
    email_pembuat: string | null;
    nama_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    nama_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    pemberi_persetujuan_koordinator: string | null;
    nama_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    nama_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    catatan_persetujuan_koordinator: string | null;
    catatan_persetujuan_manager: string | null;
    catatan_persetujuan_direktur: string | null;
    alasan_penolakan: string | null;
    catatan_penolakan: string | null;
    grand_total_opname: string | null;
    grand_total_rab: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    denda_allocation_note: string | null;
    denda_allocation_tanggal_akhir_spk: string | null;
    denda_allocation_tanggal_serah_terima: string | null;
    created_at: string;
    grand_total_final: string | null;
};

export type OpnameFinalListRow = OpnameFinalRow & {
    nomor_ulok: string;
    nama_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    nama_kontraktor: string | null;
};

export type OpnameFinalItemRow = {
    id: number;
    id_toko: number;
    id_opname_final: number;
    id_rab_item: number | null;
    id_instruksi_lapangan_item: number | null;
    status: "pending" | "disetujui" | "ditolak";
    volume_akhir: number;
    selisih_volume: number;
    total_selisih: number;
    total_harga_opname: number;
    desain: string | null;
    kualitas: string | null;
    spesifikasi: string | null;
    foto: string | null;
    catatan: string | null;
    created_at: string;
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    volume_rab: number | null;
    total_harga_rab: number | null;
    rab_item: {
        id: number | null;
        id_rab: number | null;
        kategori_pekerjaan: string | null;
        jenis_pekerjaan: string | null;
        satuan: string | null;
        volume: number | null;
        harga_material: number | null;
        harga_upah: number | null;
        total_material: number | null;
        total_upah: number | null;
        total_harga: number | null;
        catatan: string | null;
    };
    instruksi_lapangan_item?: {
        id: number | null;
        id_instruksi_lapangan: number | null;
        kategori_pekerjaan: string | null;
        jenis_pekerjaan: string | null;
        satuan: string | null;
        volume: number | null;
        harga_material: number | null;
        harga_upah: number | null;
        total_material: number | null;
        total_upah: number | null;
        total_harga: number | null;
    };
};

type OpnameFinalItemQueryRow = Omit<OpnameFinalItemRow, "rab_item"> & {
    rab_item_id: number | null;
    rab_item_id_rab: number | null;
    rab_item_harga_material: number | null;
    rab_item_harga_upah: number | null;
    rab_item_total_material: number | null;
    rab_item_total_upah: number | null;
    rab_item_catatan: string | null;
    il_item_id: number | null;
    il_item_id_instruksi_lapangan: number | null;
    il_kategori_pekerjaan: string | null;
    il_jenis_pekerjaan: string | null;
    il_satuan: string | null;
    il_volume: number | null;
    il_harga_material: number | null;
    il_harga_upah: number | null;
    il_total_material: number | null;
    il_total_upah: number | null;
    il_total_harga: number | null;
};

export type OpnameFinalDetail = {
    opname_final: OpnameFinalRow;
    toko: {
        id: number;
        nomor_ulok: string;
        nama_toko: string | null;
        proyek: string | null;
        cabang: string | null;
        alamat: string | null;
        lingkup_pekerjaan: string | null;
    };
    items: OpnameFinalItemRow[];
};

export type OpnameFinalIdRow = {
    id: number;
    id_toko: number;
    lingkup_pekerjaan: string | null;
};

export type RukoConversionContext = {
    id_toko: number;
    nomor_ulok: string | null;
    is_ruko: boolean | null;
    luas_area_terbangun: string | null;
};

export type RukoConversionUpdateResult = {
    projek_planning_updated: number;
    rab_updated: number;
};

const OPNAME_FINAL_COLUMNS = `
    ofn.id,
    ofn.id_toko,
    ofn.tipe_opname,
    ofn.aksi,
    ofn.status_opname_final,
    ofn.link_pdf_opname,
    ofn.email_pembuat,
    creator_user.nama_lengkap AS nama_pembuat,
    ofn.pemberi_persetujuan_direktur,
    director_user.nama_lengkap AS nama_persetujuan_direktur,
    ofn.waktu_persetujuan_direktur,
    ofn.pemberi_persetujuan_koordinator,
    coordinator_user.nama_lengkap AS nama_persetujuan_koordinator,
    ofn.waktu_persetujuan_koordinator,
    ofn.pemberi_persetujuan_manager,
    manager_user.nama_lengkap AS nama_persetujuan_manager,
    ofn.waktu_persetujuan_manager,
    ofn.catatan_persetujuan_koordinator,
    ofn.catatan_persetujuan_manager,
    ofn.catatan_persetujuan_direktur,
    ofn.alasan_penolakan,
    ofn.catatan_penolakan,
    ofn.grand_total_opname,
    ofn.grand_total_rab,
    ofn.hari_denda,
    ofn.nilai_denda,
    COALESCE(
        ofn.tanggal_akhir_spk_denda,
        (
            SELECT MAX(spk_scope.effective_spk_end)
            FROM (
                SELECT COALESCE(
                    (
                        SELECT MAX(
                            CASE
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan::text, '')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                                    THEN LEFT(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan::text), 10)::date
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan::text, '')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                                    THEN to_date(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan::text), 'DD/MM/YYYY')
                                ELSE NULL
                            END
                        )
                        FROM pertambahan_spk pt
                        JOIN pengajuan_spk ps_source ON ps_source.id = pt.id_spk
                        JOIN toko t_source ON t_source.id = ps_source.id_toko
                        JOIN toko t_target ON t_target.nomor_ulok = t_source.nomor_ulok
                        WHERE t_target.id = ps.id_toko
                          AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
                    ),
                    CASE
                        WHEN TRIM(COALESCE(ps.waktu_selesai::text, '')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                            THEN LEFT(TRIM(ps.waktu_selesai::text), 10)::date
                        WHEN TRIM(COALESCE(ps.waktu_selesai::text, '')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                            THEN to_date(TRIM(ps.waktu_selesai::text), 'DD/MM/YYYY')
                        ELSE NULL
                    END
                ) AS effective_spk_end
                FROM toko peer_t
                JOIN pengajuan_spk ps ON ps.id_toko = peer_t.id
                WHERE peer_t.nomor_ulok = t.nomor_ulok
                  AND UPPER(TRIM(COALESCE(peer_t.cabang, ''))) = UPPER(TRIM(COALESCE(t.cabang, '')))
                  AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
            ) spk_scope
        )
    ) AS tanggal_akhir_spk_denda,
    COALESCE(
        ofn.tanggal_serah_terima_denda,
        (
            SELECT st_scope.created_at::date
            FROM (
                SELECT bst.created_at
                FROM toko peer_t
                JOIN berkas_serah_terima bst ON bst.id_toko = peer_t.id
                WHERE peer_t.nomor_ulok = t.nomor_ulok
                  AND UPPER(TRIM(COALESCE(peer_t.cabang, ''))) = UPPER(TRIM(COALESCE(t.cabang, '')))
                ORDER BY bst.created_at ASC, bst.id ASC
                LIMIT 1
            ) st_scope
        )
    ) AS tanggal_serah_terima_denda,
    NULL::text AS denda_allocation_note,
    NULL::date AS denda_allocation_tanggal_akhir_spk,
    NULL::date AS denda_allocation_tanggal_serah_terima,
    ofn.created_at,
    ofn.grand_total_final
`;

const approvalTimestampExpression = "to_char(timezone('Asia/Jakarta', now()), 'YYYY-MM-DD HH24:MI:SS')";

export const opnameFinalRepository = {
    async list(filter: OpnameFinalListQueryInput): Promise<OpnameFinalListRow[]> {
        const conditions: string[] = [];
        const values: Array<string | number | string[]> = [];

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`ofn.status_opname_final = $${values.length}`);
        }

        if (filter.aksi) {
            values.push(filter.aksi);
            conditions.push(`ofn.aksi = $${values.length}`);
        }

        if (typeof filter.id_toko !== "undefined") {
            values.push(filter.id_toko);
            conditions.push(`ofn.id_toko = $${values.length}`);
        }

        if (filter.nomor_ulok) {
            values.push(filter.nomor_ulok);
            conditions.push(`t.nomor_ulok = $${values.length}`);
        }

        // NEW: Prioritize cabang_array over cabang
        if (filter.cabang_array && filter.cabang_array.length > 0) {
            const normalizedBranches = filter.cabang_array.map(b => b.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        } else if (filter.cabang) {
            values.push(getBranchScopeCandidates(filter.cabang).map(b => b.replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase()));
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        }

        if (filter.nama_kontraktor) {
            // Normalize: hilangkan PT, CV, titik, koma, spasi ganda
            const normalizedKontraktor = filter.nama_kontraktor.toLowerCase().replace(/\b(pt|cv)\b/gi, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
            values.push(normalizedKontraktor);
            conditions.push(`LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.nama_kontraktor, '\\y(pt|cv)\\y|[\\.,]', ' ', 'gi'), '\\s+', ' ', 'g'))) = $${values.length}`);
        }

        if (filter.tipe_opname) {
            values.push(filter.tipe_opname);
            conditions.push(`ofn.tipe_opname = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<OpnameFinalListRow>(
            `
            SELECT ${OPNAME_FINAL_COLUMNS},
                  t.nomor_ulok,
                  t.nama_toko,
                  t.proyek,
                  t.cabang,
                  t.nama_kontraktor
              FROM opname_final ofn
            JOIN toko t ON t.id = ofn.id_toko
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.email_pembuat)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) creator_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_direktur)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) director_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_koordinator)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) coordinator_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_manager)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) manager_user ON TRUE
              ${whereClause}
            ORDER BY ofn.created_at DESC, ofn.id DESC
            `,
            values
        );

        return result.rows;
    },


    async findById(id: string): Promise<OpnameFinalDetail | null> {
        const headerResult = await pool.query<OpnameFinalRow & {
            nomor_ulok: string;
            nama_toko: string | null;
            proyek: string | null;
            cabang: string | null;
            alamat: string | null;
            lingkup_pekerjaan: string | null;
        }>(
            `
            SELECT ${OPNAME_FINAL_COLUMNS},
                  t.nomor_ulok,
                  t.nama_toko,
                  t.proyek,
                  t.cabang,
                  t.alamat,
                  t.lingkup_pekerjaan
              FROM opname_final ofn
            JOIN toko t ON t.id = ofn.id_toko
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.email_pembuat)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) creator_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_direktur)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) director_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_koordinator)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) coordinator_user ON TRUE
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
                  AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(ofn.pemberi_persetujuan_manager)
                ORDER BY CASE WHEN UPPER(uc.cabang) = UPPER(t.cabang) THEN 0 ELSE 1 END, CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END, uc.id
                LIMIT 1
            ) manager_user ON TRUE
              WHERE ofn.id = $1
            `,
            [id]
        );

        if ((headerResult.rowCount ?? 0) === 0) {
            return null;
        }

        const header = headerResult.rows[0];
        const allocationResult = await pool.query<{
            owner_opname_id: number;
            owner_lingkup_pekerjaan: string | null;
            nilai_denda: string | null;
            hari_denda: number | null;
            tanggal_akhir_spk_denda: string | null;
            tanggal_serah_terima_denda: string | null;
        }>(
            `
            SELECT
                peer_ofn.id AS owner_opname_id,
                peer_toko.lingkup_pekerjaan AS owner_lingkup_pekerjaan,
                peer_ofn.nilai_denda,
                peer_ofn.hari_denda,
                peer_ofn.tanggal_akhir_spk_denda,
                peer_ofn.tanggal_serah_terima_denda
            FROM opname_final peer_ofn
            JOIN toko peer_toko ON peer_toko.id = peer_ofn.id_toko
            WHERE peer_toko.nomor_ulok = $1
              AND UPPER(TRIM(COALESCE(peer_toko.cabang, ''))) = UPPER(TRIM(COALESCE($2::text, '')))
              AND COALESCE(peer_ofn.nilai_denda, 0)::numeric > 0
            ORDER BY
              CASE
                WHEN UPPER(TRIM(COALESCE(peer_toko.lingkup_pekerjaan, ''))) = 'SIPIL' THEN 0
                WHEN UPPER(TRIM(COALESCE(peer_toko.lingkup_pekerjaan, ''))) = 'ME' THEN 1
                ELSE 2
              END,
              peer_ofn.created_at DESC,
              peer_ofn.id DESC
            LIMIT 1
            `,
            [header.nomor_ulok, header.cabang]
        );
        const allocationOwner = allocationResult.rows[0] ?? null;
        const dendaAllocationNote = allocationOwner && allocationOwner.owner_opname_id !== header.id
            ? `Denda keterlambatan lokasi ini dialokasikan pada lingkup ${String(allocationOwner.owner_lingkup_pekerjaan ?? "-").trim() || "-"} sebesar Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(allocationOwner.nilai_denda ?? 0))}${Number(allocationOwner.hari_denda ?? 0) > 0 ? ` untuk ${Number(allocationOwner.hari_denda ?? 0)} hari` : ""}.`
            : null;

        const itemsResult = await pool.query<OpnameFinalItemQueryRow>(
            `
            SELECT
                oi.id,
                oi.id_toko,
                oi.id_opname_final,
                oi.id_rab_item,
                oi.id_instruksi_lapangan_item,
                oi.status,
                oi.volume_akhir,
                oi.selisih_volume,
                oi.total_selisih,
                oi.total_harga_opname,
                oi.desain,
                oi.kualitas,
                oi.spesifikasi,
                oi.foto,
                oi.catatan,
                oi.created_at,
                ri.id AS rab_item_id,
                ri.id_rab AS rab_item_id_rab,
                ri.kategori_pekerjaan,
                ri.jenis_pekerjaan,
                ri.satuan,
                ri.volume AS volume_rab,
                ri.harga_material AS rab_item_harga_material,
                ri.harga_upah AS rab_item_harga_upah,
                ri.total_material AS rab_item_total_material,
                ri.total_upah AS rab_item_total_upah,
                ri.total_harga AS total_harga_rab,
                ri.catatan AS rab_item_catatan,
                ili.id AS il_item_id,
                ili.id_instruksi_lapangan AS il_item_id_instruksi_lapangan,
                ili.kategori_pekerjaan AS il_kategori_pekerjaan,
                ili.jenis_pekerjaan AS il_jenis_pekerjaan,
                ili.satuan AS il_satuan,
                ili.volume AS il_volume,
                ili.harga_material AS il_harga_material,
                ili.harga_upah AS il_harga_upah,
                ili.total_material AS il_total_material,
                ili.total_upah AS il_total_upah,
                ili.total_harga AS il_total_harga
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
            WHERE oi.id_opname_final = $1
            ORDER BY oi.id ASC
            `,
            [id]
        );

        const items: OpnameFinalItemRow[] = itemsResult.rows.map((item) => ({
            ...item,
            rab_item: {
                id: item.rab_item_id ?? item.id_rab_item,
                id_rab: item.rab_item_id_rab,
                kategori_pekerjaan: item.kategori_pekerjaan ?? item.il_kategori_pekerjaan,
                jenis_pekerjaan: item.jenis_pekerjaan ?? item.il_jenis_pekerjaan,
                satuan: item.satuan ?? item.il_satuan,
                volume: item.volume_rab ?? item.il_volume,
                harga_material: item.rab_item_harga_material ?? item.il_harga_material,
                harga_upah: item.rab_item_harga_upah ?? item.il_harga_upah,
                total_material: item.rab_item_total_material ?? item.il_total_material,
                total_upah: item.rab_item_total_upah ?? item.il_total_upah,
                total_harga: item.total_harga_rab ?? item.il_total_harga,
                catatan: item.rab_item_catatan
            },
            instruksi_lapangan_item: {
                id: item.il_item_id,
                id_instruksi_lapangan: item.il_item_id_instruksi_lapangan,
                kategori_pekerjaan: item.il_kategori_pekerjaan,
                jenis_pekerjaan: item.il_jenis_pekerjaan,
                satuan: item.il_satuan,
                volume: item.il_volume,
                harga_material: item.il_harga_material,
                harga_upah: item.il_harga_upah,
                total_material: item.il_total_material,
                total_upah: item.il_total_upah,
                total_harga: item.il_total_harga
            }
        }));

        return {
            opname_final: {
                id: header.id,
                id_toko: header.id_toko,
                tipe_opname: header.tipe_opname,
                aksi: header.aksi,
                status_opname_final: header.status_opname_final,
                link_pdf_opname: header.link_pdf_opname,
                email_pembuat: header.email_pembuat,
                nama_pembuat: header.nama_pembuat,
                pemberi_persetujuan_direktur: header.pemberi_persetujuan_direktur,
                nama_persetujuan_direktur: header.nama_persetujuan_direktur,
                waktu_persetujuan_direktur: header.waktu_persetujuan_direktur,
                pemberi_persetujuan_koordinator: header.pemberi_persetujuan_koordinator,
                nama_persetujuan_koordinator: header.nama_persetujuan_koordinator,
                waktu_persetujuan_koordinator: header.waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager: header.pemberi_persetujuan_manager,
                nama_persetujuan_manager: header.nama_persetujuan_manager,
                waktu_persetujuan_manager: header.waktu_persetujuan_manager,
                catatan_persetujuan_koordinator: header.catatan_persetujuan_koordinator,
                catatan_persetujuan_manager: header.catatan_persetujuan_manager,
                catatan_persetujuan_direktur: header.catatan_persetujuan_direktur,
                alasan_penolakan: header.alasan_penolakan,
                catatan_penolakan: header.catatan_penolakan,
                grand_total_opname: header.grand_total_opname,
                grand_total_rab: header.grand_total_rab,
                hari_denda: header.hari_denda,
                nilai_denda: header.nilai_denda,
                tanggal_akhir_spk_denda: header.tanggal_akhir_spk_denda,
                tanggal_serah_terima_denda: header.tanggal_serah_terima_denda,
                denda_allocation_note: dendaAllocationNote,
                denda_allocation_tanggal_akhir_spk: dendaAllocationNote ? allocationOwner?.tanggal_akhir_spk_denda ?? null : null,
                denda_allocation_tanggal_serah_terima: dendaAllocationNote ? allocationOwner?.tanggal_serah_terima_denda ?? null : null,
                created_at: header.created_at,
                grand_total_final: header.grand_total_final
            },
            toko: {
                id: header.id_toko,
                nomor_ulok: header.nomor_ulok,
                nama_toko: header.nama_toko,
                proyek: header.proyek,
                cabang: header.cabang,
                alamat: header.alamat,
                lingkup_pekerjaan: header.lingkup_pekerjaan
            },
            items
        };
    },

    async listIdsByPenaltyScope(idToko: number): Promise<OpnameFinalIdRow[]> {
        const result = await pool.query<OpnameFinalIdRow>(
            `
            SELECT ofn.id, ofn.id_toko, peer_toko.lingkup_pekerjaan
            FROM opname_final ofn
            JOIN toko peer_toko ON peer_toko.id = ofn.id_toko
            JOIN toko target_toko ON target_toko.id = $1
            WHERE peer_toko.nomor_ulok = target_toko.nomor_ulok
              AND UPPER(TRIM(COALESCE(target_toko.cabang, ''))) <> 'HEAD OFFICE'
              AND UPPER(TRIM(COALESCE(peer_toko.cabang, ''))) <> 'HEAD OFFICE'
              AND (
                  target_toko.cabang IS NULL
                  OR peer_toko.cabang IS NULL
                  OR UPPER(peer_toko.cabang) = UPPER(target_toko.cabang)
              )
            ORDER BY
              CASE
                WHEN UPPER(TRIM(COALESCE(peer_toko.lingkup_pekerjaan, ''))) = 'SIPIL' THEN 0
                WHEN UPPER(TRIM(COALESCE(peer_toko.lingkup_pekerjaan, ''))) = 'ME' THEN 1
                ELSE 2
              END,
              ofn.created_at DESC,
              ofn.id DESC
            `,
            [idToko]
        );

        return result.rows;
    },

    async getRukoConversionContext(idToko: number): Promise<RukoConversionContext | null> {
        const result = await pool.query<RukoConversionContext>(
            `
            SELECT
                t.id AS id_toko,
                t.nomor_ulok,
                pp.is_ruko,
                pp.luas_area_terbangun
            FROM toko t
            LEFT JOIN LATERAL (
                SELECT is_ruko, luas_area_terbangun
                FROM projek_planning pp
                WHERE pp.id_toko = t.id
                   OR (
                       t.nomor_ulok IS NOT NULL
                       AND pp.nomor_ulok IS NOT NULL
                       AND UPPER(pp.nomor_ulok) = UPPER(t.nomor_ulok)
                   )
                ORDER BY pp.updated_at DESC NULLS LAST, pp.created_at DESC NULLS LAST, pp.id DESC
                LIMIT 1
            ) pp ON TRUE
            WHERE t.id = $1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async applyNonRukoConversion(idToko: number): Promise<RukoConversionUpdateResult> {
        return withTransaction(async (client) => {
            const projekPlanningResult = await client.query(
                `
                UPDATE projek_planning pp
                SET is_ruko = false,
                    updated_at = NOW()
                FROM toko t
                WHERE t.id = $1
                  AND (
                      pp.id_toko = t.id
                      OR (
                          t.nomor_ulok IS NOT NULL
                          AND pp.nomor_ulok IS NOT NULL
                          AND UPPER(pp.nomor_ulok) = UPPER(t.nomor_ulok)
                      )
                  )
                  AND COALESCE(pp.is_ruko, false) = true
                `,
                [idToko]
            );

            const rabResult = await client.query(
                `
                UPDATE rab r
                SET kategori_lokasi = 'Non-Ruko'
                FROM toko source_toko, toko target_toko
                WHERE source_toko.id = $1
                  AND target_toko.id = r.id_toko
                  AND (
                      target_toko.id = source_toko.id
                      OR (
                          source_toko.nomor_ulok IS NOT NULL
                          AND target_toko.nomor_ulok IS NOT NULL
                          AND UPPER(target_toko.nomor_ulok) = UPPER(source_toko.nomor_ulok)
                      )
                  )
                  AND COALESCE(r.kategori_lokasi, '') <> 'Non-Ruko'
                  AND (
                      r.kategori_lokasi IS NULL
                      OR UPPER(r.kategori_lokasi) LIKE '%RUKO%'
                  )
                `,
                [idToko]
            );

            return {
                projek_planning_updated: projekPlanningResult.rowCount ?? 0,
                rab_updated: rabResult.rowCount ?? 0,
            };
        });
    },

    async updateApproval(
        opnameFinalId: string,
        newStatus: OpnameFinalStatus,
        action: ApprovalActionInput
    ): Promise<void> {
        if (action.tindakan === "APPROVE") {
            const sets: string[] = ["status_opname_final = $1", "alasan_penolakan = NULL", "catatan_penolakan = NULL"];
            const values: Array<string> = [newStatus];
            const approvalNote = action.catatan_approval?.trim() || null;

            if (action.jabatan === "KOORDINATOR") {
                values.push(action.approver_email);
                sets.push(`pemberi_persetujuan_koordinator = $${values.length}`);
                sets.push(`waktu_persetujuan_koordinator = ${approvalTimestampExpression}`);
                values.push(approvalNote ?? "");
                sets.push(`catatan_persetujuan_koordinator = NULLIF($${values.length}, '')`);
            } else if (action.jabatan === "MANAGER") {
                values.push(action.approver_email);
                sets.push(`pemberi_persetujuan_manager = $${values.length}`);
                sets.push(`waktu_persetujuan_manager = ${approvalTimestampExpression}`);
                values.push(approvalNote ?? "");
                sets.push(`catatan_persetujuan_manager = NULLIF($${values.length}, '')`);
            } else {
                values.push(action.approver_email);
                sets.push(`pemberi_persetujuan_direktur = $${values.length}`);
                sets.push(`waktu_persetujuan_direktur = ${approvalTimestampExpression}`);
                values.push(approvalNote ?? "");
                sets.push(`catatan_persetujuan_direktur = NULLIF($${values.length}, '')`);
            }

            values.push(opnameFinalId);
            await pool.query(
                `UPDATE opname_final SET ${sets.join(", ")} WHERE id = $${values.length}`,
                values
            );
            return;
        }

        await pool.query(
            `
            UPDATE opname_final
            SET status_opname_final = $1,
                alasan_penolakan = $2,
                catatan_penolakan = $3
            WHERE id = $4
            `,
            [newStatus, action.alasan_penolakan?.trim() ?? null, action.catatan_approval?.trim() || null, opnameFinalId]
        );

        await pool.query(
            `
            UPDATE opname_item
            SET status = 'ditolak'
            WHERE id_opname_final = $1
            `,
            [opnameFinalId]
        );
    },

    async interveneStatus(opnameFinalId: string, newStatus: OpnameFinalStatus, reason: string): Promise<void> {
        await withTransaction(async (client) => {
            await client.query(
                `
                UPDATE opname_final
                SET status_opname_final = $1::text,
                    alasan_penolakan = CASE
                        WHEN $1::text LIKE 'Ditolak%' THEN $2::text
                        ELSE NULL
                    END,
                    catatan_penolakan = CASE
                        WHEN $1::text LIKE 'Ditolak%' THEN $2::text
                        ELSE NULL
                    END,
                    pemberi_persetujuan_koordinator = NULL,
                    waktu_persetujuan_koordinator = NULL,
                    pemberi_persetujuan_manager = NULL,
                    waktu_persetujuan_manager = NULL,
                    pemberi_persetujuan_direktur = NULL,
                    waktu_persetujuan_direktur = NULL,
                    catatan_persetujuan_koordinator = NULL,
                    catatan_persetujuan_manager = NULL,
                    catatan_persetujuan_direktur = NULL
                WHERE id = $3
                `,
                [newStatus, reason, opnameFinalId]
            );

            if (newStatus.startsWith("Ditolak")) {
                await client.query(
                    `
                    UPDATE opname_item
                    SET status = 'ditolak'
                    WHERE id_opname_final = $1
                    `,
                    [opnameFinalId]
                );
            }
        });
    },

    async updatePdfLink(opnameFinalId: string, linkPdf: string): Promise<void> {
        await pool.query(
            `UPDATE opname_final SET link_pdf_opname = $1 WHERE id = $2`,
            [linkPdf, opnameFinalId]
        );
    },

    async updateDenda(opnameFinalId: string, payload: {
        hari_denda: number;
        nilai_denda: number;
        tanggal_akhir_spk: string | null;
        tanggal_serah_terima: string | null;
    }, existingClient?: PoolClient): Promise<void> {
        const queryRunner = existingClient ?? pool;
        await queryRunner.query(
            `
            UPDATE opname_final
            SET hari_denda = $1,
                nilai_denda = $2,
                tanggal_akhir_spk_denda = $3,
                tanggal_serah_terima_denda = $4
            WHERE id = $5
            `,
            [
                payload.hari_denda,
                payload.nilai_denda,
                payload.tanggal_akhir_spk,
                payload.tanggal_serah_terima,
                opnameFinalId
            ]
        );
    },

    async updateTotals(opnameFinalId: string, existingClient?: PoolClient): Promise<void> {
        const queryRunner = existingClient ?? pool;
        const header = await queryRunner.query(`
            SELECT ofn.id_toko, ofn.nilai_denda, t.cabang, t.nama_toko, t.alamat
            FROM opname_final ofn
            JOIN toko t ON t.id = ofn.id_toko
            WHERE ofn.id = $1
        `, [opnameFinalId]);
        if ((header.rowCount ?? 0) === 0) return;
        const row = header.rows[0];

        const noPpn = isNoPpnArea(row);

        const items = await queryRunner.query(`
            SELECT oi.id_rab_item, oi.total_selisih, ri.total_harga AS rab_item_total_harga
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            WHERE oi.id_opname_final = $1
        `, [opnameFinalId]);

        const ilResult = await queryRunner.query<{ total: string }>(`
            SELECT COALESCE(SUM(
                CASE
                    WHEN oi.id IS NOT NULL THEN oi.total_harga_opname
                    ELSE ili.total_harga
                END
            ), 0)::text AS total
            FROM instruksi_lapangan_item ili
            JOIN instruksi_lapangan il ON il.id = ili.id_instruksi_lapangan
            LEFT JOIN opname_item oi
                ON oi.id_instruksi_lapangan_item = ili.id
               AND oi.id_opname_final = $2
            WHERE il.id_toko = $1
              AND il.status IN ('Disetujui', 'Approved')
        `, [row.id_toko, opnameFinalId]);

        let rabTotal = 0;
        const ilTotal = Number(ilResult.rows[0]?.total || 0);
        let tambahTotal = 0;
        let kurangTotal = 0;

        for (const item of items.rows) {
            const selisih = Number(item.total_selisih || 0);
            if (item.id_rab_item) {
                rabTotal += Number(item.rab_item_total_harga || 0);
                if (selisih > 0) tambahTotal += selisih;
                else kurangTotal += selisih;
            }
        }
        const grandTotalOpname = rabTotal + ilTotal + tambahTotal + kurangTotal;

        const nilaiDenda = Number(row.nilai_denda || 0);
        const financials = calculateOpnameFinalFinancials({
            rab: rabTotal,
            instruksiLapangan: ilTotal,
            kerjaTambah: tambahTotal,
            kerjaKurang: kurangTotal,
            denda: nilaiDenda,
            noPpn,
        });

        await queryRunner.query(
            `
            UPDATE opname_final
            SET grand_total_opname = $1,
                grand_total_rab = $2,
                grand_total_final = $3
            WHERE id = $4
            `,
            [
                String(grandTotalOpname),
                String(rabTotal),
                String(financials.totalFinal),
                opnameFinalId
            ]
        );
    },
    async lockById(opnameFinalId: string, payload: LockOpnameFinalInput): Promise<{ item_count: number }> {
        return withTransaction(async (client) => {
            const existing = await client.query<{ id: number }>(
                `SELECT id FROM opname_final WHERE id = $1 FOR UPDATE`,
                [opnameFinalId]
            );

            if ((existing.rowCount ?? 0) === 0) {
                return { item_count: 0 };
            }

            const existingPhotos = await client.query<{ source_key: string; foto: string | null }>(
                `
                SELECT
                    CASE
                        WHEN id_rab_item IS NOT NULL THEN 'rab:' || id_rab_item::text
                        ELSE 'il:' || id_instruksi_lapangan_item::text
                    END AS source_key,
                    foto
                FROM opname_item
                WHERE id_opname_final = $1
                `,
                [opnameFinalId]
            );
            const photoBySource = new Map<string, string | null>();
            for (const row of existingPhotos.rows) {
                photoBySource.set(row.source_key, row.foto);
            }

            await client.query(
                `DELETE FROM opname_item WHERE id_opname_final = $1`,
                [opnameFinalId]
            );

            const values: Array<number | string | null> = [];
            const placeholders = payload.opname_item.map((item, index) => {
                const base = index * 14;
                const sourceKey = item.id_rab_item
                    ? `rab:${item.id_rab_item}`
                    : `il:${item.id_instruksi_lapangan_item}`;
                values.push(
                    payload.id_toko,
                    Number(opnameFinalId),
                    item.id_rab_item ?? null,
                    item.id_instruksi_lapangan_item ?? null,
                    item.status ?? "pending",
                    item.volume_akhir,
                    item.selisih_volume,
                    item.total_selisih,
                    item.total_harga_opname,
                    item.desain ?? null,
                    item.kualitas ?? null,
                    item.spesifikasi ?? null,
                    item.foto ?? photoBySource.get(sourceKey) ?? null,
                    item.catatan ?? null
                );

                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`;
            });

            await client.query(
                `
                INSERT INTO opname_item (
                    id_toko,
                    id_opname_final,
                    id_rab_item,
                    id_instruksi_lapangan_item,
                    status,
                    volume_akhir,
                    selisih_volume,
                    total_selisih,
                    total_harga_opname,
                    desain,
                    kualitas,
                    spesifikasi,
                    foto,
                    catatan
                )
                VALUES ${placeholders.join(", ")}
                `,
                values
            );

            await client.query(
                `
                UPDATE opname_final
                SET id_toko = $1,
                    email_pembuat = $2,
                    aksi = $3,
                    grand_total_opname = $4,
                    grand_total_rab = $5,
                    status_opname_final = $6,
                    tipe_opname = 'OPNAME_FINAL',
                    alasan_penolakan = NULL,
                    pemberi_persetujuan_direktur = NULL,
                    waktu_persetujuan_direktur = NULL,
                    pemberi_persetujuan_koordinator = NULL,
                    waktu_persetujuan_koordinator = NULL,
                    pemberi_persetujuan_manager = NULL,
                    waktu_persetujuan_manager = NULL
                WHERE id = $7
                `,
                [
                    payload.id_toko,
                    payload.email_pembuat,
                    payload.aksi ?? "terkunci",
                    payload.grand_total_opname,
                    payload.grand_total_rab,
                    "Menunggu Persetujuan Koordinator",
                    opnameFinalId
                ]
            );

            return { item_count: payload.opname_item.length };
        });
    }
};
