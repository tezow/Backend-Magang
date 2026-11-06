import { pool } from "../../db/pool";

export type UserBranchCoverageRow = {
    id: number;
    user_cabang_id: number;
    covered_cabang: string;
    coverage_label: string | null;
    created_at: string;
};

export const userBranchCoverageRepository = {
    async findByUserCabangId(userCabangId: number): Promise<UserBranchCoverageRow[]> {
        const result = await pool.query<UserBranchCoverageRow>(
            `
            SELECT id, user_cabang_id, covered_cabang, coverage_label, created_at::text
            FROM user_branch_coverage
            WHERE user_cabang_id = $1
            ORDER BY covered_cabang ASC
            `,
            [userCabangId]
        );

        return result.rows;
    },

    async findCoveredBranchesByUserCabangId(userCabangId: number): Promise<string[]> {
        const rows = await this.findByUserCabangId(userCabangId);
        return rows.map(row => row.covered_cabang);
    },

    async findCoveredBranchesByEmailAndCabang(emailSat: string, cabang: string): Promise<string[]> {
        const result = await pool.query<{ covered_cabang: string }>(
            `
            SELECT DISTINCT ubc.covered_cabang
            FROM user_cabang uc
            JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
            WHERE LOWER(TRIM(uc.email_sat)) = LOWER(TRIM($1))
              AND LOWER(TRIM(uc.cabang)) = LOWER(TRIM($2))
            ORDER BY ubc.covered_cabang ASC
            `,
            [emailSat, cabang]
        );

        return result.rows.map(row => row.covered_cabang);
    }
};
