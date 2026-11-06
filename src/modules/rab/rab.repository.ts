import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool";
import { getBranchScopeCandidates, isSameBranchScope } from "../../common/branch-scope";
import type { ApprovalActionInput } from "../approval/approval.schema";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { ACTIVE_RAB_STATUSES, RAB_STATUS, REJECTED_RAB_STATUSES, type RabStatus } from "./rab.constants";
import type { DetailItemInput } from "./rab.schema";

// ---------------------------------------------------------------------------
// Row types – sesuai tabel rab, rab_item, toko
// ---------------------------------------------------------------------------

export type RabRow = {
    id: number;
    id_toko: number;
    projek_planning_id: number | null;
    no_sph: number | null;
    status: RabStatus;
    nama_pt: string | null;
    email_pembuat: string | null;
    logo: string | null;
    link_pdf_gabungan: string | null;
    link_pdf_non_sbo: string | null;
    link_pdf_rekapitulasi: string | null;
    link_pdf_materai: string | null;
    pemberi_persetujuan_koordinator: string | null;
    nama_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    nama_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    pemberi_persetujuan_direktur: string | null;
    nama_persetujuan_direktur: string | null;
    nama_lengkap_persetujuan_direktur?: string | null;
    waktu_persetujuan_direktur: string | null;
    catatan_persetujuan_koordinator: string | null;
    catatan_persetujuan_manager: string | null;
    catatan_persetujuan_direktur: string | null;
    alasan_penolakan: string | null;
    catatan_penolakan: string | null;
    waktu_penolakan: string | null;
    ditolak_oleh: string | null;
    durasi_pekerjaan: string | null;
    kategori_lokasi: string | null;
    no_polis: string | null;
    berlaku_polis: string | null;
    file_asuransi: string | null;
    luas_bangunan: string | null;
    luas_terbangun: string | null;
    luas_area_terbuka: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    luas_gudang: string | null;
    beanspot_type: string | null;
    is_hth: boolean | null;
    hth_meter: string | null;
    is_fasade: boolean | null;
    grand_total: string | null;
    grand_total_non_sbo: string | null;
    grand_total_final: string | null;
    created_at: string;
};

export type RabItemRow = {
    id: number;
    id_rab: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume: string;
    harga_material: string;
    harga_upah: string;
    total_material: string;
    total_upah: string;
    total_harga: string;
    catatan: string | null;
};

export type RabRevisiItemRow = {
    id: number;
    id_rab: number;
    id_rab_item: number | null;
    approver_email: string | null;
    approver_role: string | null;
    catatan_item: string | null;
    created_at: string;
};

export type TokoJoinRow = {
    id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
    takeover_sequence: number;
};

export type TokoStableFields = {
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

export type RabMinimalRow = {
    id: number;
    id_toko: number;
    status: RabStatus;
    logo: string | null;
    file_asuransi: string | null;
    cabang: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RAB_COLUMNS = `
    r.id, r.id_toko, r.projek_planning_id, r.no_sph, r.status, r.nama_pt, r.email_pembuat, r.logo,
    r.link_pdf_gabungan, r.link_pdf_non_sbo, r.link_pdf_rekapitulasi,
    r.link_pdf_materai,
    r.pemberi_persetujuan_koordinator, r.nama_persetujuan_koordinator, r.waktu_persetujuan_koordinator,
    r.pemberi_persetujuan_manager, r.nama_persetujuan_manager, r.waktu_persetujuan_manager,
    r.pemberi_persetujuan_direktur, r.nama_persetujuan_direktur, r.waktu_persetujuan_direktur,
    r.catatan_persetujuan_koordinator, r.catatan_persetujuan_manager, r.catatan_persetujuan_direktur,
    r.alasan_penolakan, r.catatan_penolakan, r.waktu_penolakan, r.ditolak_oleh, r.durasi_pekerjaan, r.kategori_lokasi,
    r.no_polis, r.berlaku_polis, r.file_asuransi,
    r.luas_bangunan, r.luas_terbangun, r.luas_area_terbuka,
    r.luas_area_parkir, r.luas_area_sales, r.luas_gudang,
    r.beanspot_type, r.is_hth, r.hth_meter, r.is_fasade,
    r.grand_total, r.grand_total_non_sbo, r.grand_total_final, r.created_at
`;

const toIntegerString = (value: number): string => {
    if (!Number.isFinite(value)) return "0";
    return Math.round(value).toString();
};

/** Konversi angka ke string tanpa membulatkan desimal (untuk volume dll). */
const toNumericString = (value: number): string => {
    if (!Number.isFinite(value)) return "0";
    // Buang trailing zero yang tidak perlu (mis. "2.50" → "2.5", "3.00" → "3")
    return parseFloat(value.toFixed(4)).toString();
};

const mapUpdatedRabItemRow = (row: RabItemRow): RabItemRow => ({
    id: row.id,
    id_rab: row.id_rab,
    kategori_pekerjaan: row.kategori_pekerjaan,
    jenis_pekerjaan: row.jenis_pekerjaan,
    satuan: row.satuan,
    volume: row.volume,
    harga_material: row.harga_material,
    harga_upah: row.harga_upah,
    total_material: row.total_material,
    total_upah: row.total_upah,
    total_harga: row.total_harga,
    catatan: row.catatan
});

const insertRabItems = async (
    client: PoolClient,
    rabId: number,
    detailItems: DetailItemInput[]
): Promise<void> => {
    if (detailItems.length === 0) return;

    // Keep query size bounded for very large payloads.
    const chunkSize = 200;

    for (let start = 0; start < detailItems.length; start += chunkSize) {
        const chunk = detailItems.slice(start, start + chunkSize);
        const values: Array<string | number | null> = [];
        const placeholders: string[] = [];

        for (const item of chunk) {
            const totalMaterial = item.total_material ?? (item.volume * item.harga_material);
            const totalUpah = item.total_upah ?? (item.volume * item.harga_upah);
            const totalHarga = item.total_harga ?? (totalMaterial + totalUpah);
            const catatan = item.catatan?.trim() || null;

            const base = values.length;
            placeholders.push(
                `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
            );

            values.push(
                rabId,
                item.kategori_pekerjaan,
                item.jenis_pekerjaan,
                item.satuan,
                toNumericString(item.volume),
                toIntegerString(item.harga_material),
                toIntegerString(item.harga_upah),
                toIntegerString(totalMaterial),
                toIntegerString(totalUpah),
                toIntegerString(totalHarga),
                catatan
            );
        }

        await client.query(
            `INSERT INTO rab_item (
                id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan,
                volume, harga_material, harga_upah,
                total_material, total_upah, total_harga, catatan
            ) VALUES ${placeholders.join(", ")}`,
            values
        );
    }
};

const isRabAssetProxyPath = (value?: string | null): boolean => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return false;

    return /^\/api\/rab\/\d+\/(logo|file-asuransi)$/i.test(trimmed);
};

const toPersistedAssetLink = (value?: string | null): string | null => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return null;
    if (isRabAssetProxyPath(trimmed)) return null;

    return trimmed;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const rabRepository = {
    async findLatestByTokoId(tokoId: number): Promise<RabRow | null> {
        const result = await pool.query<RabRow>(
            `SELECT ${RAB_COLUMNS}
             FROM rab r
             WHERE r.id_toko = $1
             ORDER BY r.created_at DESC, r.id DESC
             LIMIT 1`,
            [tokoId]
        );

        return result.rows[0] ?? null;
    },

    /** Cek RAB aktif berdasarkan nomor_ulok (lewat tabel toko) + lingkup */
    async existsActiveByTokoId(tokoId: number): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM rab
                WHERE id_toko = $1
                  AND status = ANY($2::text[])
            )`,
            [tokoId, ACTIVE_RAB_STATUSES]
        );
        return result.rows[0]?.exists ?? false;
    },

    /** Cek apakah ada RAB dengan status aktif (non-rejected) untuk toko ini.
     *  Fungsi ini menggantikan existsAnyByTokoId yang sebelumnya identik dengan existsActiveByTokoId.
     *  RAB yang sudah rejected TIDAK dihitung sebagai duplikat — kontraktor boleh submit ulang.
     */
    async existsAnyByTokoId(tokoId: number): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM rab
                WHERE id_toko = $1
                  AND status = ANY($2::text[])
            )`,
            [tokoId, ACTIVE_RAB_STATUSES]
        );
        return result.rows[0]?.exists ?? false;
    },

    async findMinimalById(rabId: number): Promise<RabMinimalRow | null> {
        const result = await pool.query<RabMinimalRow>(
            `SELECT r.id, r.id_toko, r.status, r.logo, r.file_asuransi, t.cabang
             FROM rab r
             LEFT JOIN toko t ON t.id = r.id_toko
             WHERE r.id = $1
             LIMIT 1`,
            [rabId]
        );

        return result.rows[0] ?? null;
    },

    async existsGanttByRabId(rabId: string | number): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1
                FROM rab r
                JOIN gantt_chart g ON g.id_toko = r.id_toko
                WHERE r.id = $1
            ) AS exists`,
            [rabId]
        );

        return result.rows[0]?.exists ?? false;
    },

    async releaseWaitingGanttByTokoId(tokoId: number): Promise<number> {
        const result = await pool.query<{ id: number }>(
            `UPDATE rab
             SET status = $1
             WHERE id_toko = $2
               AND status = $3
             RETURNING id`,
            [RAB_STATUS.WAITING_FOR_DIREKTUR, tokoId, RAB_STATUS.WAITING_FOR_GANTT]
        );

        return result.rowCount ?? 0;
    },

    async resetToWaitingGantt(rabId: string | number): Promise<void> {
        await withTransaction(async (client) => {
            await client.query(
                `UPDATE rab
                 SET status = $1,
                     pemberi_persetujuan_direktur = NULL,
                     nama_persetujuan_direktur = NULL,
                     waktu_persetujuan_direktur = NULL,
                     pemberi_persetujuan_koordinator = NULL,
                     nama_persetujuan_koordinator = NULL,
                     waktu_persetujuan_koordinator = NULL,
                     pemberi_persetujuan_manager = NULL,
                     nama_persetujuan_manager = NULL,
                     waktu_persetujuan_manager = NULL,
                     alasan_penolakan = NULL,
                     waktu_penolakan = NULL,
                     ditolak_oleh = NULL
                 WHERE id = $2`,
                [RAB_STATUS.WAITING_FOR_GANTT, rabId]
            );

            await client.query(
                `UPDATE gantt_chart
                 SET status = 'active'
                 WHERE id = (
                    SELECT g.id
                    FROM gantt_chart g
                    JOIN rab r ON r.id_toko = g.id_toko
                    WHERE r.id = $1
                    ORDER BY g.id DESC
                    LIMIT 1
                 )`,
                [rabId]
            );
        });
    },

    async replaceRejectedWithDetails(
        rabId: number,
        payload: {
            // toko fields
            nomor_ulok: string;
            lingkup_pekerjaan?: string;
            nama_toko?: string;
            proyek?: string;
            cabang?: string;
            alamat?: string;
            nama_kontraktor?: string;
            // rab fields
            email_pembuat: string;
            nama_pt: string;
            status: RabStatus;
            logo?: string;
            durasi_pekerjaan: string;
            kategori_lokasi?: string;
            no_polis?: string;
            berlaku_polis?: string;
            file_asuransi?: string;
            luas_bangunan?: string;
            luas_terbangun?: string;
            luas_area_terbuka?: string;
            luas_area_parkir?: string;
            luas_area_sales?: string;
            luas_gudang?: string;
            grand_total: string;
            grand_total_non_sbo: string;
            grand_total_final: string;
            detail_items: DetailItemInput[];
        }
    ): Promise<RabRow> {
        return withTransaction(async (client) => {
            const currentRes = await client.query<RabRow>(
                `SELECT * FROM rab WHERE id = $1 FOR UPDATE`,
                [rabId]
            );

            if ((currentRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            const currentRab = currentRes.rows[0];
            if (!REJECTED_RAB_STATUSES.includes(currentRab.status)) {
                throw new Error(`RAB dengan id ${rabId} tidak dalam status reject`);
            }

            const logoToPersist = toPersistedAssetLink(payload.logo);
            const insuranceToPersist = toPersistedAssetLink(payload.file_asuransi);
            const normalizedNomorUlok = payload.nomor_ulok?.trim().toUpperCase() || null;
            const normalizedLingkup = payload.lingkup_pekerjaan?.trim().toUpperCase() || null;

            if (normalizedNomorUlok) {
                const duplicateTokoRes = await client.query<{ id: number }>(
                    `SELECT id
                     FROM toko
                     WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM($1))
                       AND UPPER(TRIM(COALESCE(lingkup_pekerjaan, ''))) = UPPER(TRIM(COALESCE($2, '')))
                       AND id <> $3
                     LIMIT 1
                     FOR UPDATE`,
                    [normalizedNomorUlok, normalizedLingkup, currentRab.id_toko]
                );

                if ((duplicateTokoRes.rowCount ?? 0) > 0) {
                    const duplicateTokoId = duplicateTokoRes.rows[0].id;
                    const duplicateUsageRes = await client.query<{
                        rab_count: string;
                        blocking_rab_count: string;
                        mismatched_owner_count: string;
                        gantt_count: string;
                        spk_count: string;
                        instruksi_lapangan_count: string;
                        opname_final_count: string;
                        berkas_serah_terima_count: string;
                        projek_planning_count: string;
                        pic_pengawasan_count: string;
                        penyimpanan_dokumen_count: string;
                    }>(
                        `SELECT
                            (SELECT COUNT(*) FROM rab r WHERE r.id_toko = $1) AS rab_count,
                            (SELECT COUNT(*) FROM rab r WHERE r.id_toko = $1 AND r.status <> $2) AS blocking_rab_count,
                            (SELECT COUNT(*) FROM rab r
                             WHERE r.id_toko = $1
                               AND (
                                   ($3::text IS NOT NULL AND LOWER(TRIM(COALESCE(r.email_pembuat, ''))) <> LOWER(TRIM($3::text)))
                                   OR ($4::text IS NOT NULL AND TRIM(COALESCE(r.nama_pt, '')) <> TRIM($4::text))
                               )
                            ) AS mismatched_owner_count,
                            (SELECT COUNT(*) FROM gantt_chart g WHERE g.id_toko = $1) AS gantt_count,
                            (SELECT COUNT(*) FROM pengajuan_spk s WHERE s.id_toko = $1) AS spk_count,
                            (SELECT COUNT(*) FROM instruksi_lapangan il WHERE il.id_toko = $1) AS instruksi_lapangan_count,
                            (SELECT COUNT(*) FROM opname_final ofn WHERE ofn.id_toko = $1) AS opname_final_count,
                            (SELECT COUNT(*) FROM berkas_serah_terima bst WHERE bst.id_toko = $1) AS berkas_serah_terima_count,
                            (SELECT COUNT(*) FROM projek_planning pp WHERE pp.id_toko = $1) AS projek_planning_count,
                            (SELECT COUNT(*) FROM pic_pengawasan pic WHERE pic.id_toko = $1) AS pic_pengawasan_count,
                            (SELECT COUNT(*) FROM penyimpanan_dokumen doc WHERE doc.id_toko = $1) AS penyimpanan_dokumen_count`,
                        [
                            duplicateTokoId,
                            RAB_STATUS.WAITING_FOR_GANTT,
                            payload.email_pembuat?.trim() || null,
                            payload.nama_pt?.trim() || null
                        ]
                    );
                    const usage = duplicateUsageRes.rows[0];
                    const hasBlockingData = [
                        usage.blocking_rab_count,
                        usage.mismatched_owner_count,
                        usage.gantt_count,
                        usage.spk_count,
                        usage.instruksi_lapangan_count,
                        usage.opname_final_count,
                        usage.berkas_serah_terima_count,
                        usage.projek_planning_count,
                        usage.pic_pengawasan_count,
                        usage.penyimpanan_dokumen_count
                    ].some((count) => Number(count) > 0);

                    if (hasBlockingData) {
                        const duplicateError = new Error("Nomor ULOK dan lingkup sudah dipakai toko lain") as Error & { code?: string };
                        duplicateError.code = "TOKO_ULOK_LINGKUP_DUPLICATE";
                        throw duplicateError;
                    }

                    const duplicateRabIdsRes = await client.query<{ id: number }>(
                        `SELECT id FROM rab WHERE id_toko = $1 FOR UPDATE`,
                        [duplicateTokoId]
                    );
                    const duplicateRabIds = duplicateRabIdsRes.rows.map((row) => row.id);

                    if (duplicateRabIds.length > 0) {
                        await client.query(`DELETE FROM rab_revisi_item WHERE id_rab = ANY($1::int[])`, [duplicateRabIds]);
                        await client.query(`DELETE FROM rab_item WHERE id_rab = ANY($1::int[])`, [duplicateRabIds]);
                        await client.query(`DELETE FROM rab WHERE id = ANY($1::int[])`, [duplicateRabIds]);
                    }
                    await client.query(`DELETE FROM toko WHERE id = $1`, [duplicateTokoId]);
                }
            }

            await client.query(
                `UPDATE toko
                 SET nomor_ulok = COALESCE(NULLIF(UPPER(TRIM($1)), ''), nomor_ulok),
                     lingkup_pekerjaan = COALESCE(NULLIF(UPPER(TRIM($2)), ''), lingkup_pekerjaan),
                     nama_toko = COALESCE(NULLIF(TRIM($3), ''), nama_toko),
                     proyek = COALESCE(NULLIF(TRIM($4), ''), proyek),
                     cabang = COALESCE(NULLIF(TRIM($5), ''), cabang),
                     alamat = COALESCE(NULLIF(TRIM($6), ''), alamat),
                     nama_kontraktor = COALESCE(NULLIF(TRIM(nama_kontraktor), ''), $7, nama_kontraktor)
                 WHERE id = $8`,
                [
                    normalizedNomorUlok,
                    normalizedLingkup,
                    payload.nama_toko ?? null,
                    payload.proyek ?? null,
                    payload.cabang ?? null,
                    payload.alamat ?? null,
                    payload.nama_kontraktor ?? null,
                    currentRab.id_toko
                ]
            );

            const updatedRabRes = await client.query<RabRow>(
                `UPDATE rab
                 SET status = $1,
                     nama_pt = $2,
                     email_pembuat = $3,
                     logo = COALESCE($4, logo),
                     durasi_pekerjaan = $5,
                     kategori_lokasi = $6,
                     no_polis = $7,
                     berlaku_polis = $8,
                     file_asuransi = COALESCE($9, file_asuransi),
                     luas_bangunan = $10,
                     luas_terbangun = $11,
                     luas_area_terbuka = $12,
                     luas_area_parkir = $13,
                     luas_area_sales = $14,
                     luas_gudang = $15,
                     grand_total = $16,
                     grand_total_non_sbo = $17,
                     grand_total_final = $18,
                     alasan_penolakan = NULL,
                     waktu_penolakan = NULL,
                     ditolak_oleh = NULL,
                     pemberi_persetujuan_direktur = NULL,
                     nama_persetujuan_direktur = NULL,
                     waktu_persetujuan_direktur = NULL,
                     pemberi_persetujuan_koordinator = NULL,
                     nama_persetujuan_koordinator = NULL,
                     waktu_persetujuan_koordinator = NULL,
                     pemberi_persetujuan_manager = NULL,
                     nama_persetujuan_manager = NULL,
                     waktu_persetujuan_manager = NULL,
                     created_at = timezone('Asia/Jakarta', now())
                 WHERE id = $19
                 RETURNING *`,
                [
                    payload.status,
                    payload.nama_pt,
                    payload.email_pembuat,
                    logoToPersist,
                    payload.durasi_pekerjaan,
                    payload.kategori_lokasi ?? null,
                    payload.no_polis ?? null,
                    payload.berlaku_polis ?? null,
                    insuranceToPersist,
                    payload.luas_bangunan ?? null,
                    payload.luas_terbangun ?? null,
                    payload.luas_area_terbuka ?? null,
                    payload.luas_area_parkir ?? null,
                    payload.luas_area_sales ?? null,
                    payload.luas_gudang ?? null,
                    payload.grand_total,
                    payload.grand_total_non_sbo,
                    payload.grand_total_final,
                    rabId
                ]
            );

            if (payload.status === RAB_STATUS.WAITING_FOR_GANTT) {
                await client.query(
                    `UPDATE gantt_chart
                     SET status = 'active'
                     WHERE id = (
                        SELECT id
                        FROM gantt_chart
                        WHERE id_toko = $1
                        ORDER BY id DESC
                        LIMIT 1
                     )`,
                    [currentRab.id_toko]
                );
            }

            await client.query(`DELETE FROM rab_item WHERE id_rab = $1`, [rabId]);
            await insertRabItems(client, rabId, payload.detail_items);

            return updatedRabRes.rows[0];
        });
    },

    /** Upsert toko + buat RAB header + items dalam satu transaksi */
    async createWithDetails(payload: {
        // toko fields
        nomor_ulok: string;
        lingkup_pekerjaan?: string;
        nama_toko?: string;
        proyek?: string;
        cabang?: string;
        alamat?: string;
        nama_kontraktor?: string;
        projek_planning_id?: number;
        is_takeover?: boolean;
        // rab fields
        email_pembuat: string;
        nama_pt: string;
        status: RabStatus;
        logo?: string;
        durasi_pekerjaan: string;
        kategori_lokasi?: string;
        no_polis?: string;
        berlaku_polis?: string;
        file_asuransi?: string;
        luas_bangunan?: string;
        luas_terbangun?: string;
        luas_area_terbuka?: string;
        luas_area_parkir?: string;
        luas_area_sales?: string;
        luas_gudang?: string;
        grand_total: string;
        grand_total_non_sbo: string;
        grand_total_final: string;
        detail_items: DetailItemInput[];
    }): Promise<RabRow & { toko_id: number }> {
        return withTransaction(async (client) => {
            // Normalize lingkup_pekerjaan ke uppercase (SIPIL/ME) di awal transaksi
            const normalizedLingkup = payload.lingkup_pekerjaan?.trim().toUpperCase() || null;

            // 0. Validasi Kepemilikan ULOK (1 ULOK HANYA untuk 1 Kontraktor)
            if (!payload.is_takeover) {
                const ulokOwnerRes = await client.query<{ nama_kontraktor: string }>(
                    `SELECT nama_kontraktor 
                     FROM toko 
                     WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM($1))
                       AND nama_kontraktor IS NOT NULL
                       AND TRIM(nama_kontraktor) != ''
                     ORDER BY takeover_sequence DESC, id DESC
                     LIMIT 1`,
                    [payload.nomor_ulok]
                );

                if ((ulokOwnerRes.rowCount ?? 0) > 0) {
                    const existingOwner = ulokOwnerRes.rows[0].nama_kontraktor;
                    const currentContractor = payload.nama_kontraktor || payload.nama_pt;
                    
                    if (existingOwner && currentContractor && existingOwner.trim().toUpperCase() !== currentContractor.trim().toUpperCase()) {
                         const err = new Error(`Gagal menyimpan RAB: ULOK ${payload.nomor_ulok} sudah dikerjakan oleh kontraktor lain (${existingOwner}). Anda tidak dapat menambahkan RAB untuk ULOK ini.`);
                         (err as any).code = "ULOK_ALREADY_OWNED";
                         throw err;
                    }
                }
            }
            
            // 1. Ambil toko by nomor_ulok+lingkup. Jika tidak ada, insert baru.
            const existingTokoRes = await client.query<{ id: number; cabang: string | null; nama_toko: string | null; takeover_sequence: number }>(
                `SELECT id, cabang, nama_toko, takeover_sequence
                 FROM toko
                 WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM($1))
                   AND UPPER(TRIM(COALESCE(lingkup_pekerjaan, ''))) = UPPER(TRIM(COALESCE($2, '')))
                 ORDER BY takeover_sequence DESC, id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [payload.nomor_ulok, normalizedLingkup]
            );

            let tokoId: number;

            if ((existingTokoRes.rowCount ?? 0) > 0 && !payload.is_takeover) {
                const existing = existingTokoRes.rows[0];
                tokoId = existing.id;

                if (existing.cabang && payload.cabang && !isSameBranchScope(existing.cabang, payload.cabang)) {
                    throw new Error(`Gagal menyimpan RAB: Nomor ULOK ${payload.nomor_ulok} sudah terdaftar untuk cabang ${existing.cabang} (Toko: ${existing.nama_toko || '-'}). Anda mencoba menyimpan untuk cabang ${payload.cabang}. Harap periksa kembali Nomor ULOK Anda.`);
                }


                await client.query(
                    `UPDATE toko
                     SET nama_toko = COALESCE(NULLIF(TRIM($1), ''), nama_toko),
                         proyek = COALESCE(NULLIF(TRIM($2), ''), proyek),
                         cabang = COALESCE(NULLIF(TRIM($3), ''), cabang),
                         alamat = COALESCE(NULLIF(TRIM($4), ''), alamat),
                         nama_kontraktor = COALESCE(NULLIF(TRIM(nama_kontraktor), ''), $5, nama_kontraktor)
                     WHERE id = $6`,
                    [
                        payload.nama_toko ?? null,
                        payload.proyek ?? null,
                        payload.cabang ?? null,
                        payload.alamat ?? null,
                        payload.nama_kontraktor ?? null,
                        tokoId
                    ]
                );
            } else {
                console.log('[RAB DEBUG] Toko tidak ditemukan atau is_takeover true, akan insert baru:', {
                    nomor_ulok: payload.nomor_ulok,
                    lingkup: normalizedLingkup,
                    is_takeover: payload.is_takeover
                });

                let nextSequence = 0;
                if (payload.is_takeover && (existingTokoRes.rowCount ?? 0) > 0) {
                    nextSequence = (existingTokoRes.rows[0].takeover_sequence ?? 0) + 1;
                }

                const tokoInsertRes = await client.query<{ id: number }>(
                    `INSERT INTO toko (
                        nomor_ulok, lingkup_pekerjaan, nama_toko,
                        proyek, cabang, alamat, nama_kontraktor, takeover_sequence
                    ) VALUES (UPPER(TRIM($1)), $2, $3,$4,$5,$6,$7,$8)
                    RETURNING id`,
                    [
                        payload.nomor_ulok,
                        normalizedLingkup,
                        payload.nama_toko ?? null,
                        payload.proyek ?? null,
                        payload.cabang ?? null,
                        payload.alamat ?? null,
                        payload.nama_kontraktor ?? null,
                        nextSequence
                    ]
                );
                tokoId = tokoInsertRes.rows[0].id;
                console.log('[RAB DEBUG] Toko baru berhasil di-insert dengan ID:', tokoId);
            }

            console.log('[RAB DEBUG] Akan cek RAB aktif untuk toko ID:', tokoId);
            const existingRabRes = await client.query<{ id: number; status: RabStatus }>(
                `SELECT id, status
                 FROM rab
                 WHERE id_toko = $1
                   AND status = ANY($2::text[])
                 LIMIT 1
                 FOR UPDATE`,
                [tokoId, ACTIVE_RAB_STATUSES]
            );
            console.log('[RAB DEBUG] Hasil cek RAB aktif:', {
                tokoId,
                found_existing_rab: (existingRabRes.rowCount ?? 0) > 0,
                rab_id: existingRabRes.rows[0]?.id,
                status: existingRabRes.rows[0]?.status
            });
            if ((existingRabRes.rowCount ?? 0) > 0) {
                console.error('[RAB DEBUG] DUPLICATE RAB DETECTED di repository!', {
                    tokoId,
                    rab_id: existingRabRes.rows[0].id,
                    status: existingRabRes.rows[0].status,
                    input_ulok: payload.nomor_ulok,
                    input_lingkup: normalizedLingkup
                });
                const duplicateError = new Error("RAB untuk kombinasi ULOK dan lingkup ini sudah ada") as Error & { code?: string };
                duplicateError.code = "RAB_DUPLICATE";
                throw duplicateError;
            }

            const logoToPersist = toPersistedAssetLink(payload.logo);
            const insuranceToPersist = toPersistedAssetLink(payload.file_asuransi);

            // 2. Insert RAB header
            const res = await client.query<RabRow>(
                `INSERT INTO rab (
                    id_toko, projek_planning_id, status, nama_pt, email_pembuat, logo,
                    durasi_pekerjaan, kategori_lokasi,
                    no_polis, berlaku_polis, file_asuransi,
                    luas_bangunan, luas_terbangun, luas_area_terbuka,
                    luas_area_parkir, luas_area_sales, luas_gudang,
                    grand_total, grand_total_non_sbo, grand_total_final,
                    created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [
                    tokoId,
                    payload.projek_planning_id ?? null,
                    payload.status,
                    payload.nama_pt,
                    payload.email_pembuat,
                    logoToPersist,
                    payload.durasi_pekerjaan,
                    payload.kategori_lokasi ?? null,
                    payload.no_polis ?? null,
                    payload.berlaku_polis ?? null,
                    insuranceToPersist,
                    payload.luas_bangunan ?? null,
                    payload.luas_terbangun ?? null,
                    payload.luas_area_terbuka ?? null,
                    payload.luas_area_parkir ?? null,
                    payload.luas_area_sales ?? null,
                    payload.luas_gudang ?? null,
                    payload.grand_total,
                    payload.grand_total_non_sbo,
                    payload.grand_total_final
                ]
            );

            const rab = res.rows[0];

            // 3. Insert rab_item
            await insertRabItems(client, rab.id, payload.detail_items);

            return { ...rab, toko_id: tokoId };
        });
    },

    /** Ambil RAB lengkap: header + toko + items */
    async findById(id: string): Promise<{
        rab: RabRow;
        toko: TokoJoinRow;
        items: RabItemRow[];
        revisi_items: RabRevisiItemRow[];
    } | null> {
        const header = await pool.query<RabRow & TokoJoinRow>(
            `SELECT ${RAB_COLUMNS},
                    t.id AS toko_id, t.nomor_ulok, t.lingkup_pekerjaan,
                    t.nama_toko, t.kode_toko, t.proyek, t.cabang, t.alamat, t.nama_kontraktor, t.takeover_sequence,
                director_user.nama_lengkap AS nama_lengkap_persetujuan_direktur
            FROM rab r
            JOIN toko t ON t.id = r.id_toko
            LEFT JOIN LATERAL (
                SELECT uc.nama_lengkap
                FROM user_cabang uc
                LEFT JOIN user_branch_coverage ubc
                  ON ubc.user_cabang_id = uc.id
                 AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(t.cabang))
                WHERE LOWER(uc.email_sat) = LOWER(r.pemberi_persetujuan_direktur)
                ORDER BY
                    CASE WHEN UPPER(TRIM(uc.cabang)) = UPPER(TRIM(t.cabang)) THEN 0 ELSE 1 END,
                    CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END,
                    uc.id
                LIMIT 1
            ) director_user ON TRUE
            WHERE r.id = $1`,
            [id]
        );

        if (header.rowCount === 0) return null;

        const row = header.rows[0];

        const items = await pool.query<RabItemRow>(
            `SELECT id, id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan,
                volume, harga_material, harga_upah,
                total_material, total_upah, total_harga, catatan
            FROM rab_item
            WHERE id_rab = $1
            ORDER BY id ASC`,
            [id]
        );

        const revisiItems = await pool.query<RabRevisiItemRow>(
            `SELECT id, id_rab, id_rab_item, approver_email, approver_role, catatan_item, created_at
             FROM rab_revisi_item
             WHERE id_rab = $1
             ORDER BY created_at ASC, id ASC`,
            [id]
        );

        const rab: RabRow = {
            id: row.id,
            id_toko: row.id_toko,
            projek_planning_id: row.projek_planning_id,
            no_sph: row.no_sph,
            status: row.status,
            nama_pt: row.nama_pt,
            email_pembuat: row.email_pembuat,
            logo: row.logo,
            link_pdf_gabungan: row.link_pdf_gabungan,
            link_pdf_non_sbo: row.link_pdf_non_sbo,
            link_pdf_rekapitulasi: row.link_pdf_rekapitulasi,
            link_pdf_materai: row.link_pdf_materai,
            pemberi_persetujuan_koordinator: row.pemberi_persetujuan_koordinator,
            nama_persetujuan_koordinator: row.nama_persetujuan_koordinator,
            waktu_persetujuan_koordinator: row.waktu_persetujuan_koordinator,
            pemberi_persetujuan_manager: row.pemberi_persetujuan_manager,
            nama_persetujuan_manager: row.nama_persetujuan_manager,
            waktu_persetujuan_manager: row.waktu_persetujuan_manager,
            pemberi_persetujuan_direktur: row.pemberi_persetujuan_direktur,
            nama_persetujuan_direktur: row.nama_persetujuan_direktur,
            nama_lengkap_persetujuan_direktur: (row as any).nama_lengkap_persetujuan_direktur ?? null,
            waktu_persetujuan_direktur: row.waktu_persetujuan_direktur,
            catatan_persetujuan_koordinator: row.catatan_persetujuan_koordinator,
            catatan_persetujuan_manager: row.catatan_persetujuan_manager,
            catatan_persetujuan_direktur: row.catatan_persetujuan_direktur,
            alasan_penolakan: row.alasan_penolakan,
            catatan_penolakan: row.catatan_penolakan,
            waktu_penolakan: row.waktu_penolakan,
            ditolak_oleh: row.ditolak_oleh,
            durasi_pekerjaan: row.durasi_pekerjaan,
            kategori_lokasi: row.kategori_lokasi,
            no_polis: row.no_polis,
            berlaku_polis: row.berlaku_polis,
            file_asuransi: row.file_asuransi,
            luas_bangunan: row.luas_bangunan,
            luas_terbangun: row.luas_terbangun,
            luas_area_terbuka: row.luas_area_terbuka,
            luas_area_parkir: row.luas_area_parkir,
            luas_area_sales: row.luas_area_sales,
            luas_gudang: row.luas_gudang,
            beanspot_type: row.beanspot_type,
            is_hth: row.is_hth,
            hth_meter: row.hth_meter,
            is_fasade: row.is_fasade,
            grand_total: row.grand_total,
            grand_total_non_sbo: row.grand_total_non_sbo,
            grand_total_final: row.grand_total_final,
            created_at: row.created_at
        };

        const toko: TokoJoinRow = {
            id: (row as any).toko_id,
            nomor_ulok: row.nomor_ulok,
            lingkup_pekerjaan: row.lingkup_pekerjaan,
            nama_toko: row.nama_toko,
            kode_toko: row.kode_toko,
            proyek: row.proyek,
            cabang: row.cabang,
            alamat: row.alamat,
            nama_kontraktor: row.nama_kontraktor,
            takeover_sequence: row.takeover_sequence
        };

        return { rab, toko, items: items.rows, revisi_items: revisiItems.rows };
    },

    async findMateraiLinksByNomorUlok(nomorUlok: string): Promise<Array<{
        id: number;
        id_toko: number;
        lingkup_pekerjaan: string | null;
        link_pdf_materai: string | null;
    }>> {
        const result = await pool.query<{
            id: number;
            id_toko: number;
            lingkup_pekerjaan: string | null;
            link_pdf_materai: string | null;
        }>(
            `SELECT r.id, r.id_toko, t.lingkup_pekerjaan, r.link_pdf_materai
             FROM rab r
             JOIN toko t ON t.id = r.id_toko
             WHERE UPPER(t.nomor_ulok) = UPPER($1)
               AND r.link_pdf_materai IS NOT NULL
               AND TRIM(r.link_pdf_materai) <> ''
             ORDER BY
               CASE
                 WHEN UPPER(COALESCE(t.lingkup_pekerjaan, '')) LIKE '%SIPIL%' THEN 1
                 WHEN UPPER(COALESCE(t.lingkup_pekerjaan, '')) LIKE '%ME%' THEN 2
                 ELSE 3
               END,
               r.id ASC`,
            [nomorUlok]
        );

        return result.rows;
    },

    async listItemsByRabId(rabId: number | string): Promise<RabItemRow[]> {
        const result = await pool.query<RabItemRow>(
            `SELECT id, id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan,
                volume, harga_material, harga_upah,
                total_material, total_upah, total_harga, catatan
            FROM rab_item
            WHERE id_rab = $1
            ORDER BY id ASC`,
            [rabId]
        );

        return result.rows;
    },

    async listItemsByOpnameFinalId(opnameFinalId: number): Promise<RabItemRow[]> {
        const result = await pool.query<RabItemRow>(
            `
            SELECT DISTINCT ri.*
            FROM opname_item oi
            JOIN rab_item ri ON ri.id = oi.id_rab_item
            WHERE oi.id_opname_final = $1
            ORDER BY ri.id ASC
            `,
            [opnameFinalId]
        );
        return result.rows;
    },

    async updateItemsBulk(
        rabId: number,
        items: Array<DetailItemInput & { id: number }>
    ): Promise<RabItemRow[]> {
        return withTransaction(async (client) => {
            const rabRes = await client.query<{ id: number }>(
                `SELECT id FROM rab WHERE id = $1 FOR UPDATE`,
                [rabId]
            );

            if ((rabRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            const updatedRows: RabItemRow[] = [];

            for (const item of items) {
                const totalMaterial = item.total_material ?? (item.volume * item.harga_material);
                const totalUpah = item.total_upah ?? (item.volume * item.harga_upah);
                const totalHarga = item.total_harga ?? (totalMaterial + totalUpah);
                const catatan = item.catatan?.trim() || null;

                const result = await client.query<RabItemRow>(
                    `UPDATE rab_item
                     SET kategori_pekerjaan = $1,
                         jenis_pekerjaan = $2,
                         satuan = $3,
                         volume = $4,
                         harga_material = $5,
                         harga_upah = $6,
                         total_material = $7,
                         total_upah = $8,
                         total_harga = $9,
                         catatan = $10
                     WHERE id = $11 AND id_rab = $12
                     RETURNING id, id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan,
                        volume, harga_material, harga_upah,
                        total_material, total_upah, total_harga, catatan`,
                    [
                        item.kategori_pekerjaan,
                        item.jenis_pekerjaan,
                        item.satuan,
                        toNumericString(item.volume),
                        toIntegerString(item.harga_material),
                        toIntegerString(item.harga_upah),
                        toIntegerString(totalMaterial),
                        toIntegerString(totalUpah),
                        toIntegerString(totalHarga),
                        catatan,
                        item.id,
                        rabId
                    ]
                );

                if ((result.rowCount ?? 0) === 0) {
                    throw new Error(`RAB item dengan id ${item.id} tidak ditemukan pada rab ${rabId}`);
                }

                updatedRows.push(mapUpdatedRabItemRow(result.rows[0]));
            }

            return updatedRows;
        });
    },

    async replaceItems(
        rabId: number,
        items: DetailItemInput[]
    ): Promise<number> {
        return withTransaction(async (client) => {
            const rabRes = await client.query<{ id: number }>(
                `SELECT id FROM rab WHERE id = $1 FOR UPDATE`,
                [rabId]
            );

            if ((rabRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            await client.query(
                `DELETE FROM rab_item WHERE id_rab = $1`,
                [rabId]
            );

            await insertRabItems(client, rabId, items);

            return items.length;
        });
    },

    async deleteItemsByIds(rabId: number, itemIds: number[]): Promise<number> {
        const result = await pool.query(
            `DELETE FROM rab_item WHERE id_rab = $1 AND id = ANY($2::int[])`,
            [rabId, itemIds]
        );

        return result.rowCount ?? 0;
    },

    async updateRabTotals(
        rabId: number,
        totals: { grand_total: string; grand_total_non_sbo: string; grand_total_final: string }
    ): Promise<void> {
        await pool.query(
            `UPDATE rab
             SET grand_total = $1,
                 grand_total_non_sbo = $2,
                 grand_total_final = $3
             WHERE id = $4`,
            [
                totals.grand_total,
                totals.grand_total_non_sbo,
                totals.grand_total_final,
                rabId
            ]
        );
    },
    /** List RAB dengan filter. Join toko untuk nomor_ulok filter. */
    async list(filter: { 
        status?: string; 
        nomor_ulok?: string; 
        cabang?: string; 
        cabang_array?: string[]; // NEW: Accept array of branches
        nama_pt?: string; 
        email_pembuat?: string; 
        id_toko?: number;
    }): Promise<(RabRow & {
        nomor_ulok: string;
        lingkup_pekerjaan: string | null;
        nama_toko: string | null;
        cabang: string | null;
        proyek: string | null;
    })[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`r.status = $${values.length}`);
        }

        if (filter.nomor_ulok) {
            // Gunakan ILIKE untuk partial match case-insensitive agar
            // pencarian "z001-2808-0021" tetap menemukan "Z001-2808-0021"
            values.push(`%${filter.nomor_ulok}%`);
            conditions.push(`t.nomor_ulok ILIKE $${values.length}`);
        }

        // NEW: Prioritize cabang_array over cabang for more precise filtering
        if (filter.cabang_array && filter.cabang_array.length > 0) {
            // Direct array match - no expansion needed
            // Controller already determined the exact branches user can access
            const normalizedBranches = filter.cabang_array.map(b => b.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        } else if (filter.cabang) {
            // Fallback to old behavior: expand using getBranchScopeCandidates
            values.push(getBranchScopeCandidates(filter.cabang));
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        }

        if (filter.nama_pt) {
            values.push(filter.nama_pt);
            // Normalisasi kedua sisi: hapus PT/CV dan karakter non-alfanumerik, lalu bandingkan exact.
            // Contoh: "CV ABADI TEKNIK" == "ABADI TEKNIK, CV" tapi != "PT ABADI TEKNIK SEJAHTERA"
            conditions.push(`
                REPLACE(REPLACE(regexp_replace(upper(r.nama_pt), '[^A-Z0-9]', '', 'g'), 'PT', ''), 'CV', '')
                =
                REPLACE(REPLACE(regexp_replace(upper($${values.length}::text), '[^A-Z0-9]', '', 'g'), 'PT', ''), 'CV', '')
            `);
        }

        if (filter.email_pembuat) {
            values.push(filter.email_pembuat.trim().toLowerCase());
            conditions.push(`LOWER(r.email_pembuat) = $${values.length}`);
        }

        if (filter.id_toko) {
            values.push(filter.id_toko);
            conditions.push(`r.id_toko = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT ${RAB_COLUMNS},
                t.nomor_ulok, t.lingkup_pekerjaan, t.nama_toko, t.cabang, t.proyek, t.takeover_sequence
            FROM rab r
            JOIN toko t ON t.id = r.id_toko
            ${whereClause}
            ORDER BY r.created_at DESC`,
            values
        );

        return result.rows;
    },

    /** Update status + kolom approval saat tindakan APPROVE di tabel rab */
    async updateApproval(
        rabId: string,
        newStatus: RabStatus,
        action: ApprovalActionInput
    ): Promise<void> {
        if (action.tindakan !== "APPROVE") {
            throw new Error("updateApproval hanya untuk tindakan APPROVE");
        }

        const approverName = (action.nama_lengkap ?? "").trim();
        const approvalNote = action.catatan_approval?.trim() || null;

        const sets: string[] = ["status = $1"];
        const values: unknown[] = [newStatus];

        if (action.jabatan === "KOORDINATOR") {
            values.push(action.approver_email);
            sets.push(`pemberi_persetujuan_koordinator = $${values.length}`);
            if (approverName) {
                values.push(approverName);
                sets.push(`nama_persetujuan_koordinator = $${values.length}`);
            }
            sets.push(`waktu_persetujuan_koordinator = timezone('Asia/Jakarta', now())`);
            values.push(approvalNote);
            sets.push(`catatan_persetujuan_koordinator = $${values.length}`);
            values.push(action.beanspot_type ?? null);
            sets.push(`beanspot_type = $${values.length}`);
            values.push(action.is_hth ?? null);
            sets.push(`is_hth = $${values.length}`);
            values.push(action.is_hth ? action.hth_meter ?? null : null);
            sets.push(`hth_meter = $${values.length}`);
            values.push(action.is_fasade ?? null);
            sets.push(`is_fasade = $${values.length}`);
        } else if (action.jabatan === "MANAGER") {
            values.push(action.approver_email);
            sets.push(`pemberi_persetujuan_manager = $${values.length}`);
            if (approverName) {
                values.push(approverName);
                sets.push(`nama_persetujuan_manager = $${values.length}`);
            }
            sets.push(`waktu_persetujuan_manager = timezone('Asia/Jakarta', now())`);
            values.push(approvalNote);
            sets.push(`catatan_persetujuan_manager = $${values.length}`);
        } else {
            values.push(action.approver_email);
            sets.push(`pemberi_persetujuan_direktur = $${values.length}`);
            if (approverName) {
                values.push(approverName);
                sets.push(`nama_persetujuan_direktur = $${values.length}`);
            }
            sets.push(`waktu_persetujuan_direktur = timezone('Asia/Jakarta', now())`);
            values.push(approvalNote);
            sets.push(`catatan_persetujuan_direktur = $${values.length}`);
        }

        values.push(rabId);
        await pool.query(
            `UPDATE rab SET ${sets.join(", ")} WHERE id = $${values.length}`,
            values
        );
    },

    /**
     * Saat REJECT, hanya update kolom penolakan di tabel rab.
     * Tidak menyentuh kolom tabel lain.
     */
    async rejectRab(
        rabId: string,
        newStatus: RabStatus,
        alasanPenolakan: string,
        ditolakOleh: string,
        catatanPenolakan?: string | null
    ): Promise<void> {
        await pool.query(
            `UPDATE rab
             SET status = $1,
                  alasan_penolakan = $2,
                  catatan_penolakan = $5,
                  waktu_penolakan = timezone('Asia/Jakarta', now()),
                 ditolak_oleh = $3,
                 nama_persetujuan_direktur = NULL,
                 nama_persetujuan_koordinator = NULL,
                 nama_persetujuan_manager = NULL
              WHERE id = $4`,
            [newStatus, alasanPenolakan, ditolakOleh, rabId, catatanPenolakan?.trim() || null]
        );
    },

    /**
     * Saat REJECT:
     * - Update kolom penolakan di tabel rab
     * - Aktifkan gantt_chart terbaru milik toko terkait
     * - Lindungi kolom toko agar tidak berubah oleh side-effect trigger
     */
    async rejectRabAndActivateLatestGanttGuarded(
        rabId: string,
        newStatus: RabStatus,
        alasanPenolakan: string,
        ditolakOleh: string,
        catatanPenolakan?: string | null,
        revisiItems?: Array<{ id_rab_item: number | null; catatan_item?: string | null }>
    ): Promise<void> {
        await withTransaction(async (client) => {
            const rabRes = await client.query<{ id_toko: number }>(
                `SELECT id_toko
                 FROM rab
                 WHERE id = $1
                 FOR UPDATE`,
                [rabId]
            );

            if ((rabRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            const tokoId = rabRes.rows[0].id_toko;

            const tokoBeforeRes = await client.query<{
                nama_toko: string | null;
                kode_toko: string | null;
                proyek: string | null;
                cabang: string | null;
                alamat: string | null;
                nama_kontraktor: string | null;
            }>(
                `SELECT nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
                 FROM toko
                 WHERE id = $1
                 FOR UPDATE`,
                [tokoId]
            );

            if ((tokoBeforeRes.rowCount ?? 0) === 0) {
                throw new Error(`Toko dengan id ${tokoId} tidak ditemukan`);
            }

            const tokoBefore = tokoBeforeRes.rows[0];
            await client.query(
                `UPDATE rab
                 SET status = $1,
                      alasan_penolakan = $2,
                      catatan_penolakan = $5,
                      waktu_penolakan = timezone('Asia/Jakarta', now()),
                     ditolak_oleh = $3,
                     nama_persetujuan_direktur = NULL,
                     nama_persetujuan_koordinator = NULL,
                     nama_persetujuan_manager = NULL
                  WHERE id = $4`,
                [newStatus, alasanPenolakan, ditolakOleh, rabId, catatanPenolakan?.trim() || null]
            );

            await client.query(`DELETE FROM rab_revisi_item WHERE id_rab = $1`, [rabId]);
            for (const item of revisiItems ?? []) {
                await client.query(
                    `INSERT INTO rab_revisi_item (
                        id_rab, id_rab_item, approver_email, approver_role, catatan_item
                    ) VALUES ($1, $2, $3, $4, $5)`,
                    [
                        rabId,
                        item.id_rab_item,
                        ditolakOleh,
                        newStatus,
                        item.catatan_item?.trim() || null
                    ]
                );
            }

            // --- Step 2: Koordinator menolak RAB => buka kembali Gantt yang terkunci ---
            if (newStatus === RAB_STATUS.REJECTED_BY_COORDINATOR) {
                const ganttResult = await client.query<{ id: number; status: string }>(
                    `
                    SELECT id, status
                    FROM gantt_chart
                    WHERE id_toko = $1
                    ORDER BY id DESC
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [tokoId]
                );
                const gantt = ganttResult.rows[0];

                if (gantt && gantt.status.toLowerCase() !== "active") {
                    await client.query(
                        "UPDATE gantt_chart SET status = 'active' WHERE id = $1",
                        [gantt.id]
                    );
                    await activityLogRepository.insert({
                        entity_type: "GANTT",
                        entity_id: gantt.id,
                        actor_email: ditolakOleh,
                        actor_role: "KOORDINATOR",
                        action: "RAB_REJECTED_REOPEN_GANTT",
                        status_before: gantt.status,
                        status_after: "active",
                        reason: alasanPenolakan,
                        metadata: {
                            id_toko: tokoId,
                            id_rab: Number(rabId),
                            source: "rab_rejected_by_coordinator",
                        },
                    }, client);
                }
            }

            // --- Step 3: Hard-guard — restore toko stable fields ---
            await client.query(
                `UPDATE toko
                 SET nama_toko = COALESCE($1, nama_toko),
                     kode_toko = COALESCE($2, kode_toko),
                     proyek = COALESCE($3, proyek),
                     cabang = COALESCE($4, cabang),
                     alamat = COALESCE($5, alamat),
                     nama_kontraktor = COALESCE($6, nama_kontraktor)
                 WHERE id = $7`,
                [
                    tokoBefore.nama_toko,
                    tokoBefore.kode_toko,
                    tokoBefore.proyek,
                    tokoBefore.cabang,
                    tokoBefore.alamat,
                    tokoBefore.nama_kontraktor,
                    tokoId
                ]
            );

            // --- Step 4: Verify toko wasn't corrupted by triggers ---
            const tokoAfterRes = await client.query<{
                nama_toko: string | null;
                kode_toko: string | null;
                proyek: string | null;
                cabang: string | null;
                alamat: string | null;
                nama_kontraktor: string | null;
            }>(
                `SELECT nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
                 FROM toko
                 WHERE id = $1`,
                [tokoId]
            );

            const tokoAfter = tokoAfterRes.rows[0];

            // Normalize field for comparison: trim whitespace, treat null/undefined/''/'-' as equivalent empty
            const normalizeTokoField = (v: string | null | undefined): string =>
                (v ?? "").trim().replace(/\s+/g, " ");

            const tokoFieldsChanged = (
                [
                    "nama_toko",
                    "kode_toko",
                    "proyek",
                    "cabang",
                    "alamat",
                    "nama_kontraktor",
                ] as const
            ).filter(
                (key) =>
                    normalizeTokoField(tokoBefore[key]) !==
                    normalizeTokoField(tokoAfter[key])
            );

            if (tokoFieldsChanged.length > 0) {
                // Log as warning but do NOT throw — the rejection itself succeeded
                // and blocking it here would leave the RAB stuck in pending state.
                // This can happen if a PostgreSQL trigger normalizes a text column.
                console.error(
                    `[rejectRAB] Guard warning: toko id=${tokoId} field(s) changed during reject (${tokoFieldsChanged.join(", ")}). Logging only, rejection proceeds.`,
                    { tokoBefore, tokoAfter, rabId, newStatus, tokoFieldsChanged }
                );
            }
        });
    },

    /** Simpan link PDF SPH setelah upload ke Drive */
    async updateSphPdfLink(rabId: string, linkPdfSph: string): Promise<void> {
        await pool.query(
            `UPDATE rab SET link_pdf_sph = $1 WHERE id = $2`,
            [linkPdfSph, rabId]
        );
    },

    async updateMateraiPdfLink(rabId: string, linkPdfMaterai: string | null): Promise<void> {
        await pool.query(
            `UPDATE rab SET link_pdf_materai = $1 WHERE id = $2`,
            [linkPdfMaterai, rabId]
        );
    },

    /**
     * Ambil / assign no_sph dengan aturan:
     * - jika rab sudah punya no_sph, pakai itu
     * - jika belum, generate nomor acak 4 digit (1000-9999)
     */
    async ensureSphNumber(rabId: string): Promise<number> {
        return withTransaction(async (client) => {
            await client.query(`SELECT pg_advisory_xact_lock(hashtext('rab_no_sph_sequence'))`);

            const currentRes = await client.query<{ no_sph: number | null }>(
                `SELECT no_sph FROM rab WHERE id = $1 FOR UPDATE`,
                [rabId]
            );

            if ((currentRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            const currentNoSph = currentRes.rows[0].no_sph;
            if (currentNoSph !== null) {
                return currentNoSph;
            }

            const min = 1000;
            const max = 9999;
            const maxAttempts = 50;

            let nextNoSph: number | null = null;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const candidate = Math.floor(Math.random() * (max - min + 1)) + min;
                const existsRes = await client.query<{ exists: boolean }>(
                    `SELECT EXISTS(SELECT 1 FROM rab WHERE no_sph = $1) AS exists`,
                    [candidate]
                );

                if (!existsRes.rows[0]?.exists) {
                    nextNoSph = candidate;
                    break;
                }
            }

            if (nextNoSph === null) {
                throw new Error("Gagal generate no_sph acak 4 digit yang unik");
            }

            const updatedRes = await client.query<{ no_sph: number }>(
                `UPDATE rab
                 SET no_sph = $1
                 WHERE id = $2
                 RETURNING no_sph`,
                [nextNoSph, rabId]
            );

            return updatedRes.rows[0].no_sph;
        });
    },

    /** Simpan link PDF setelah upload ke Drive */
    async updatePdfLinks(
        rabId: string,
        links: {
            link_pdf_gabungan: string;
            link_pdf_non_sbo: string;
            link_pdf_rekapitulasi: string;
        }
    ): Promise<void> {
        await pool.query(
            `UPDATE rab
             SET link_pdf_gabungan = $1,
                 link_pdf_non_sbo = $2,
                 link_pdf_rekapitulasi = $3
             WHERE id = $4`,
            [links.link_pdf_gabungan, links.link_pdf_non_sbo, links.link_pdf_rekapitulasi, rabId]
        );
    },

    /**
     * Pulihkan kolom toko yang wajib stabil setelah proses approval RAB.
     * Ini menjadi guard jika ada side-effect trigger saat update tabel rab.
     */
    async restoreTokoStableFieldsByRabId(rabId: string, fields: TokoStableFields): Promise<void> {
        await pool.query(
            `UPDATE toko t
             SET nama_toko = COALESCE($1, nama_toko),
                 kode_toko = COALESCE($2, kode_toko),
                 proyek = COALESCE($3, proyek),
                 cabang = COALESCE($4, cabang),
                 alamat = COALESCE($5, alamat),
                 nama_kontraktor = COALESCE($6, nama_kontraktor)
             FROM rab r
             WHERE r.id = $7
               AND t.id = r.id_toko`,
            [fields.nama_toko, fields.kode_toko, fields.proyek, fields.cabang, fields.alamat, fields.nama_kontraktor, rabId]
        );
    },

    /**
     * Update status RAB menjadi Ditolak.
     * - Update kolom status, alasan_penolakan, ditolak_oleh, waktu_penolakan
     * - Aktifkan gantt_chart terbaru milik toko terkait (status → 'active')
     * - Lindungi kolom toko agar tidak berubah oleh side-effect trigger
     */
    async updateRabStatusWithRejection(
        rabId: number,
        tokoId: number,
        newStatus: RabStatus,
        ditolakOleh: string
    ): Promise<void> {
        await withTransaction(async (client) => {
            // Lock RAB row
            const rabRes = await client.query<{ id_toko: number }>(
                `SELECT id_toko
                 FROM rab
                 WHERE id = $1
                 FOR UPDATE`,
                [rabId]
            );

            if ((rabRes.rowCount ?? 0) === 0) {
                throw new Error(`RAB dengan id ${rabId} tidak ditemukan`);
            }

            // Lock & snapshot toko stable fields
            const tokoBeforeRes = await client.query<{
                nama_toko: string | null;
                kode_toko: string | null;
                proyek: string | null;
                cabang: string | null;
                alamat: string | null;
                nama_kontraktor: string | null;
            }>(
                `SELECT nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
                 FROM toko
                 WHERE id = $1
                 FOR UPDATE`,
                [tokoId]
            );

            if ((tokoBeforeRes.rowCount ?? 0) === 0) {
                throw new Error(`Toko dengan id ${tokoId} tidak ditemukan`);
            }

            const tokoBefore = tokoBeforeRes.rows[0];

            // Step 1: Update RAB status + rejection metadata
            await client.query(
                `UPDATE rab
                 SET status = $1,
                     ditolak_oleh = $2,
                     waktu_penolakan = timezone('Asia/Jakarta', now()),
                     nama_persetujuan_direktur = NULL,
                     nama_persetujuan_koordinator = NULL,
                     nama_persetujuan_manager = NULL
                 WHERE id = $3`,
                [newStatus, ditolakOleh, rabId]
            );

            // Step 2: Activate latest gantt_chart for this toko
            await client.query(
                `UPDATE gantt_chart
                 SET status = 'active'
                 WHERE id = (
                    SELECT id
                    FROM gantt_chart
                    WHERE id_toko = $1
                    ORDER BY id DESC
                    LIMIT 1
                 )`,
                [tokoId]
            );

            // Step 3: Hard-guard — restore toko stable fields
            await client.query(
                `UPDATE toko
                 SET nama_toko = COALESCE($1, nama_toko),
                     kode_toko = COALESCE($2, kode_toko),
                     proyek = COALESCE($3, proyek),
                     cabang = COALESCE($4, cabang),
                     alamat = COALESCE($5, alamat),
                     nama_kontraktor = COALESCE($6, nama_kontraktor)
                 WHERE id = $7`,
                [
                    tokoBefore.nama_toko,
                    tokoBefore.kode_toko,
                    tokoBefore.proyek,
                    tokoBefore.cabang,
                    tokoBefore.alamat,
                    tokoBefore.nama_kontraktor,
                    tokoId
                ]
            );

            // Step 4: Verify toko wasn't corrupted by triggers
            const tokoAfterRes = await client.query<{
                nama_toko: string | null;
                kode_toko: string | null;
                proyek: string | null;
                cabang: string | null;
                alamat: string | null;
                nama_kontraktor: string | null;
            }>(
                `SELECT nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
                 FROM toko
                 WHERE id = $1`,
                [tokoId]
            );

            const tokoAfter = tokoAfterRes.rows[0];

            // Normalize field for comparison: trim whitespace, treat null as empty
            const normalizeTokoField2 = (v: string | null | undefined): string =>
                (v ?? "").trim().replace(/\s+/g, " ");

            const tokoFieldsChanged2 = (
                [
                    "nama_toko",
                    "kode_toko",
                    "proyek",
                    "cabang",
                    "alamat",
                    "nama_kontraktor",
                ] as const
            ).filter(
                (key) =>
                    normalizeTokoField2(tokoBefore[key]) !==
                    normalizeTokoField2(tokoAfter[key])
            );

            if (tokoFieldsChanged2.length > 0) {
                // Log as warning only — do NOT throw, to avoid blocking valid status updates.
                console.error(
                    `[updateRabStatusWithRejection] Guard warning: toko id=${tokoId} field(s) changed (${tokoFieldsChanged2.join(", ")}). Logging only, update proceeds.`,
                    { tokoBefore, tokoAfter, rabId, newStatus, tokoFieldsChanged2 }
                );
            }
        });
    }
};
