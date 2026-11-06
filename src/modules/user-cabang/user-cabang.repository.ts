import { pool } from "../../db/pool";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import type { CreateUserCabangInput, ListUserCabangQueryInput, UpdateUserCabangInput } from "./user-cabang.schema";

export const DC_USER_ROLE_OPTIONS = [
    "KONSULTAN SOIL INVESTIGATION",
    "KONSULTAN PERENCANA",
    "KONSULTAN PENGAWAS DC",
    "KONTRAKTOR DC",
    "DC BUILDING & DEVELOPMENT MANAGER",
    "DC BUILDING & DEVELOPMENT SPECIALIST",
    "DC DOCUMENT ADMIN",
    "BUILDING & DEVELOPMENT GENERAL MANAGER",
    "LOCATION & DEVELOPMENT GENERAL MANAGER",
    "PROPERTY DEVELOPMENT DIRECTOR",
    "BUILDING & MAINTENANCE SUPER HUMAN"
] as const;

export type UserCabangRow = {
    id: number;
    cabang: string;
    nama_lengkap: string | null;
    jabatan: string | null;
    email_sat: string;
    nama_pt: string | null;
    last_login_at?: string | null;
    coverage?: string[];
};

export const userCabangRepository = {
    async ensureLoginTrackingSchema(): Promise<void> {
        await pool.query(`
            ALTER TABLE user_cabang
                ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NULL;

            CREATE INDEX IF NOT EXISTS idx_user_cabang_last_login_at
                ON user_cabang (last_login_at DESC);
        `);
    },

    async updateLastLoginById(id: number): Promise<void> {
        await pool.query(
            `
            UPDATE user_cabang
            SET last_login_at = now()
            WHERE id = $1
            `,
            [id]
        );
    },

    async create(input: CreateUserCabangInput): Promise<UserCabangRow> {
        const result = await pool.query<UserCabangRow>(
            `
      INSERT INTO user_cabang (cabang, nama_lengkap, jabatan, email_sat, nama_pt)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, cabang, nama_lengkap, jabatan, email_sat, nama_pt
      `,
            [
                input.cabang,
                input.nama_lengkap ?? null,
                input.jabatan ?? null,
                input.email_sat,
                input.nama_pt ?? null
            ]
        );

        return result.rows[0];
    },

    async findById(id: number): Promise<UserCabangRow | null> {
        const result = await pool.query<UserCabangRow>(
            `
            SELECT id, cabang, nama_lengkap, jabatan, email_sat, nama_pt, ARRAY[]::text[] AS coverage
      FROM user_cabang
      WHERE id = $1
      `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async findAll(query: ListUserCabangQueryInput): Promise<UserCabangRow[]> {
        const filters: string[] = [];
        const values: Array<string | string[]> = [];

        if (query.search) {
            values.push(`%${query.search}%`);
            const index = values.length;
            filters.push(`(
                uc.cabang ILIKE $${index}
                OR uc.nama_lengkap ILIKE $${index}
                OR uc.jabatan ILIKE $${index}
                OR uc.email_sat ILIKE $${index}
                OR uc.nama_pt ILIKE $${index}
            )`);
        }

        if (query.cabang) {
            if (query.include_branch_scope) {
                values.push(getBranchScopeCandidates(query.cabang));
                filters.push(`UPPER(TRIM(uc.cabang)) = ANY($${values.length}::text[])`);
            } else {
                values.push(query.cabang);
                filters.push(`LOWER(uc.cabang) = LOWER($${values.length})`);
            }
        }

        if (query.email_sat) {
            values.push(query.email_sat.trim());
            filters.push(`LOWER(TRIM(uc.email_sat)) = LOWER($${values.length})`);
        }

        if (query.jabatan) {
            values.push(query.jabatan);
            filters.push(`LOWER(uc.jabatan) = LOWER($${values.length})`);
        }

        if (query.nama_pt) {
            values.push(query.nama_pt);
            filters.push(`LOWER(uc.nama_pt) = LOWER($${values.length})`);
        }

        if (query.workspace === "dc") {
            values.push([...DC_USER_ROLE_OPTIONS]);
            filters.push(`UPPER(TRIM(uc.jabatan)) = ANY($${values.length}::text[])`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const result = await pool.query<UserCabangRow>(
            `
            SELECT
                uc.id,
                uc.cabang,
                uc.nama_lengkap,
                uc.jabatan,
                uc.email_sat,
                uc.nama_pt,
                COALESCE(
                    ARRAY_REMOVE(ARRAY_AGG(ubc.covered_cabang ORDER BY ubc.covered_cabang), NULL),
                    ARRAY[]::text[]
                ) AS coverage
      FROM user_cabang uc
      LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
      ${whereClause}
      GROUP BY uc.id, uc.cabang, uc.nama_lengkap, uc.jabatan, uc.email_sat, uc.nama_pt
      ORDER BY cabang ASC, nama_lengkap ASC, email_sat ASC
      `,
            values
        );

        return result.rows;
    },

    async updateById(id: number, input: UpdateUserCabangInput): Promise<UserCabangRow | null> {
        const setParts: string[] = [];
        const values: Array<string | number | null> = [];

        if (typeof input.cabang !== "undefined") {
            values.push(input.cabang);
            setParts.push(`cabang = $${values.length}`);
        }

        if (typeof input.email_sat !== "undefined") {
            values.push(input.email_sat);
            setParts.push(`email_sat = $${values.length}`);
        }

        if (typeof input.nama_lengkap !== "undefined") {
            values.push(input.nama_lengkap);
            setParts.push(`nama_lengkap = $${values.length}`);
        }

        if (typeof input.jabatan !== "undefined") {
            values.push(input.jabatan);
            setParts.push(`jabatan = $${values.length}`);
        }

        if (typeof input.nama_pt !== "undefined") {
            values.push(input.nama_pt);
            setParts.push(`nama_pt = $${values.length}`);
        }

        values.push(id);
        const result = await pool.query<UserCabangRow>(
            `
      UPDATE user_cabang
      SET ${setParts.join(", ")}
            WHERE id = $${values.length}
            RETURNING id, cabang, nama_lengkap, jabatan, email_sat, nama_pt
      `,
            values
        );

        return result.rows[0] ?? null;
    },

    /**
     * Cari user berdasarkan cabang dan jabatan.
     * Mengembalikan satu user pertama yang ditemukan (ORDER BY email_sat ASC LIMIT 1).
     */
    async findByCabangAndJabatan(cabang: string, jabatan: string): Promise<UserCabangRow | null> {
        const branchCandidates = getBranchScopeCandidates(cabang);
        const result = await pool.query<UserCabangRow>(
            `
      SELECT uc.id, uc.cabang, uc.nama_lengkap, uc.jabatan, uc.email_sat, uc.nama_pt, ARRAY[]::text[] AS coverage
      FROM user_cabang uc
      LEFT JOIN user_branch_coverage ubc
        ON ubc.user_cabang_id = uc.id
       AND UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM($3))
      WHERE UPPER(TRIM(uc.cabang)) = ANY($1::text[])
        AND LOWER(uc.jabatan) = LOWER($2)
      ORDER BY
        CASE WHEN UPPER(TRIM(uc.cabang)) = UPPER(TRIM($3)) THEN 0 ELSE 1 END,
        CASE WHEN ubc.id IS NOT NULL THEN 0 ELSE 1 END,
        uc.email_sat ASC
      LIMIT 1
      `,
            [branchCandidates, jabatan, cabang]
        );

        return result.rows[0] ?? null;
    },

    async deleteById(id: number): Promise<UserCabangRow | null> {
        const result = await pool.query<UserCabangRow>(
            `
      DELETE FROM user_cabang
            WHERE id = $1
            RETURNING id, cabang, nama_lengkap, jabatan, email_sat, nama_pt
      `,
            [id]
        );

        return result.rows[0] ?? null;
    }
};
