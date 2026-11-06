import { pool, withTransaction } from "../../db/pool";
import { type PoolClient } from "pg";
import type {
    CreatePengawasanData,
    ListPengawasanQueryInput,
    UpdatePengawasanInput
} from "./pengawasan.schema";

export type PengawasanRow = {
    id: number;
    id_gantt: number;
    id_pengawasan_gantt: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    catatan: string | null;
    dokumentasi: string | null;
    status: string;
    created_at: string;
    tanggal_pengawasan?: string;
};

export type BerkasPengawasanRow = {
    id: number;
    id_pengawasan_gantt: number;
    link_pdf_pengawasan: string | null;
    created_at: string;
};

export type PicPengawasanDisplayRow = {
    plc_building_support: string | null;
};

export type PengawasanGanttInfoRow = {
    id: number;
    id_gantt: number;
    tanggal_pengawasan: string;
};

export type PengawasanPdfMigrationPendingRow = {
    id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    h_day: number;
    tanggal_pengawasan: string | null;
    link_pdf_pengawasan: string;
    source_sheet: string;
    source_row: number;
    status: "PENDING" | "LINKED";
    id_pengawasan_gantt: number | null;
    created_at: string;
    updated_at: string;
};

export type SkippedPreviousProgressRow = {
    previous_id: number;
    previous_tanggal_pengawasan: string;
    previous_status: string;
    skipped_id_pengawasan_gantt: number;
    skipped_tanggal_pengawasan: string;
};

export type FutureUnfinishedPengawasanRow = {
    id: number;
    id_pengawasan_gantt: number;
    tanggal_pengawasan: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    status: string;
    created_at: string;
};

export type PengawasanDocumentFallbackInput = {
    id_gantt: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    excludeIdPengawasanGantt?: number;
};

export type PengawasanCarryForwardInput = {
    id_gantt: number;
    id_pengawasan_gantt: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    catatan?: string | null;
};

export type PengawasanRowWithBerkas = PengawasanRow & {
    berkas_pengawasan: BerkasPengawasanRow | null;
};

export const pengawasanRepository = {
    async findPendingMigrationPdfs(nomorUlok?: string, cabangArray?: string[]): Promise<PengawasanPdfMigrationPendingRow[]> {
        const values: any[] = [];
        const conditions = [`p.status = 'PENDING'`];
        if (nomorUlok?.trim()) {
            values.push(nomorUlok.trim());
            conditions.push(`UPPER(p.nomor_ulok) = UPPER($${values.length})`);
        }

        if (cabangArray && cabangArray.length > 0) {
            const normalizedBranches = cabangArray.map(b => b.trim().toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`UPPER(t.cabang) = ANY($${values.length}::text[])`);
        }

        const result = await pool.query<PengawasanPdfMigrationPendingRow>(
            `
            SELECT p.id, p.nomor_ulok, p.lingkup_pekerjaan, p.h_day, p.tanggal_pengawasan,
                   p.link_pdf_pengawasan, p.source_sheet, p.source_row, p.status,
                   p.id_pengawasan_gantt, p.created_at, p.updated_at
            FROM pengawasan_pdf_migration_pending p
            LEFT JOIN toko t ON p.nomor_ulok = t.nomor_ulok
            WHERE ${conditions.join(" AND ")}
            ORDER BY p.created_at DESC, p.id DESC
            `,
            values
        );
        return result.rows;
    },

    async checkIsPengawasanMigrated(idPengawasanGantt: number): Promise<boolean> {
        const result = await pool.query<{ is_migrated: boolean }>(
            `
            SELECT (COUNT(*) > 0 AND COUNT(dokumentasi) = 0) as is_migrated
            FROM pengawasan 
            WHERE id_pengawasan_gantt = $1
            `,
            [idPengawasanGantt]
        );
        return result.rows[0]?.is_migrated ?? false;
    },

    async findLatestUploadDateByIdPengawasanGantt(idPengawasanGantt: number): Promise<Date | null> {
        const result = await pool.query<{ max_date: Date }>(
            `
            SELECT MAX(created_at) as max_date
            FROM pengawasan
            WHERE id_pengawasan_gantt = $1 AND dokumentasi IS NOT NULL
            `,
            [idPengawasanGantt]
        );
        return result.rows[0]?.max_date ?? null;
    },

    async create(input: CreatePengawasanData): Promise<PengawasanRow> {
        const result = await pool.query<PengawasanRow>(
            `
            INSERT INTO pengawasan (id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status)
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'progress'))
            RETURNING id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
            `,
            [
                input.id_gantt,
                input.id_pengawasan_gantt,
                input.kategori_pekerjaan,
                input.jenis_pekerjaan,
                input.catatan ?? null,
                input.dokumentasi ?? null,
                input.status ?? null
            ]
        );

        return result.rows[0];
    },

    async createBulk(items: CreatePengawasanData[], existingClient?: PoolClient): Promise<PengawasanRow[]> {
        return withTransaction(async (client) => {
            const rows: PengawasanRow[] = [];

            for (const item of items) {
                const isAppendResolution = Boolean(item.append_resolution);
                const existingResult = isAppendResolution
                    ? { rows: [] }
                    : await client.query<Pick<PengawasanRow, "id">>(
                    `
                    SELECT id
                    FROM pengawasan
                    WHERE id_gantt = $1
                      AND id_pengawasan_gantt = $2
                      AND UPPER(TRIM(COALESCE(kategori_pekerjaan, ''))) = UPPER(TRIM($3::text))
                      AND UPPER(TRIM(COALESCE(jenis_pekerjaan, ''))) = UPPER(TRIM($4::text))
                    ORDER BY
                      CASE WHEN NULLIF(TRIM(COALESCE(dokumentasi, '')), '') IS NULL THEN 0 ELSE 1 END ASC,
                      CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'terlambat' THEN 0 ELSE 1 END ASC,
                      id ASC
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        item.id_gantt,
                        item.id_pengawasan_gantt,
                        item.kategori_pekerjaan,
                        item.jenis_pekerjaan
                    ]
                );

                const existingId = isAppendResolution ? undefined : existingResult.rows[0]?.id;
                if (existingId) {
                    const setClauses: string[] = [];
                    const values: Array<number | string> = [];

                    if (typeof item.catatan === "string" && item.catatan.trim()) {
                        values.push(item.catatan);
                        setClauses.push(`catatan = $${values.length}`);
                    }

                    if (typeof item.dokumentasi === "string" && item.dokumentasi.trim()) {
                        values.push(item.dokumentasi);
                        setClauses.push(`dokumentasi = $${values.length}`);
                    }

                    if (typeof item.status === "string" && item.status.trim()) {
                        values.push(item.status);
                        setClauses.push(`status = $${values.length}`);
                    }

                    if (setClauses.length === 0) {
                        const unchanged = await client.query<PengawasanRow>(
                            `
                            SELECT id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
                            FROM pengawasan
                            WHERE id = $1
                            `,
                            [existingId]
                        );
                        rows.push(unchanged.rows[0]);
                        continue;
                    }

                    values.push(existingId);
                    const updated = await client.query<PengawasanRow>(
                        `
                        UPDATE pengawasan
                        SET ${setClauses.join(", ")}
                        WHERE id = $${values.length}
                        RETURNING id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
                        `,
                        values
                    );
                    rows.push(updated.rows[0]);
                    continue;
                }

                const inserted = await client.query<PengawasanRow>(
                    `
                    INSERT INTO pengawasan (id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status)
                    VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'progress'))
                    RETURNING id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
                    `,
                    [
                        item.id_gantt,
                        item.id_pengawasan_gantt,
                        item.kategori_pekerjaan,
                        item.jenis_pekerjaan,
                        item.catatan ?? null,
                        item.dokumentasi ?? null,
                        item.status ?? null
                    ]
                );
                rows.push(inserted.rows[0]);
            }

            return rows;
        }, existingClient);
    },

    async createNextTerlambatCarryForwardIfMissing(
        input: PengawasanCarryForwardInput,
        existingClient?: PoolClient
    ): Promise<PengawasanRow | null> {
        const client = existingClient ?? pool;
        const result = await client.query<PengawasanRow>(
            `
            WITH current_checkpoint AS (
                SELECT id_gantt, to_date(tanggal_pengawasan, 'DD/MM/YYYY') AS tanggal
                FROM pengawasan_gantt
                WHERE id = $2
                  AND id_gantt = $1
            ), next_checkpoint AS (
                SELECT pg.id
                FROM pengawasan_gantt pg
                JOIN current_checkpoint cp ON cp.id_gantt = pg.id_gantt
                WHERE to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') > cp.tanggal
                ORDER BY to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') ASC, pg.id ASC
                LIMIT 1
            )
            INSERT INTO pengawasan (
                id_gantt,
                id_pengawasan_gantt,
                kategori_pekerjaan,
                jenis_pekerjaan,
                catatan,
                dokumentasi,
                status
            )
            SELECT
                $1::int,
                next_checkpoint.id,
                $3::text,
                $4::text,
                $5::text,
                NULL,
                'terlambat'
            FROM next_checkpoint
            WHERE NOT EXISTS (
                SELECT 1
                FROM pengawasan p
                WHERE p.id_gantt = $1::int
                  AND p.id_pengawasan_gantt = next_checkpoint.id
                  AND UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))) = UPPER(TRIM($3::text))
                  AND UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))) = UPPER(TRIM($4::text))
            )
            RETURNING id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
            `,
            [
                input.id_gantt,
                input.id_pengawasan_gantt,
                input.kategori_pekerjaan,
                input.jenis_pekerjaan,
                input.catatan ?? null
            ]
        );

        return result.rows[0] ?? null;
    },

    async findLatestNonNullDokumentasiForItem(
        input: PengawasanDocumentFallbackInput,
        existingClient?: PoolClient
    ): Promise<string | null> {
        const values: Array<number | string> = [
            input.id_gantt,
            input.kategori_pekerjaan,
            input.jenis_pekerjaan
        ];
        const excludeClause = typeof input.excludeIdPengawasanGantt === "number"
            ? `AND p.id_pengawasan_gantt <> $${values.push(input.excludeIdPengawasanGantt)}`
            : "";

        const query = `
            SELECT p.dokumentasi
            FROM pengawasan p
            LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
            WHERE p.id_gantt = $1
              AND p.kategori_pekerjaan = $2
              AND p.jenis_pekerjaan = $3
              AND p.status = 'selesai'
              AND NULLIF(TRIM(p.dokumentasi), '') IS NOT NULL
              ${excludeClause}
            ORDER BY to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST, p.id DESC
            LIMIT 1
        `;

        const client = existingClient ?? pool;
        const result = await client.query<{ dokumentasi: string }>(query, values);
        return result.rows[0]?.dokumentasi ?? null;
    },

    async findById(id: string): Promise<PengawasanRowWithBerkas | null> {
        type RawRow = PengawasanRow & {
            bp_id: number | null;
            bp_id_pengawasan_gantt: number | null;
            bp_link_pdf_pengawasan: string | null;
            bp_created_at: string | null;
        };

        const result = await pool.query<RawRow>(
            `
            SELECT
                p.id, p.id_gantt, p.id_pengawasan_gantt,
                p.kategori_pekerjaan, p.jenis_pekerjaan,
                p.catatan, p.dokumentasi, p.status, p.created_at,
                bp.id AS bp_id,
                bp.id_pengawasan_gantt AS bp_id_pengawasan_gantt,
                bp.link_pdf_pengawasan AS bp_link_pdf_pengawasan,
                bp.created_at AS bp_created_at
            FROM pengawasan p
            LEFT JOIN berkas_pengawasan bp ON bp.id_pengawasan_gantt = p.id_pengawasan_gantt
            WHERE p.id = $1
            `,
            [id]
        );

        const row = result.rows[0];
        if (!row) return null;

        const { bp_id, bp_id_pengawasan_gantt, bp_link_pdf_pengawasan, bp_created_at, ...pengawasan } = row;
        return {
            ...pengawasan,
            berkas_pengawasan: bp_id !== null
                ? {
                    id: bp_id,
                    id_pengawasan_gantt: bp_id_pengawasan_gantt!,
                    link_pdf_pengawasan: bp_link_pdf_pengawasan,
                    created_at: bp_created_at!
                }
                : null
        };
    },

    async findAll(
        query: ListPengawasanQueryInput & { cabang_array?: string[] },
        idPengawasanGantt?: number
    ): Promise<PengawasanRowWithBerkas[]> {
        const conditions: string[] = [];
        const values: Array<number | string> = [];

        if (typeof query.id_gantt !== "undefined") {
            values.push(query.id_gantt);
            conditions.push(`p.id_gantt = $${values.length}`);
        }

        if (query.kategori_pekerjaan) {
            values.push(query.kategori_pekerjaan);
            conditions.push(`p.kategori_pekerjaan = $${values.length}`);
        }

        if (query.jenis_pekerjaan) {
            values.push(query.jenis_pekerjaan);
            conditions.push(`p.jenis_pekerjaan = $${values.length}`);
        }

        if (query.status) {
            values.push(query.status);
            conditions.push(`p.status = $${values.length}`);
        }

        // SECURITY: Branch filtering - wajib ada untuk user non-global
        if (query.cabang_array && query.cabang_array.length > 0) {
            const normalizedBranches = query.cabang_array.map(b => b.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase());
            values.push(normalizedBranches as any);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
            console.log('[PENGAWASAN FILTER] Branch filter applied:', normalizedBranches);
        } else {
            // Jika sampai sini tanpa cabang_array, berarti ada bug di controller/filter logic
            console.warn('[PENGAWASAN FILTER] NO BRANCH FILTER! This should not happen for non-global users');
        }

        // SECURITY: Contractor filter - pastikan kontraktor hanya lihat proyek mereka sendiri
        if (query.nama_kontraktor) {
            const normalizedKontraktor = query.nama_kontraktor.toLowerCase().replace(/\b(pt|cv)\b/gi, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
            values.push(normalizedKontraktor);
            conditions.push(`LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.nama_kontraktor, '\\y(pt|cv)\\y|[\\.,]', ' ', 'gi'), '\\s+', ' ', 'g'))) = $${values.length}`);
            console.log('[PENGAWASAN FILTER] Contractor filter applied:', query.nama_kontraktor);
        }

        if (typeof idPengawasanGantt !== "undefined") {
            values.push(idPengawasanGantt);
            conditions.push(`p.id_pengawasan_gantt = $${values.length}`);
        }

        // Filter out dummy carry-forward checkpoints. A checkpoint is real if it has a PDF (bp.id) or if it has at least one item with a photo (p2.dokumentasi)
        conditions.push(`(
            bp.id IS NOT NULL 
            OR EXISTS (
                SELECT 1 
                FROM pengawasan p2 
                WHERE p2.id_pengawasan_gantt = p.id_pengawasan_gantt 
                  AND p2.dokumentasi IS NOT NULL
            )
        )`);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        type RawRow = PengawasanRow & {
            bp_id: number | null;
            bp_id_pengawasan_gantt: number | null;
            bp_link_pdf_pengawasan: string | null;
            bp_created_at: string | null;
        };

        const result = await pool.query<RawRow>(
            `
            SELECT
                p.id, p.id_gantt, p.id_pengawasan_gantt,
                p.kategori_pekerjaan, p.jenis_pekerjaan,
                p.catatan, p.dokumentasi,
                p.status, p.created_at,
                bp.id AS bp_id,
                bp.id_pengawasan_gantt AS bp_id_pengawasan_gantt,
                bp.link_pdf_pengawasan AS bp_link_pdf_pengawasan,
                bp.created_at AS bp_created_at,
                pg.tanggal_pengawasan
            FROM pengawasan p
            LEFT JOIN berkas_pengawasan bp ON bp.id_pengawasan_gantt = p.id_pengawasan_gantt
            LEFT JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
            JOIN gantt_chart g ON g.id = p.id_gantt
            JOIN toko t ON t.id = g.id_toko
            ${whereClause}
            ORDER BY to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST, p.id DESC
            `,
            values
        );

        return result.rows.map((row) => {
            const { bp_id, bp_id_pengawasan_gantt, bp_link_pdf_pengawasan, bp_created_at, ...pengawasan } = row;
            return {
                ...pengawasan,
                berkas_pengawasan: bp_id !== null
                    ? {
                        id: bp_id,
                        id_pengawasan_gantt: bp_id_pengawasan_gantt!,
                        link_pdf_pengawasan: bp_link_pdf_pengawasan,
                        created_at: bp_created_at!
                    }
                    : null
            };
        });
    },

    async updateById(id: string, input: UpdatePengawasanInput, existingClient?: PoolClient): Promise<PengawasanRow | null> {
        const setClauses: string[] = [];
        const values: Array<string> = [];

        Object.entries(input).forEach(([key, value]) => {
            if (key === "dokumentasi" && (typeof value !== "string" || value.trim().length === 0)) {
                return;
            }

            if (value !== undefined && key !== 'opname_data') { // ignore opname_data for SQL
                values.push(value as string);
                setClauses.push(`${key} = $${values.length}`);
            }
        });

        if (setClauses.length === 0) return null;

        values.push(id);
        const query = `
            UPDATE pengawasan
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length}
            RETURNING *
        `;

        if (existingClient) {
            const result = await existingClient.query<PengawasanRow>(query, values);
            return result.rows[0] ?? null;
        }

        const result = await pool.query<PengawasanRow>(query, values);
        return result.rows[0] ?? null;
    },

    async deleteById(id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM pengawasan WHERE id = $1`,
            [id]
        );

        return (result.rowCount ?? 0) > 0;
    },

    async findPengawasanGanttIdByDate(idGantt: number, tanggalPengawasan: string): Promise<number | null> {
        const result = await pool.query<{ id: number }>(
            `
            SELECT id
            FROM pengawasan_gantt
            WHERE id_gantt = $1
              AND tanggal_pengawasan = $2
            ORDER BY id ASC
            LIMIT 1
            `,
            [idGantt, tanggalPengawasan]
        );

        return result.rows[0]?.id ?? null;
    },

    // ── berkas_pengawasan ────────────────────────────────────────────────

    async upsertBerkasPengawasan(
        idPengawasanGantt: number,
        linkPdfPengawasan: string
    ): Promise<BerkasPengawasanRow> {
        const result = await pool.query<BerkasPengawasanRow>(
            `
            INSERT INTO berkas_pengawasan (id_pengawasan_gantt, link_pdf_pengawasan)
            VALUES ($1, $2)
            ON CONFLICT (id_pengawasan_gantt)
            DO UPDATE SET link_pdf_pengawasan = EXCLUDED.link_pdf_pengawasan,
                          created_at = timezone('Asia/Jakarta', now())
            RETURNING id, id_pengawasan_gantt, link_pdf_pengawasan, created_at
            `,
            [idPengawasanGantt, linkPdfPengawasan]
        );

        return result.rows[0];
    },

    async findBerkasByPengawasanGanttId(idPengawasanGantt: number): Promise<BerkasPengawasanRow | null> {
        const result = await pool.query<BerkasPengawasanRow>(
            `
            SELECT id, id_pengawasan_gantt, link_pdf_pengawasan, created_at
            FROM berkas_pengawasan
            WHERE id_pengawasan_gantt = $1
            `,
            [idPengawasanGantt]
        );

        return result.rows[0] ?? null;
    },

    async findPengawasanGanttInfoById(idPengawasanGantt: number): Promise<PengawasanGanttInfoRow | null> {
        const result = await pool.query<PengawasanGanttInfoRow>(
            `
            SELECT id, id_gantt, tanggal_pengawasan
            FROM pengawasan_gantt
            WHERE id = $1
            `,
            [idPengawasanGantt]
        );

        return result.rows[0] ?? null;
    },

    async findSkippedPreviousProgress(input: {
        id_gantt: number;
        id_pengawasan_gantt: number;
        kategori_pekerjaan: string;
        jenis_pekerjaan: string;
    }): Promise<SkippedPreviousProgressRow | null> {
        const result = await pool.query<SkippedPreviousProgressRow>(
            `
            WITH current_checkpoint AS (
                SELECT id_gantt, to_date(tanggal_pengawasan, 'DD/MM/YYYY') AS tanggal
                FROM pengawasan_gantt
                WHERE id = $2
            ), previous_item AS (
                SELECT
                    p.id,
                    pg.tanggal_pengawasan,
                    to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') AS tanggal,
                    p.status
                FROM pengawasan p
                JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
                JOIN current_checkpoint cp ON cp.id_gantt = pg.id_gantt
                WHERE p.id_gantt = $1
                  AND UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))) = UPPER(TRIM($3))
                  AND UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))) = UPPER(TRIM($4))
                  AND to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') < cp.tanggal
                ORDER BY to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC, p.id DESC
                LIMIT 1
            ), skipped_checkpoint AS (
                SELECT pg.id, pg.tanggal_pengawasan
                FROM pengawasan_gantt pg
                JOIN current_checkpoint cp ON cp.id_gantt = pg.id_gantt
                JOIN previous_item prev ON true
                WHERE pg.id_gantt = $1
                  AND to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') > prev.tanggal
                  AND to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') < cp.tanggal
                ORDER BY to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') ASC, pg.id ASC
                LIMIT 1
            )
            SELECT
                prev.id AS previous_id,
                prev.tanggal_pengawasan AS previous_tanggal_pengawasan,
                prev.status AS previous_status,
                skipped.id AS skipped_id_pengawasan_gantt,
                skipped.tanggal_pengawasan AS skipped_tanggal_pengawasan
            FROM previous_item prev
            JOIN skipped_checkpoint skipped ON true
            WHERE LOWER(TRIM(COALESCE(prev.status, ''))) = 'progress'
            `,
            [
                input.id_gantt,
                input.id_pengawasan_gantt,
                input.kategori_pekerjaan,
                input.jenis_pekerjaan
            ]
        );

        return result.rows[0] ?? null;
    },
    async findFutureUnfinishedItems(input: {
        id_gantt: number;
        id_pengawasan_gantt: number;
        kategori_pekerjaan: string;
        jenis_pekerjaan: string;
    }): Promise<FutureUnfinishedPengawasanRow[]> {
        const result = await pool.query<FutureUnfinishedPengawasanRow>(
            `
            WITH current_checkpoint AS (
                SELECT id_gantt, to_date(tanggal_pengawasan, 'DD/MM/YYYY') AS tanggal
                FROM pengawasan_gantt
                WHERE id = $2
            )
            SELECT
                p.id,
                p.id_pengawasan_gantt,
                future_pg.tanggal_pengawasan,
                p.kategori_pekerjaan,
                p.jenis_pekerjaan,
                p.status,
                p.created_at
            FROM pengawasan p
            JOIN pengawasan_gantt future_pg ON future_pg.id = p.id_pengawasan_gantt
            JOIN current_checkpoint cp ON cp.id_gantt = future_pg.id_gantt
            WHERE p.id_gantt = $1
              AND UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))) = UPPER(TRIM($3))
              AND UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))) = UPPER(TRIM($4))
              AND LOWER(TRIM(COALESCE(p.status, ''))) IN ('progress', 'terlambat')
              AND to_date(future_pg.tanggal_pengawasan, 'DD/MM/YYYY') > cp.tanggal
            ORDER BY to_date(future_pg.tanggal_pengawasan, 'DD/MM/YYYY') DESC, p.id DESC
            `,
            [
                input.id_gantt,
                input.id_pengawasan_gantt,
                input.kategori_pekerjaan,
                input.jenis_pekerjaan
            ]
        );

        return result.rows;
    },
    async findAllPengawasanByGanttId(idPengawasanGantt: number): Promise<PengawasanRow[]> {
        const result = await pool.query<PengawasanRow>(
            `
            SELECT id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status, created_at
            FROM pengawasan
            WHERE id_pengawasan_gantt = $1
            ORDER BY id ASC
            `,
            [idPengawasanGantt]
        );

        return result.rows;
    },

    async findPicPengawasanByPengawasanGanttId(
        idPengawasanGantt: number
    ): Promise<PicPengawasanDisplayRow | null> {
        const result = await pool.query<PicPengawasanDisplayRow>(
            `
            SELECT pic.plc_building_support
            FROM pengawasan_gantt pg
            LEFT JOIN gantt_chart gc ON gc.id = pg.id_gantt
            LEFT JOIN pic_pengawasan pic ON pic.id_toko = gc.id_toko
            WHERE pg.id = $1
            LIMIT 1
            `,
            [idPengawasanGantt]
        );

        return result.rows[0] ?? null;
    }
};

