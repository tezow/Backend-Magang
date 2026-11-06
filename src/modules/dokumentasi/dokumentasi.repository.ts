import { pool, withTransaction } from "../../db/pool";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import type {
    DokumentasiBangunanCreateInput,
    DokumentasiBangunanListQueryInput,
    DokumentasiBangunanPrefillQueryInput,
    DokumentasiBangunanUpdateInput
} from "./dokumentasi.schema";

export type DokumentasiBangunanRow = {
    id: number;
    jenis_toko: "REGULAR" | "FRANCHISE";
    nomor_ulok: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    tanggal_go: string | null;
    tanggal_serah_terima: string | null;
    tanggal_ambil_foto: string | null;
    spk_awal: string | null;
    spk_akhir: string | null;
    kontraktor_sipil: string | null;
    kontraktor_me: string | null;
    link_pdf: string | null;
    email_pengirim: string | null;
    status_validasi: string | null;
    alasan_revisi: string | null;
    pic_dokumentasi: string | null;
    created_at: string;
};

export type DokumentasiBangunanItemRow = {
    id: number;
    id_dokumentasi_bangunan: number;
    item_index: number | null;
    link_foto: string | null;
    sudut_foto: string | null;
    created_at: string;
};

export type DokumentasiBangunanDetail = {
    dokumentasi: DokumentasiBangunanRow;
    items: DokumentasiBangunanItemRow[];
};

export type DokumentasiBangunanPrefillSourceRow = {
    id_toko: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    proyek: string | null;
    toko_nama_kontraktor: string | null;
    rab_nama_pt: string | null;
    spk_nama_kontraktor: string | null;
    spk_waktu_mulai: string | null;
    spk_waktu_selesai: string | null;
    spk_effective_waktu_selesai: string | null;
    st_created_at: string | null;
    tanggal_serah_terima_denda: string | null;
};

export const dokumentasiBangunanRepository = {
    async create(input: DokumentasiBangunanCreateInput): Promise<DokumentasiBangunanRow> {
        const result = await pool.query<DokumentasiBangunanRow>(
            `
            INSERT INTO dokumentasi_bangunan (
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING
                id,
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                link_pdf,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi,
                created_at
            `,
            [
                input.jenis_toko ?? "REGULAR",
                input.nomor_ulok,
                input.nama_toko,
                input.kode_toko,
                input.cabang ?? null,
                input.tanggal_go ?? null,
                input.tanggal_serah_terima ?? null,
                input.tanggal_ambil_foto ?? null,
                input.spk_awal ?? null,
                input.spk_akhir ?? null,
                input.kontraktor_sipil ?? null,
                input.kontraktor_me ?? null,
                input.email_pengirim ?? null,
                input.status_validasi ?? null,
                input.alasan_revisi ?? null,
                input.pic_dokumentasi ?? null
            ]
        );

        return result.rows[0];
    },

    async update(id: number, input: DokumentasiBangunanUpdateInput): Promise<DokumentasiBangunanRow | null> {
        const fields: string[] = [];
        const values: Array<string | null> = [];

        const pushField = (column: string, value: string | undefined) => {
            if (typeof value === "undefined") return;
            values.push(value ?? null);
            fields.push(`${column} = $${values.length}`);
        };

        pushField("jenis_toko", input.jenis_toko);
        pushField("nomor_ulok", input.nomor_ulok);
        pushField("nama_toko", input.nama_toko);
        pushField("kode_toko", input.kode_toko);
        pushField("cabang", input.cabang);
        pushField("tanggal_go", input.tanggal_go);
        pushField("tanggal_serah_terima", input.tanggal_serah_terima);
        pushField("tanggal_ambil_foto", input.tanggal_ambil_foto);
        pushField("spk_awal", input.spk_awal);
        pushField("spk_akhir", input.spk_akhir);
        pushField("kontraktor_sipil", input.kontraktor_sipil);
        pushField("kontraktor_me", input.kontraktor_me);
        pushField("email_pengirim", input.email_pengirim);
        pushField("status_validasi", input.status_validasi);
        pushField("alasan_revisi", input.alasan_revisi);
        pushField("pic_dokumentasi", input.pic_dokumentasi);

        if (fields.length === 0) {
            return this.findById(id);
        }

        const result = await pool.query<DokumentasiBangunanRow>(
            `
            UPDATE dokumentasi_bangunan
            SET ${fields.join(", ")}
            WHERE id = $${values.length + 1}
            RETURNING
                id,
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                link_pdf,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi,
                created_at
            `,
            [...values, id]
        );

        return result.rows[0] ?? null;
    },

    async updatePdfLink(id: number, linkPdf: string): Promise<void> {
        await pool.query(
            `UPDATE dokumentasi_bangunan SET link_pdf = $1 WHERE id = $2`,
            [linkPdf, id]
        );
    },

    async findById(id: number): Promise<DokumentasiBangunanRow | null> {
        const result = await pool.query<DokumentasiBangunanRow>(
            `
            SELECT
                id,
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                link_pdf,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi,
                created_at
            FROM dokumentasi_bangunan
            WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async findByUlok(nomorUlok: string): Promise<DokumentasiBangunanRow | null> {
        const result = await pool.query<DokumentasiBangunanRow>(
            `
            SELECT
                id,
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                link_pdf,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi,
                created_at
            FROM dokumentasi_bangunan
            WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM($1))
            LIMIT 1
            `,
            [nomorUlok]
        );

        return result.rows[0] ?? null;
    },

    async list(query: DokumentasiBangunanListQueryInput): Promise<DokumentasiBangunanRow[]> {
        const conditions: string[] = [];
        const values: Array<string | string[]> = [];

        // SECURITY: Branch filtering - wajib ada untuk user non-global
        if (query.cabang_array && query.cabang_array.length > 0) {
            const normalizedBranches = query.cabang_array.map(b => b.trim().toUpperCase());
            values.push(normalizedBranches as any);
            conditions.push(`UPPER(TRIM(cabang)) = ANY($${values.length})`);
            console.log('[DOKUMENTASI FILTER] Branch filter applied:', normalizedBranches);
        } else {
            // Jika sampai sini tanpa cabang_array, berarti ada bug di controller/filter logic
            console.warn('[DOKUMENTASI FILTER] NO BRANCH FILTER! This should not happen for non-global users');
        }

        if (query.kode_toko) {
            values.push(query.kode_toko);
            conditions.push(`LOWER(kode_toko) = LOWER($${values.length})`);
        }

        if (query.nomor_ulok) {
            values.push(query.nomor_ulok);
            conditions.push(`LOWER(nomor_ulok) = LOWER($${values.length})`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<DokumentasiBangunanRow>(
            `
            SELECT
                id,
                jenis_toko,
                nomor_ulok,
                nama_toko,
                kode_toko,
                cabang,
                tanggal_go,
                tanggal_serah_terima,
                tanggal_ambil_foto,
                spk_awal,
                spk_akhir,
                kontraktor_sipil,
                kontraktor_me,
                link_pdf,
                email_pengirim,
                status_validasi,
                alasan_revisi,
                pic_dokumentasi,
                created_at
            FROM dokumentasi_bangunan
            ${whereClause}
            ORDER BY created_at DESC, id DESC
            `,
            values
        );

        return result.rows;
    },

    async listPrefillSources(query: DokumentasiBangunanPrefillQueryInput): Promise<DokumentasiBangunanPrefillSourceRow[]> {
        const conditions: string[] = [
            `NULLIF(TRIM(COALESCE(t.nomor_ulok, '')), '') IS NOT NULL`
        ];
        const values: Array<string | string[]> = [];

        if (query.cabang) {
            values.push(getBranchScopeCandidates(query.cabang).map(b => b.replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase()));
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        }

        if (!query.include_submitted) {
            conditions.push(`
                NOT EXISTS (
                    SELECT 1
                    FROM dokumentasi_bangunan db
                    WHERE UPPER(TRIM(COALESCE(db.nomor_ulok, ''))) = UPPER(TRIM(COALESCE(t.nomor_ulok, '')))
                )
            `);
        }

        // Wajib ada Serah Terima (baik dari berkas maupun denda)
        conditions.push(`(st_latest.created_at IS NOT NULL OR opname_latest.tanggal_serah_terima_denda IS NOT NULL)`);

        // Wajib KTK Final / Opname Final sudah disetujui
        conditions.push(`UPPER(TRIM(COALESCE(opname_latest.status_opname_final, ''))) = 'DISETUJUI'`);

        const result = await pool.query<DokumentasiBangunanPrefillSourceRow>(
            `
            SELECT
                t.id AS id_toko,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                t.cabang,
                t.proyek,
                t.nama_kontraktor AS toko_nama_kontraktor,
                rab_latest.nama_pt AS rab_nama_pt,
                spk_latest.nama_kontraktor AS spk_nama_kontraktor,
                spk_latest.waktu_mulai AS spk_waktu_mulai,
                spk_latest.waktu_selesai AS spk_waktu_selesai,
                spk_latest.effective_waktu_selesai AS spk_effective_waktu_selesai,
                st_latest.created_at AS st_created_at,
                opname_latest.tanggal_serah_terima_denda
            FROM toko t
            JOIN LATERAL (
                SELECT r.nama_pt
                FROM rab r
                WHERE r.id_toko = t.id
                ORDER BY r.created_at DESC, r.id DESC
                LIMIT 1
            ) rab_latest ON true
            JOIN LATERAL (
                SELECT
                    candidate.nama_kontraktor,
                    candidate.waktu_mulai,
                    candidate.waktu_selesai,
                    candidate.effective_end_date::text AS effective_waktu_selesai
                FROM (
                    SELECT
                        ps.nama_kontraktor,
                        ps.waktu_mulai,
                        ps.waktu_selesai,
                        COALESCE(
                            extension_latest.approved_until,
                            CASE
                                WHEN ps.waktu_selesai::text ~ '^\\d{4}-\\d{2}-\\d{2}'
                                    THEN LEFT(ps.waktu_selesai::text, 10)::date
                                WHEN ps.waktu_selesai::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
                                    THEN to_date(ps.waktu_selesai::text, 'DD/MM/YYYY')
                                ELSE NULL
                            END
                        ) AS effective_end_date
                    FROM pengajuan_spk ps
                    LEFT JOIN LATERAL (
                        SELECT MAX(
                            CASE
                                WHEN pt.tanggal_spk_akhir_setelah_perpanjangan::text ~ '^\\d{4}-\\d{2}-\\d{2}'
                                    THEN LEFT(pt.tanggal_spk_akhir_setelah_perpanjangan::text, 10)::date
                                WHEN pt.tanggal_spk_akhir_setelah_perpanjangan::text ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
                                    THEN to_date(pt.tanggal_spk_akhir_setelah_perpanjangan::text, 'DD/MM/YYYY')
                                ELSE NULL
                            END
                        ) AS approved_until
                        FROM pengajuan_spk ps_scope
                        JOIN pertambahan_spk pt ON pt.id_spk = ps_scope.id
                        WHERE UPPER(TRIM(COALESCE(ps_scope.nomor_ulok, ''))) = UPPER(TRIM(COALESCE(t.nomor_ulok, '')))
                          AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
                    ) extension_latest ON true
                    WHERE ps.id_toko = t.id
                      AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI')
                    ORDER BY ps.created_at DESC, ps.id DESC
                    LIMIT 1
                ) candidate
                WHERE candidate.effective_end_date IS NOT NULL
                  AND candidate.effective_end_date <= CURRENT_DATE
            ) spk_latest ON true
            LEFT JOIN LATERAL (
                SELECT bst.created_at
                FROM berkas_serah_terima bst
                WHERE bst.id_toko = t.id
                ORDER BY bst.created_at DESC, bst.id DESC
                LIMIT 1
            ) st_latest ON true
            LEFT JOIN LATERAL (
                SELECT ofn.tanggal_serah_terima_denda, ofn.status_opname_final
                FROM opname_final ofn
                WHERE ofn.id_toko = t.id
                ORDER BY ofn.id DESC
                LIMIT 1
            ) opname_latest ON true
            WHERE ${conditions.join(" AND ")}
            ORDER BY t.nomor_ulok ASC, t.id ASC
            `,
            values
        );

        return result.rows;
    },

    async delete(id: number): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM dokumentasi_bangunan WHERE id = $1`,
            [id]
        );

        return (result.rowCount ?? 0) > 0;
    },

    async getItems(idDokumentasi: number): Promise<DokumentasiBangunanItemRow[]> {
        const result = await pool.query<DokumentasiBangunanItemRow>(
            `
            SELECT id, id_dokumentasi_bangunan, item_index, link_foto, sudut_foto, created_at
            FROM dokumentasi_bangunan_item
            WHERE id_dokumentasi_bangunan = $1
            ORDER BY COALESCE(item_index, id) ASC, id ASC
            `,
            [idDokumentasi]
        );

        return result.rows;
    },

    async createItemsBulk(
        idDokumentasi: number,
        items: { link_foto: string; sudut_foto?: string | null; item_index?: number | null }[]
    ): Promise<DokumentasiBangunanItemRow[]> {
        if (items.length === 0) return [];

        return withTransaction(async (client) => {
            const values: Array<number | string | null> = [];
            const placeholders = items.map((item, index) => {
                const base = index * 4;
                values.push(idDokumentasi, item.item_index ?? null, item.link_foto, item.sudut_foto ?? null);
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
            });

            const result = await client.query<DokumentasiBangunanItemRow>(
                `
                INSERT INTO dokumentasi_bangunan_item (id_dokumentasi_bangunan, item_index, link_foto, sudut_foto)
                VALUES ${placeholders.join(", ")}
                RETURNING id, id_dokumentasi_bangunan, item_index, link_foto, sudut_foto, created_at
                `,
                values
            );

            return result.rows;
        });
    },

    async deleteItem(itemId: number): Promise<DokumentasiBangunanItemRow | null> {
        const result = await pool.query<DokumentasiBangunanItemRow>(
            `
            DELETE FROM dokumentasi_bangunan_item
            WHERE id = $1
            RETURNING id, id_dokumentasi_bangunan, item_index, link_foto, sudut_foto, created_at
            `,
            [itemId]
        );

        return result.rows[0] ?? null;
    },

    async getDetail(id: number): Promise<DokumentasiBangunanDetail | null> {
        const dokumentasi = await this.findById(id);
        if (!dokumentasi) return null;
        const items = await this.getItems(id);
        return { dokumentasi, items };
    }
};
