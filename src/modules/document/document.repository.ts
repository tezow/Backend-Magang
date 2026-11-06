import { pool, withTransaction } from "../../db/pool";
import type {
    PenyimpananDokumenArchiveStoreCreateInput,
    PenyimpananDokumenCreateInput,
    PenyimpananDokumenListQueryInput,
    PenyimpananDokumenUpdateInput
} from "./document.schema";

export type PenyimpananDokumenRow = {
    id: number;
    id_toko: number | null;
    nama_dokumen: string;
    drive_file_id: string | null;
    drive_folder_id: string | null;
    link_dokumen: string | null;
    link_folder: string | null;
    kode_toko: string | null;
    nama_toko: string | null;
    cabang: string | null;
    kategori_dokumen: string | null;
    source_timestamp: string | null;
    source_last_edit: string | null;
    migrated_at: string | null;
    created_at: string;
};

export type PenyimpananDokumenMigrationItem = {
    kode_toko: string | null;
    nama_toko: string | null;
    cabang: string | null;
    kategori_dokumen: string;
    nama_dokumen: string;
    drive_file_id: string | null;
    drive_folder_id: string | null;
    link_dokumen: string;
    link_folder: string | null;
    source_timestamp: Date | null;
    source_last_edit: Date | null;
};

export type PenyimpananDokumenMigrationStoreItem = {
    kode_toko: string | null;
    nama_toko: string | null;
    cabang: string | null;
    folder_link: string | null;
    source_timestamp: Date | null;
    source_last_edit: Date | null;
};

export type PenyimpananDokumenArchiveStoreRow = {
    nomor_ulok: string | null;
    kode_toko: string | null;
    nama_toko: string | null;
    cabang: string | null;
    proyek: string | null;
    jumlah_dokumen: number;
    kategori_counts: Record<string, number>;
    last_created_at: string | null;
};

export type TokoRow = {
    id: number;
    nama_toko: string | null;
    cabang: string | null;
    kode_toko: string | null;
};

const SELECT_COLUMNS = `
    id, id_toko, nama_dokumen, drive_file_id, drive_folder_id, link_dokumen, link_folder,
    kode_toko, nama_toko, cabang, kategori_dokumen, source_timestamp, source_last_edit,
    migrated_at, created_at
`;

export const penyimpananDokumenRepository = {
    async findTokoById(idToko: number): Promise<TokoRow | null> {
        const result = await pool.query<TokoRow>(
            `
            SELECT id, nama_toko, cabang, kode_toko
            FROM toko
            WHERE id = $1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async createBulk(
        input: PenyimpananDokumenCreateInput,
        linkFolder: string | null,
        driveFolderId: string | null,
        items: Array<{ link: string; driveFileId?: string }>
    ): Promise<PenyimpananDokumenRow[]> {
        if (items.length === 0) return [];

        return withTransaction(async (client) => {
            const values: Array<number | string | null> = [];
            const placeholders = items.map((item, index) => {
                const base = index * 10;
                values.push(
                    input.id_toko ?? null,
                    input.kode_toko ?? null,
                    input.nama_toko ?? null,
                    input.cabang ?? null,
                    input.nama_dokumen,
                    input.nama_dokumen,
                    item.driveFileId ?? null,
                    driveFolderId,
                    item.link,
                    linkFolder
                );
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
            });

            const result = await client.query<PenyimpananDokumenRow>(
                `
                INSERT INTO penyimpanan_dokumen (
                    id_toko,
                    kode_toko,
                    nama_toko,
                    cabang,
                    kategori_dokumen,
                    nama_dokumen,
                    drive_file_id,
                    drive_folder_id,
                    link_dokumen,
                    link_folder
                )
                VALUES ${placeholders.join(", ")}
                RETURNING ${SELECT_COLUMNS}
                `,
                values
            );

                return result.rows;
        });
    },

    async upsertArchiveStore(input: PenyimpananDokumenArchiveStoreCreateInput): Promise<PenyimpananDokumenArchiveStoreRow> {
        await pool.query(
            `
            INSERT INTO penyimpanan_dokumen_toko (
                nomor_ulok, kode_toko, nama_toko, cabang, proyek, folder_link, migrated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING
            `,
            [
                input.nomor_ulok ?? null,
                input.kode_toko,
                input.nama_toko,
                input.cabang,
                input.proyek || "Penyimpanan Dokumen",
                input.folder_link || null
            ]
        );

        const result = await pool.query<PenyimpananDokumenArchiveStoreRow>(
            `
            WITH doc_categories AS (
                SELECT
                    LOWER(COALESCE(kode_toko, '')) AS kode_key,
                    LOWER(COALESCE(nama_toko, '')) AS nama_key,
                    LOWER(COALESCE(cabang, '')) AS cabang_key,
                    COALESCE(kategori_dokumen, nama_dokumen) AS kategori,
                    COUNT(*)::int AS jumlah,
                    MAX(created_at) AS last_created_at
                FROM penyimpanan_dokumen
                WHERE COALESCE(kategori_dokumen, nama_dokumen) IS NOT NULL
                GROUP BY
                    LOWER(COALESCE(kode_toko, '')),
                    LOWER(COALESCE(nama_toko, '')),
                    LOWER(COALESCE(cabang, '')),
                    COALESCE(kategori_dokumen, nama_dokumen)
            ),
            doc_summary AS (
                SELECT
                    kode_key,
                    nama_key,
                    cabang_key,
                    SUM(jumlah)::int AS jumlah_dokumen,
                    jsonb_object_agg(kategori, jumlah) AS kategori_counts,
                    MAX(last_created_at) AS last_created_at
                FROM doc_categories
                GROUP BY kode_key, nama_key, cabang_key
            )
            SELECT
                s.nomor_ulok,
                s.kode_toko,
                s.nama_toko,
                s.cabang,
                s.proyek,
                COALESCE(ds.jumlah_dokumen, 0)::int AS jumlah_dokumen,
                COALESCE(ds.kategori_counts, '{}'::jsonb) AS kategori_counts,
                COALESCE(ds.last_created_at, s.created_at)::text AS last_created_at
            FROM penyimpanan_dokumen_toko s
            LEFT JOIN doc_summary ds
              ON ds.kode_key = LOWER(COALESCE(s.kode_toko, ''))
             AND ds.nama_key = LOWER(COALESCE(s.nama_toko, ''))
             AND ds.cabang_key = LOWER(COALESCE(s.cabang, ''))
            WHERE LOWER(COALESCE(s.kode_toko, '')) = LOWER($1)
              AND LOWER(COALESCE(s.nama_toko, '')) = LOWER($2)
              AND LOWER(COALESCE(s.cabang, '')) = LOWER($3)
            `,
            [input.kode_toko, input.nama_toko, input.cabang]
        );

        return result.rows[0];
    },

    async list(query: PenyimpananDokumenListQueryInput): Promise<PenyimpananDokumenRow[]> {
        const conditions: string[] = [];
        const values: Array<number | string | string[]> = [];
        const tokoIdentity: string[] = [];

        // SECURITY: Branch filtering - wajib ada untuk user non-global
        if (query.cabang_array && query.cabang_array.length > 0) {
            const normalizedBranches = query.cabang_array.map(b => b.trim().toUpperCase());
            values.push(normalizedBranches as any);
            conditions.push(`UPPER(TRIM(cabang)) = ANY($${values.length})`);
            console.log('[DOCUMENT FILTER] Branch filter applied:', normalizedBranches);
        } else {
            // Jika sampai sini tanpa cabang_array, berarti ada bug di controller/filter logic
            console.warn('[DOCUMENT FILTER] NO BRANCH FILTER! This should not happen for non-global users');
        }

        if (typeof query.id_toko === "number") {
            values.push(query.id_toko);
            tokoIdentity.push(`id_toko = $${values.length}`);
        }

        if (query.kode_toko) {
            values.push(query.kode_toko);
            tokoIdentity.push(`LOWER(kode_toko) = LOWER($${values.length})`);
        }

        if (query.nama_toko && query.cabang) {
            values.push(query.nama_toko);
            const namaParam = values.length;
            values.push(query.cabang);
            const cabangParam = values.length;
            tokoIdentity.push(`(LOWER(nama_toko) = LOWER($${namaParam}) AND LOWER(cabang) = LOWER($${cabangParam}))`);
        } else if (query.nama_toko) {
            values.push(query.nama_toko);
            tokoIdentity.push(`LOWER(nama_toko) = LOWER($${values.length})`);
        }

        if (tokoIdentity.length > 0) {
            conditions.push(`(${tokoIdentity.join(" OR ")})`);
        }

        if (query.nama_dokumen) {
            values.push(query.nama_dokumen);
            conditions.push(`(LOWER(nama_dokumen) = LOWER($${values.length}) OR LOWER(kategori_dokumen) = LOWER($${values.length}))`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<PenyimpananDokumenRow>(
            `
            SELECT ${SELECT_COLUMNS}
            FROM penyimpanan_dokumen
            ${whereClause}
            ORDER BY created_at DESC, id DESC
            `,
            values
        );

        return result.rows;
    },

    async listArchiveStores(search?: string): Promise<PenyimpananDokumenArchiveStoreRow[]> {
        const trimmedSearch = String(search ?? "").trim();
        const conditions = [
            "(s.kode_toko IS NOT NULL OR s.nama_toko IS NOT NULL)"
        ];
        const values: string[] = [];

        if (trimmedSearch.length >= 2) {
            values.push(`%${trimmedSearch}%`);
            conditions.push(`(
                s.kode_toko ILIKE $${values.length}
                OR s.nama_toko ILIKE $${values.length}
                OR s.cabang ILIKE $${values.length}
            )`);
        }

        const result = await pool.query<PenyimpananDokumenArchiveStoreRow>(
            `
            WITH doc_categories AS (
                SELECT
                    LOWER(COALESCE(kode_toko, '')) AS kode_key,
                    LOWER(COALESCE(nama_toko, '')) AS nama_key,
                    LOWER(COALESCE(cabang, '')) AS cabang_key,
                    COALESCE(kategori_dokumen, nama_dokumen) AS kategori,
                    COUNT(*)::int AS jumlah,
                    MAX(created_at) AS last_created_at
                FROM penyimpanan_dokumen
                WHERE COALESCE(kategori_dokumen, nama_dokumen) IS NOT NULL
                GROUP BY
                    LOWER(COALESCE(kode_toko, '')),
                    LOWER(COALESCE(nama_toko, '')),
                    LOWER(COALESCE(cabang, '')),
                    COALESCE(kategori_dokumen, nama_dokumen)
            ),
            doc_summary AS (
                SELECT
                    kode_key,
                    nama_key,
                    cabang_key,
                    SUM(jumlah)::int AS jumlah_dokumen,
                    jsonb_object_agg(kategori, jumlah) AS kategori_counts,
                    MAX(last_created_at) AS last_created_at
                FROM doc_categories
                GROUP BY kode_key, nama_key, cabang_key
            )
            SELECT
                s.nomor_ulok,
                s.kode_toko,
                s.nama_toko,
                s.cabang,
                s.proyek,
                COALESCE(ds.jumlah_dokumen, 0)::int AS jumlah_dokumen,
                COALESCE(ds.kategori_counts, '{}'::jsonb) AS kategori_counts,
                COALESCE(ds.last_created_at, s.created_at)::text AS last_created_at
            FROM penyimpanan_dokumen_toko s
            LEFT JOIN doc_summary ds
              ON ds.kode_key = LOWER(COALESCE(s.kode_toko, ''))
             AND ds.nama_key = LOWER(COALESCE(s.nama_toko, ''))
             AND ds.cabang_key = LOWER(COALESCE(s.cabang, ''))
            WHERE ${conditions.join(" AND ")}
            ORDER BY s.nama_toko ASC, s.kode_toko ASC
            `,
            values
        );

        return result.rows;
    },

    async findById(id: number): Promise<PenyimpananDokumenRow | null> {
        const result = await pool.query<PenyimpananDokumenRow>(
            `
            SELECT ${SELECT_COLUMNS}
            FROM penyimpanan_dokumen
            WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async update(
        id: number,
        input: PenyimpananDokumenUpdateInput & {
            link_dokumen?: string;
            link_folder?: string | null;
            drive_file_id?: string | null;
            drive_folder_id?: string | null;
        }
    )
        : Promise<PenyimpananDokumenRow | null> {
        const fields: string[] = [];
        const values: Array<string | null> = [];

        const pushField = (column: string, value: string | null | undefined) => {
            if (typeof value === "undefined") return;
            values.push(value ?? null);
            fields.push(`${column} = $${values.length}`);
        };

        pushField("nama_dokumen", input.nama_dokumen);
        pushField("drive_file_id", input.drive_file_id);
        pushField("drive_folder_id", input.drive_folder_id);
        pushField("link_dokumen", input.link_dokumen);
        pushField("link_folder", input.link_folder);

        if (fields.length === 0) {
            return this.findById(id);
        }

        const result = await pool.query<PenyimpananDokumenRow>(
            `
            UPDATE penyimpanan_dokumen
            SET ${fields.join(", ")}
            WHERE id = $${values.length + 1}
            RETURNING ${SELECT_COLUMNS}
            `,
            [...values, id]
        );

        return result.rows[0] ?? null;
    },

    async delete(id: number): Promise<PenyimpananDokumenRow | null> {
        const result = await pool.query<PenyimpananDokumenRow>(
            `
            DELETE FROM penyimpanan_dokumen
            WHERE id = $1
            RETURNING ${SELECT_COLUMNS}
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async insertMigratedStores(items: PenyimpananDokumenMigrationStoreItem[]): Promise<{ inserted: number }> {
        if (items.length === 0) return { inserted: 0 };

        const chunkSize = 500;
        let inserted = 0;

        for (let offset = 0; offset < items.length; offset += chunkSize) {
            const chunk = items.slice(offset, offset + chunkSize);
            const values: Array<string | Date | null> = [];
            const placeholders = chunk.map((item, index) => {
                const base = index * 8;
                values.push(
                    item.kode_toko,
                    item.kode_toko,
                    item.nama_toko,
                    item.cabang,
                    "Penyimpanan Dokumen",
                    item.folder_link,
                    item.source_timestamp,
                    item.source_last_edit
                );
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, CURRENT_TIMESTAMP)`;
            });

            const result = await pool.query<{ id: number }>(
                `
                INSERT INTO penyimpanan_dokumen_toko (
                    nomor_ulok, kode_toko, nama_toko, cabang, proyek, folder_link,
                    source_timestamp, source_last_edit, migrated_at
                )
                VALUES ${placeholders.join(", ")}
                ON CONFLICT DO NOTHING
                RETURNING id
                `,
                values
            );
            inserted += result.rowCount ?? 0;
        }

        return { inserted };
    },

    async insertMigratedDocuments(items: PenyimpananDokumenMigrationItem[]): Promise<{ inserted: number }> {
        if (items.length === 0) return { inserted: 0 };

        const chunkSize = 500;
        let inserted = 0;

        for (let offset = 0; offset < items.length; offset += chunkSize) {
            const chunk = items.slice(offset, offset + chunkSize);
            const values: Array<string | Date | null> = [];
            const placeholders = chunk.map((item, index) => {
                const base = index * 11;
                values.push(
                    item.kode_toko,
                    item.nama_toko,
                    item.cabang,
                    item.kategori_dokumen,
                    item.nama_dokumen,
                    item.drive_file_id,
                    item.drive_folder_id,
                    item.link_dokumen,
                    item.link_folder,
                    item.source_timestamp,
                    item.source_last_edit
                );
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, CURRENT_TIMESTAMP)`;
            });

            const result = await pool.query<{ id: number }>(
                `
                INSERT INTO penyimpanan_dokumen (
                    kode_toko, nama_toko, cabang, kategori_dokumen, nama_dokumen,
                    drive_file_id, drive_folder_id, link_dokumen, link_folder,
                    source_timestamp, source_last_edit, migrated_at
                )
                VALUES ${placeholders.join(", ")}
                ON CONFLICT (kode_toko, cabang, kategori_dokumen, nama_dokumen, link_dokumen)
                WHERE kode_toko IS NOT NULL AND link_dokumen IS NOT NULL
                DO NOTHING
                RETURNING id
                `,
                values
            );
            inserted += result.rowCount ?? 0;
        }

        return { inserted };
    }
};
