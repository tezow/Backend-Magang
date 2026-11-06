import { pool, withTransaction } from "../../db/pool";
import type { CreatePicPengawasanInput, ListPicPengawasanQueryInput } from "./pic-pengawasan.schema";

export type PicPengawasanRow = {
    id: number;
    id_toko: number;
    nomor_ulok: string;
    id_rab: number;
    id_spk: number;
    kategori_lokasi: string;
    durasi: string;
    tanggal_mulai_spk: string;
    plc_building_support: string;
    created_at: string;
};

export const picPengawasanRepository = {
    async create(input: CreatePicPengawasanInput): Promise<PicPengawasanRow> {
        const result = await pool.query<PicPengawasanRow>(
            `
      INSERT INTO pic_pengawasan (
                id_toko,
        nomor_ulok,
        id_rab,
        id_spk,
        kategori_lokasi,
        durasi,
        tanggal_mulai_spk,
        plc_building_support
      )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi, durasi, tanggal_mulai_spk, plc_building_support, created_at
      `,
            [
                                input.id_toko,
                input.nomor_ulok,
                input.id_rab,
                input.id_spk,
                input.kategori_lokasi,
                input.durasi,
                input.tanggal_mulai_spk,
                input.plc_building_support
            ]
        );

        return result.rows[0];
    },

    async createWithLegacyRabRepair(input: CreatePicPengawasanInput): Promise<PicPengawasanRow> {
        return withTransaction(async (client) => {
            const requestedRefs = await client.query<{
                rab_toko_id: number;
                spk_toko_id: number;
            }>(
                `
                SELECT
                    r.id_toko AS rab_toko_id,
                    s.id_toko AS spk_toko_id
                FROM rab r
                JOIN pengajuan_spk s ON s.id = $2
                WHERE r.id = $1
                `,
                [input.id_rab, input.id_spk]
            );
            const refs = requestedRefs.rows[0];
            if (!refs || refs.rab_toko_id !== input.id_toko || refs.spk_toko_id !== input.id_toko) {
                throw new Error("PIC_REFERENCE_SCOPE_MISMATCH");
            }

            const conflictResult = await client.query<PicPengawasanRow & { spk_toko_id: number }>(
                `
                SELECT pic.id, pic.id_toko, pic.nomor_ulok, pic.id_rab, pic.id_spk,
                       pic.kategori_lokasi, pic.durasi, pic.tanggal_mulai_spk,
                       pic.plc_building_support, pic.created_at,
                       legacy_spk.id_toko AS spk_toko_id
                FROM pic_pengawasan pic
                JOIN pengajuan_spk legacy_spk ON legacy_spk.id = pic.id_spk
                WHERE pic.id_rab = $1
                FOR UPDATE OF pic
                `,
                [input.id_rab]
            );
            const conflict = conflictResult.rows[0];
            if (!conflict || conflict.id_toko === input.id_toko || conflict.spk_toko_id !== conflict.id_toko) {
                throw new Error("PIC_LEGACY_RAB_CONFLICT_NOT_REPAIRABLE");
            }

            const replacementRab = await client.query<{ id: number }>(
                `
                SELECT r.id
                FROM rab r
                WHERE r.id_toko = $1
                  AND r.id <> $2
                  AND UPPER(TRIM(COALESCE(r.status, ''))) IN ('DISETUJUI', 'APPROVED')
                  AND NOT EXISTS (
                      SELECT 1 FROM pic_pengawasan other WHERE other.id_rab = r.id
                  )
                ORDER BY r.id DESC
                LIMIT 1
                FOR UPDATE
                `,
                [conflict.id_toko, input.id_rab]
            );
            const replacementRabId = replacementRab.rows[0]?.id;
            if (!replacementRabId) {
                throw new Error("PIC_LEGACY_REPLACEMENT_RAB_NOT_FOUND");
            }

            await client.query(
                `UPDATE pic_pengawasan SET id_rab = $1 WHERE id = $2`,
                [replacementRabId, conflict.id]
            );

            const inserted = await client.query<PicPengawasanRow>(
                `
                INSERT INTO pic_pengawasan (
                    id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi,
                    durasi, tanggal_mulai_spk, plc_building_support
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, id_toko, nomor_ulok, id_rab, id_spk,
                          kategori_lokasi, durasi, tanggal_mulai_spk,
                          plc_building_support, created_at
                `,
                [
                    input.id_toko,
                    input.nomor_ulok,
                    input.id_rab,
                    input.id_spk,
                    input.kategori_lokasi,
                    input.durasi,
                    input.tanggal_mulai_spk,
                    input.plc_building_support
                ]
            );
            return inserted.rows[0];
        });
    },

    async findById(id: string): Promise<PicPengawasanRow | null> {
        const result = await pool.query<PicPengawasanRow>(
            `
    SELECT id, id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi, durasi, tanggal_mulai_spk, plc_building_support, created_at
      FROM pic_pengawasan
      WHERE id = $1
      `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async findAll(query: ListPicPengawasanQueryInput): Promise<PicPengawasanRow[]> {
        const filters: string[] = [];
        const values: Array<string | number> = [];

        if (typeof query.id_toko !== "undefined") {
            values.push(query.id_toko);
            filters.push(`id_toko = $${values.length}`);
        }

        if (query.nomor_ulok) {
            values.push(query.nomor_ulok);
            filters.push(`nomor_ulok = $${values.length}`);
        }

        if (typeof query.id_rab !== "undefined") {
            values.push(query.id_rab);
            filters.push(`id_rab = $${values.length}`);
        }

        if (typeof query.id_spk !== "undefined") {
            values.push(query.id_spk);
            filters.push(`id_spk = $${values.length}`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const result = await pool.query<PicPengawasanRow>(
            `
    SELECT id, id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi, durasi, tanggal_mulai_spk, plc_building_support, created_at
      FROM pic_pengawasan
      ${whereClause}
      ORDER BY id DESC
      `,
            values
        );

        return result.rows;
    }
};
