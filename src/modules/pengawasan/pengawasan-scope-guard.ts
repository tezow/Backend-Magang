import type { Pool, PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool } from "../../db/pool";

type Queryable = Pool | PoolClient;

export type PengawasanScopeGuardItem = {
    id_gantt: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    index?: number | string;
};

type ScopeGuardRow = {
    target_scope: string | null;
    nomor_ulok: string | null;
    current_scope_match: boolean;
    me_scope_match: boolean;
};

const normalizeScopeGuardText = (value: string | null | undefined): string =>
    String(value ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const ME_ONLY_CATEGORIES = new Set(["INSTALASI", "FIXTURE", "PEKERJAAN SBO", "SBO"]);

const isMeOnlyCategory = (category: string): boolean =>
    ME_ONLY_CATEGORIES.has(normalizeScopeGuardText(category));

export const assertPengawasanItemsBelongToGanttScope = async (
    items: PengawasanScopeGuardItem[],
    existingClient?: Queryable
): Promise<void> => {
    const client = existingClient ?? pool;

    for (const item of items) {
        const result = await client.query<ScopeGuardRow>(
            `
            WITH target AS (
                SELECT
                    g.id AS id_gantt,
                    t.id AS id_toko,
                    t.nomor_ulok,
                    UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) AS target_scope
                FROM gantt_chart g
                JOIN toko t ON t.id = g.id_toko
                WHERE g.id = $1
                LIMIT 1
            )
            SELECT
                target.target_scope,
                target.nomor_ulok,
                EXISTS (
                    SELECT 1
                    FROM rab r
                    JOIN rab_item ri ON ri.id_rab = r.id
                    WHERE r.id_toko = target.id_toko
                      AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ''))) = UPPER(TRIM($2))
                      AND UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ''))) = UPPER(TRIM($3))
                ) OR EXISTS (
                    SELECT 1
                    FROM opname_item oi
                    LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                    LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                    WHERE oi.id_toko = target.id_toko
                      AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ili.kategori_pekerjaan, ''))) = UPPER(TRIM($2))
                      AND UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ili.jenis_pekerjaan, ''))) = UPPER(TRIM($3))
                ) AS current_scope_match,
                EXISTS (
                    SELECT 1
                    FROM toko me_toko
                    JOIN rab me_rab ON me_rab.id_toko = me_toko.id
                    JOIN rab_item me_ri ON me_ri.id_rab = me_rab.id
                    WHERE me_toko.nomor_ulok = target.nomor_ulok
                      AND UPPER(TRIM(COALESCE(me_toko.lingkup_pekerjaan, ''))) = 'ME'
                      AND UPPER(TRIM(COALESCE(me_ri.kategori_pekerjaan, ''))) = UPPER(TRIM($2))
                      AND UPPER(TRIM(COALESCE(me_ri.jenis_pekerjaan, ''))) = UPPER(TRIM($3))
                ) OR EXISTS (
                    SELECT 1
                    FROM toko me_toko
                    JOIN opname_item oi ON oi.id_toko = me_toko.id
                    LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                    LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                    WHERE me_toko.nomor_ulok = target.nomor_ulok
                      AND UPPER(TRIM(COALESCE(me_toko.lingkup_pekerjaan, ''))) = 'ME'
                      AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ili.kategori_pekerjaan, ''))) = UPPER(TRIM($2))
                      AND UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ili.jenis_pekerjaan, ''))) = UPPER(TRIM($3))
                ) AS me_scope_match
            FROM target
            `,
            [item.id_gantt, item.kategori_pekerjaan, item.jenis_pekerjaan]
        );

        const row = result.rows[0];
        if (!row || row.target_scope !== "SIPIL") continue;

        const shouldReject = row.me_scope_match
            && (isMeOnlyCategory(item.kategori_pekerjaan) || !row.current_scope_match);

        if (!shouldReject) continue;

        const prefix = typeof item.index !== "undefined" ? `items[${item.index}]: ` : "";
        throw new AppError(
            `${prefix}Item ${item.kategori_pekerjaan} / ${item.jenis_pekerjaan} terdeteksi milik ME untuk ULOK ${row.nomor_ulok}. Tidak boleh disimpan ke pengawasan SIPIL.`,
            409
        );
    }
};
