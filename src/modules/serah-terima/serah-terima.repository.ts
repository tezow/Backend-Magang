import { pool } from "../../db/pool";

export type BerkasSerahTerimaRow = {
    id: number;
    id_toko: number;
    link_pdf: string | null;
    created_at: string;
};

export type BerkasSerahTerimaWithTokoRow = BerkasSerahTerimaRow & {
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
    nilai_penawaran: string | null;
    nilai_spk: string | null;
    nilai_opname: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    nomor_spk: string | null;
};

export type BerkasSerahTerimaDateCorrectionTargetRow = BerkasSerahTerimaRow & {
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    nama_kontraktor: string | null;
    opname_final_id: number | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
};

export type SerahTerimaDateCorrectionAuditRow = {
    id: number;
    berkas_serah_terima_id: number;
    id_toko: number;
    nomor_ulok: string | null;
    cabang: string | null;
    old_created_at: string | null;
    new_created_at: string;
    old_hari_denda: number | null;
    old_nilai_denda: string | null;
    old_tanggal_akhir_spk_denda: string | null;
    old_tanggal_serah_terima_denda: string | null;
    actor_email: string | null;
    actor_role: string | null;
    catatan: string | null;
    created_at: string;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    proyek: string | null;
};

export type OpnameFinalRow = {
    id: number;
    id_toko: number;
    aksi: string;
    status_opname_final: string;
    link_pdf_opname: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    alasan_penolakan: string | null;
    grand_total_opname: string | null;
    grand_total_rab: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    created_at: string;
};

export type OpnameItemDetailRow = {
    id: number;
    id_toko: number;
    id_opname_final: number;
    id_rab_item: number;
    status: string;
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
    // joined from rab_item
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    volume_rab: number | null;
    total_harga_rab: number | null;
};

export type TokoRow = {
    id: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

export type SerahTerimaDetail = {
    toko: TokoRow;
    opname_final: OpnameFinalRow;
    items: OpnameItemDetailRow[];
};

export type SupervisionCompletionRow = {
    gantt_id: number | null;
    total_latest_checkpoints: number;
    incomplete_checkpoints: number;
    total_checkpoints: number;
    filled_checkpoints: number;
    missing_checkpoints: number;
};

export const serahTerimaRepository = {
    async ensureDateCorrectionAuditSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS serah_terima_date_correction_audit (
                id SERIAL PRIMARY KEY,
                berkas_serah_terima_id INTEGER NOT NULL REFERENCES berkas_serah_terima(id) ON DELETE CASCADE,
                id_toko INTEGER NOT NULL,
                nomor_ulok TEXT,
                cabang TEXT,
                old_created_at TIMESTAMP,
                new_created_at TIMESTAMP NOT NULL,
                old_hari_denda INTEGER,
                old_nilai_denda NUMERIC,
                old_tanggal_akhir_spk_denda DATE,
                old_tanggal_serah_terima_denda DATE,
                actor_email TEXT,
                actor_role TEXT,
                catatan TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
    },

    async findTokoScopesByNomorUlok(nomorUlok: string, takeoverSequence?: number): Promise<TokoRow[]> {
        const values: any[] = [nomorUlok];
        let tsFilter = "AND COALESCE(takeover_sequence, 0) = (SELECT COALESCE(MAX(takeover_sequence), 0) FROM toko WHERE nomor_ulok = $1)";
        if (takeoverSequence !== undefined) {
            values.push(takeoverSequence);
            tsFilter = "AND COALESCE(takeover_sequence, 0) = $2";
        }

        const result = await pool.query<TokoRow>(
            `
            SELECT
                id,
                nomor_ulok,
                lingkup_pekerjaan,
                nama_toko,
                kode_toko,
                proyek,
                cabang,
                alamat,
                nama_kontraktor
            FROM toko
            WHERE nomor_ulok = $1 ${tsFilter}
            ORDER BY
                CASE
                    WHEN UPPER(TRIM(COALESCE(lingkup_pekerjaan, ''))) = 'SIPIL' THEN 0
                    WHEN UPPER(TRIM(COALESCE(lingkup_pekerjaan, ''))) = 'ME' THEN 1
                    ELSE 2
                END,
                id
            `,
            values
        );

        return result.rows;
    },

    async findTokoById(idToko: number): Promise<TokoRow | null> {
        const result = await pool.query<TokoRow>(
            `
            SELECT
                id,
                nomor_ulok,
                lingkup_pekerjaan,
                nama_toko,
                kode_toko,
                proyek,
                cabang,
                alamat,
                nama_kontraktor
            FROM toko
            WHERE id = $1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async findOpnameFinalByIdToko(idToko: number): Promise<OpnameFinalRow | null> {
        const result = await pool.query<OpnameFinalRow>(
            `
            SELECT
                id,
                id_toko,
                aksi,
                status_opname_final,
                link_pdf_opname,
                email_pembuat,
                pemberi_persetujuan_direktur,
                waktu_persetujuan_direktur,
                pemberi_persetujuan_koordinator,
                waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager,
                waktu_persetujuan_manager,
                alasan_penolakan,
                grand_total_opname,
                grand_total_rab,
                hari_denda,
                nilai_denda,
                tanggal_akhir_spk_denda,
                tanggal_serah_terima_denda,
                created_at
            FROM opname_final
            WHERE id_toko = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async findOpnameItemsByOpnameFinalId(opnameFinalId: number): Promise<OpnameItemDetailRow[]> {
        const result = await pool.query<OpnameItemDetailRow>(
            `
            SELECT
                oi.id,
                oi.id_toko,
                oi.id_opname_final,
                oi.id_rab_item,
                oi.status,
                oi.volume_akhir,
                oi.selisih_volume,
                oi.total_selisih,
                oi.total_harga_opname,
                oi.desain,
                oi.kualitas,
                oi.spesifikasi,
                COALESCE(NULLIF(oi.foto, ''), latest_pengawasan.dokumentasi) AS foto,
                oi.catatan,
                oi.created_at,
                ri.kategori_pekerjaan,
                ri.jenis_pekerjaan,
                ri.satuan,
                ri.volume     AS volume_rab,
                ri.total_harga AS total_harga_rab
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
            LEFT JOIN LATERAL (
                SELECT
                    p.dokumentasi
                FROM pengawasan p
                LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
                WHERE p.id_gantt = (
                    SELECT g.id
                    FROM gantt_chart g
                    WHERE g.id_toko = oi.id_toko
                    ORDER BY g.id DESC
                    LIMIT 1
                )
                  AND UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))) = UPPER(TRIM(COALESCE(
                        ri.kategori_pekerjaan,
                        ili.kategori_pekerjaan,
                        ''
                  )))
                  AND UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(
                        ri.jenis_pekerjaan,
                        ili.jenis_pekerjaan,
                        ''
                  )))
                  AND NULLIF(TRIM(COALESCE(p.dokumentasi, '')), '') IS NOT NULL
                ORDER BY
                    to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST,
                    p.id DESC
                LIMIT 1
            ) latest_pengawasan ON true
            WHERE oi.id_opname_final = $1
            ORDER BY oi.id ASC
            `,
            [opnameFinalId]
        );

        return result.rows;
    },

    async getSupervisionCompletionByTokoId(idToko: number): Promise<SupervisionCompletionRow> {
        const result = await pool.query<SupervisionCompletionRow>(
            `
            WITH latest_gantt AS (
                SELECT id
                FROM gantt_chart
                WHERE id_toko = $1
                ORDER BY id DESC
                LIMIT 1
            ),
            latest_pengawasan AS (
                SELECT DISTINCT ON (
                    UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                )
                    p.kategori_pekerjaan,
                    p.jenis_pekerjaan,
                    p.status
                FROM pengawasan p
                LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
                JOIN latest_gantt g ON g.id = p.id_gantt
                ORDER BY
                    UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))),
                    to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST,
                    p.id DESC
            )
            SELECT
                (SELECT id FROM latest_gantt) AS gantt_id,
                COUNT(*)::int AS total_latest_checkpoints,
                COUNT(*) FILTER (WHERE COALESCE(lp.status, '') <> 'selesai')::int AS incomplete_checkpoints,
                COUNT(*) FILTER (WHERE lp.status = 'selesai')::int AS total_checkpoints,
                COUNT(*) FILTER (
                    WHERE lp.status = 'selesai'
                      AND EXISTS (
                        SELECT 1
                        FROM opname_item oi
                        LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                        LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                        WHERE oi.id_toko = $1
                          AND UPPER(TRIM(COALESCE(
                                ri.kategori_pekerjaan,
                                ili.kategori_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(REPLACE(COALESCE(lp.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(
                                ri.jenis_pekerjaan,
                                ili.jenis_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(COALESCE(lp.jenis_pekerjaan, '')))
                      )
                )::int AS filled_checkpoints,
                COUNT(*) FILTER (
                    WHERE lp.status = 'selesai'
                      AND EXISTS (
                        SELECT 1
                        FROM rab r
                        JOIN rab_item ri ON ri.id_rab = r.id
                        WHERE r.id_toko = $1
                          AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ''))) = UPPER(TRIM(REPLACE(COALESCE(lp.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(lp.jenis_pekerjaan, '')))
                        UNION ALL
                        SELECT 1
                        FROM instruksi_lapangan il
                        JOIN instruksi_lapangan_item ili ON ili.id_instruksi_lapangan = il.id
                        WHERE il.id_toko = $1
                          AND UPPER(TRIM(COALESCE(ili.kategori_pekerjaan, ''))) = UPPER(TRIM(REPLACE(COALESCE(lp.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(ili.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(lp.jenis_pekerjaan, '')))
                      )
                      AND NOT EXISTS (
                        SELECT 1
                        FROM opname_item oi
                        LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                        LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                        WHERE oi.id_toko = $1
                          AND UPPER(TRIM(COALESCE(
                                ri.kategori_pekerjaan,
                                ili.kategori_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(REPLACE(COALESCE(lp.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(
                                ri.jenis_pekerjaan,
                                ili.jenis_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(COALESCE(lp.jenis_pekerjaan, '')))
                      )
                )::int AS missing_checkpoints
            FROM latest_pengawasan lp
            `,
            [idToko]
        );

        return result.rows[0] ?? {
            gantt_id: null,
            total_latest_checkpoints: 0,
            incomplete_checkpoints: 0,
            total_checkpoints: 0,
            filled_checkpoints: 0,
            missing_checkpoints: 0,
        };
    },

    async countOpnameItemsByOpnameFinalId(opnameFinalId: number): Promise<number> {
        const result = await pool.query<{ count: string }>(
            `
            SELECT COUNT(*)::text AS count
            FROM opname_item
            WHERE id_opname_final = $1
            `,
            [opnameFinalId]
        );

        return Number(result.rows[0]?.count ?? 0);
    },

    async findBerkasSerahTerimaByIdToko(idToko: number): Promise<BerkasSerahTerimaRow | null> {
        const result = await pool.query<BerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id_toko = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async findBerkasSerahTerimaById(id: number): Promise<BerkasSerahTerimaRow | null> {
        const result = await pool.query<BerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id = $1
            LIMIT 1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async listBerkasSerahTerima(filter: { id_toko?: number; nomor_ulok?: string; cabang_array?: string[]; nama_kontraktor?: string } = {}): Promise<BerkasSerahTerimaWithTokoRow[]> {
        const values: Array<number | string> = [];
        const conditions: string[] = [];

        if (typeof filter.id_toko === "number") {
            values.push(filter.id_toko);
            conditions.push(`bst.id_toko = $${values.length}`);
        }

        if (filter.nomor_ulok) {
            values.push(filter.nomor_ulok);
            conditions.push(`t.nomor_ulok = $${values.length}`);
        }

        if (filter.cabang_array && filter.cabang_array.length > 0) {
            const normalizedBranches = filter.cabang_array.map(b => b.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase());
            values.push(normalizedBranches as any);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length})`);
        }

        if (filter.nama_kontraktor) {
            const normalizedKontraktor = filter.nama_kontraktor.toLowerCase().replace(/\b(pt|cv)\b/gi, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
            values.push(normalizedKontraktor);
            conditions.push(`LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.nama_kontraktor, '\\y(pt|cv)\\y|[\\.,]', ' ', 'gi'), '\\s+', ' ', 'g'))) = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<BerkasSerahTerimaWithTokoRow>(
            `
            SELECT
                bst.id,
                bst.id_toko,
                bst.link_pdf,
                bst.created_at,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                t.proyek,
                t.cabang,
                t.alamat,
                t.nama_kontraktor,
                rab_latest.grand_total_final AS nilai_penawaran,
                spk_latest.grand_total AS nilai_spk,
                opname_latest.grand_total_opname AS nilai_opname,
                opname_denda_latest.hari_denda,
                opname_denda_latest.nilai_denda,
                opname_denda_latest.tanggal_akhir_spk_denda,
                opname_denda_latest.tanggal_serah_terima_denda,
                spk_latest.nomor_spk
            FROM berkas_serah_terima bst
            JOIN toko t ON t.id = bst.id_toko
            LEFT JOIN LATERAL (
                SELECT grand_total_final
                FROM rab
                WHERE id_toko = bst.id_toko
                ORDER BY id DESC
                LIMIT 1
            ) rab_latest ON true
            LEFT JOIN LATERAL (
                SELECT nomor_spk, grand_total
                FROM pengajuan_spk
                WHERE id_toko = bst.id_toko
                  AND UPPER(COALESCE(status, '')) NOT IN ('REJECTED', 'REJECT', 'CANCELLED', 'CANCEL')
                ORDER BY id DESC
                LIMIT 1
            ) spk_latest ON true
            LEFT JOIN LATERAL (
                SELECT grand_total_opname
                FROM opname_final
                WHERE id_toko = bst.id_toko
                ORDER BY id DESC
                LIMIT 1
            ) opname_latest ON true
            LEFT JOIN LATERAL (
                SELECT hari_denda, nilai_denda, tanggal_akhir_spk_denda, tanggal_serah_terima_denda
                FROM opname_final ofin
                JOIN toko t2 ON t2.id = ofin.id_toko
                WHERE t2.nomor_ulok = t.nomor_ulok
                ORDER BY CAST(ofin.nilai_denda AS NUMERIC) DESC
                LIMIT 1
            ) opname_denda_latest ON true
            ${whereClause}
            ORDER BY bst.created_at DESC, bst.id DESC
            `,
            values
        );

        return result.rows;
    },

    async findDateCorrectionTargets(input: { nomor_ulok: string; cabang?: string | null }): Promise<BerkasSerahTerimaDateCorrectionTargetRow[]> {
        const result = await pool.query<BerkasSerahTerimaDateCorrectionTargetRow>(
            `
            SELECT
                bst.id,
                bst.id_toko,
                bst.link_pdf,
                bst.created_at,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                t.proyek,
                t.cabang,
                t.nama_kontraktor,
                opname_latest.id AS opname_final_id,
                opname_latest.hari_denda,
                opname_latest.nilai_denda,
                opname_latest.tanggal_akhir_spk_denda,
                opname_latest.tanggal_serah_terima_denda
            FROM berkas_serah_terima bst
            JOIN toko t ON t.id = bst.id_toko
            LEFT JOIN LATERAL (
                SELECT id, hari_denda, nilai_denda, tanggal_akhir_spk_denda, tanggal_serah_terima_denda
                FROM opname_final
                WHERE id_toko = bst.id_toko
                ORDER BY id DESC
                LIMIT 1
            ) opname_latest ON true
            WHERE t.nomor_ulok = $1
              AND ($2::text IS NULL OR UPPER(t.cabang) = UPPER($2::text))
            ORDER BY
                CASE
                    WHEN UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = 'SIPIL' THEN 0
                    WHEN UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = 'ME' THEN 1
                    ELSE 2
                END,
                bst.id
            `,
            [input.nomor_ulok, input.cabang ?? null]
        );

        return result.rows;
    },

    async updateBerkasSerahTerimaDate(input: { ids: number[]; tanggal: string }): Promise<BerkasSerahTerimaRow[]> {
        if (input.ids.length === 0) return [];

        const updated = await pool.query<BerkasSerahTerimaRow>(
            `
            UPDATE berkas_serah_terima
            SET created_at = ($1::date + COALESCE(created_at::time, TIME '00:00:00'))::timestamp
            WHERE id = ANY($2::int[])
            RETURNING id, id_toko, link_pdf, created_at
            `,
            [input.tanggal, input.ids]
        );

        return updated.rows;
    },

    async insertDateCorrectionAudit(input: {
        targets: BerkasSerahTerimaDateCorrectionTargetRow[];
        updatedRows: BerkasSerahTerimaRow[];
        actorEmail?: string | null;
        actorRole?: string | null;
        catatan?: string | null;
    }): Promise<void> {
        if (input.targets.length === 0) return;

        const newCreatedAtById = new Map(input.updatedRows.map((row) => [row.id, row.created_at]));
        const values: unknown[] = [];
        const placeholders: string[] = [];

        input.targets.forEach((target, index) => {
            const offset = index * 14;
            placeholders.push(`(
                $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
                $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
                $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}
            )`);
            values.push(
                target.id,
                target.id_toko,
                target.nomor_ulok,
                target.cabang,
                target.created_at,
                newCreatedAtById.get(target.id) ?? target.created_at,
                target.hari_denda,
                target.nilai_denda,
                target.tanggal_akhir_spk_denda,
                target.tanggal_serah_terima_denda,
                input.actorEmail ?? null,
                input.actorRole ?? null,
                input.catatan ?? null,
                new Date()
            );
        });

        await pool.query(
            `
            INSERT INTO serah_terima_date_correction_audit (
                berkas_serah_terima_id,
                id_toko,
                nomor_ulok,
                cabang,
                old_created_at,
                new_created_at,
                old_hari_denda,
                old_nilai_denda,
                old_tanggal_akhir_spk_denda,
                old_tanggal_serah_terima_denda,
                actor_email,
                actor_role,
                catatan,
                created_at
            )
            VALUES ${placeholders.join(", ")}
            `,
            values
        );
    },

    async listDateCorrectionAudit(input: { nomor_ulok: string; cabang?: string | null }): Promise<SerahTerimaDateCorrectionAuditRow[]> {
        await this.ensureDateCorrectionAuditSchema();

        const result = await pool.query<SerahTerimaDateCorrectionAuditRow>(
            `
            SELECT
                audit.id,
                audit.berkas_serah_terima_id,
                audit.id_toko,
                audit.nomor_ulok,
                audit.cabang,
                audit.old_created_at,
                audit.new_created_at,
                audit.old_hari_denda,
                audit.old_nilai_denda,
                audit.old_tanggal_akhir_spk_denda,
                audit.old_tanggal_serah_terima_denda,
                audit.actor_email,
                audit.actor_role,
                audit.catatan,
                audit.created_at,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.proyek
            FROM serah_terima_date_correction_audit audit
            LEFT JOIN toko t ON t.id = audit.id_toko
            WHERE audit.nomor_ulok = $1
              AND ($2::text IS NULL OR UPPER(audit.cabang) = UPPER($2::text))
            ORDER BY audit.created_at DESC, audit.id DESC
            LIMIT 50
            `,
            [input.nomor_ulok, input.cabang ?? null]
        );

        return result.rows;
    },

    async ensureBerkasSerahTerima(idToko: number): Promise<BerkasSerahTerimaRow> {
        const existing = await pool.query<BerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id_toko = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [idToko]
        );

        if ((existing.rowCount ?? 0) > 0) {
            return existing.rows[0];
        }

        const inserted = await pool.query<BerkasSerahTerimaRow>(
            `
            INSERT INTO berkas_serah_terima (id_toko)
            VALUES ($1)
            RETURNING id, id_toko, link_pdf, created_at
            `,
            [idToko]
        );

        return inserted.rows[0];
    },

    async ensureBerkasSerahTerimaWithTimestamp(idToko: number, createdAt: string): Promise<BerkasSerahTerimaRow> {
        const existing = await pool.query<BerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id_toko = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [idToko]
        );

        if ((existing.rowCount ?? 0) > 0) {
            return existing.rows[0];
        }

        const inserted = await pool.query<BerkasSerahTerimaRow>(
            `
            INSERT INTO berkas_serah_terima (id_toko, created_at)
            VALUES ($1, $2::timestamptz)
            RETURNING id, id_toko, link_pdf, created_at
            `,
            [idToko, createdAt]
        );

        return inserted.rows[0];
    },

    async updateBerkasSerahTerimaLink(id: number, linkPdf: string): Promise<BerkasSerahTerimaRow> {
        const updated = await pool.query<BerkasSerahTerimaRow>(
            `
            UPDATE berkas_serah_terima
            SET link_pdf = $1
            WHERE id = $2
            RETURNING id, id_toko, link_pdf, created_at
            `,
            [linkPdf, id]
        );

        return updated.rows[0];
    },

    async updateBerkasSerahTerimaLinkAndDate(input: {
        id: number;
        linkPdf: string;
        createdAt: string;
    }): Promise<BerkasSerahTerimaRow> {
        const updated = await pool.query<BerkasSerahTerimaRow>(
            `
            UPDATE berkas_serah_terima
            SET link_pdf = $1,
                created_at = $2::timestamp
            WHERE id = $3
            RETURNING id, id_toko, link_pdf, created_at
            `,
            [input.linkPdf, input.createdAt, input.id]
        );

        return updated.rows[0];
    },

    /**
     * Temukan toko saudara yang sudah memiliki Opname Final, seluruh pekerjaan
     * selesai sudah masuk Opname, dan belum punya berkas Serah Terima.
     */
    async findSiblingTokosReadyForST(nomorUlok: string, excludeIdToko: number): Promise<{ id: number; lingkup_pekerjaan: string | null }[]> {
        const result = await pool.query(
            `
            SELECT t.id, t.lingkup_pekerjaan
            FROM toko t
            WHERE t.nomor_ulok = $1
              AND t.id != $2
              AND EXISTS (
                  SELECT 1 FROM opname_final of2
                  WHERE of2.id_toko = t.id
              )
              AND EXISTS (
                  SELECT 1
                  FROM (
                      SELECT DISTINCT ON (
                          UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                          UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                      )
                          p.kategori_pekerjaan,
                          p.jenis_pekerjaan,
                          p.status
                      FROM pengawasan p
                      LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
                      WHERE p.id_gantt = (
                          SELECT g2.id
                          FROM gantt_chart g2
                          WHERE g2.id_toko = t.id
                          ORDER BY g2.id DESC
                          LIMIT 1
                      )
                      ORDER BY
                          UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                          UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))),
                          to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST,
                          p.id DESC
                  ) latest_item
                  WHERE latest_item.status = 'selesai'
                    AND EXISTS (
                        SELECT 1
                        FROM opname_item oi
                        LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                        LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                        WHERE oi.id_toko = t.id
                          AND UPPER(TRIM(COALESCE(
                                ri.kategori_pekerjaan,
                                ili.kategori_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(REPLACE(COALESCE(latest_item.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(
                                ri.jenis_pekerjaan,
                                ili.jenis_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(COALESCE(latest_item.jenis_pekerjaan, '')))
                    )
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM (
                      SELECT DISTINCT ON (
                          UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                          UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                      )
                          p.kategori_pekerjaan,
                          p.jenis_pekerjaan,
                          p.status
                      FROM pengawasan p
                      LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
                      WHERE p.id_gantt = (
                          SELECT g2.id
                          FROM gantt_chart g2
                          WHERE g2.id_toko = t.id
                          ORDER BY g2.id DESC
                          LIMIT 1
                      )
                      ORDER BY
                          UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                          UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))),
                          to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST,
                          p.id DESC
                  ) latest_item
                  WHERE latest_item.status = 'selesai'
                    AND NOT EXISTS (
                        SELECT 1
                        FROM opname_item oi
                        LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                        LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                        WHERE oi.id_toko = t.id
                          AND UPPER(TRIM(COALESCE(
                                ri.kategori_pekerjaan,
                                ili.kategori_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(REPLACE(COALESCE(latest_item.kategori_pekerjaan, ''), '[IL] ', '')))
                          AND UPPER(TRIM(COALESCE(
                                ri.jenis_pekerjaan,
                                ili.jenis_pekerjaan,
                                ''
                          ))) = UPPER(TRIM(COALESCE(latest_item.jenis_pekerjaan, '')))
                    )
              )
              AND NOT EXISTS (
                  SELECT 1 FROM berkas_serah_terima bst
                  WHERE bst.id_toko = t.id
              )
            `,
            [nomorUlok, excludeIdToko]
        );
        return result.rows;
    },
};
