import { pool, withTransaction } from "../../db/pool";
import { BRANCH_GROUPS, normalizeBranchScopeName } from "../../common/branch-scope";

export const DEFAULT_SPK_BACKDATE_BRANCHES = [
    "LAMPUNG",
    "LUWU",
    "JEMBER",
    "CILACAP",
    "BANJARMASIN",
    "BANDUNG",
    "BANDUNG 1",
    "BANDUNG 2",
    "BANDUNG RAYA",
    "CILEUNGSI",
    "MALANG",
] as const;

export type SpkBackdatePolicyRow = {
    branch_name: string;
    is_enabled: boolean;
    updated_by_email: string | null;
    updated_by_role: string | null;
    updated_at: string;
};

export type UpdateSpkBackdatePolicyInput = {
    branches: string[];
    actor_email?: string | null;
    actor_role?: string | null;
};

const getPolicyBranchKey = (branchName?: string | null): string => {
    const normalized = normalizeBranchScopeName(branchName);
    if (!normalized) return "";

    for (const [parentBranch, branchGroup] of Object.entries(BRANCH_GROUPS)) {
        const normalizedParent = normalizeBranchScopeName(parentBranch);
        const normalizedGroup = branchGroup.map(normalizeBranchScopeName);
        if (normalizedParent === normalized || normalizedGroup.includes(normalized)) {
            return normalizedParent;
        }
    }

    return normalized;
};

const normalizeBranches = (branches: string[]): string[] =>
    Array.from(new Set(branches.map(getPolicyBranchKey).filter(Boolean))).sort();

export const spkBackdatePolicyRepository = {
    normalizeBranches,

    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS spk_backdate_branch_policy (
                branch_name TEXT PRIMARY KEY,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                updated_by_email TEXT,
                updated_by_role TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS spk_backdate_branch_policy_log (
                id BIGSERIAL PRIMARY KEY,
                branch_name TEXT NOT NULL,
                is_enabled BOOLEAN NOT NULL,
                actor_email TEXT,
                actor_role TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);

        const defaultBranches = normalizeBranches([...DEFAULT_SPK_BACKDATE_BRANCHES]);
        await pool.query(
            `
            INSERT INTO spk_backdate_branch_policy (branch_name, is_enabled)
            SELECT branch_name, true
            FROM unnest($1::text[]) AS branch_name
            ON CONFLICT (branch_name) DO NOTHING
            `,
            [defaultBranches]
        );
    },

    async list(): Promise<SpkBackdatePolicyRow[]> {
        await this.ensureSchema();
        const result = await pool.query<SpkBackdatePolicyRow>(`
            SELECT branch_name, is_enabled, updated_by_email, updated_by_role, updated_at
            FROM spk_backdate_branch_policy
            ORDER BY branch_name ASC
        `);
        return result.rows;
    },

    async listEnabledBranches(): Promise<string[]> {
        await this.ensureSchema();
        const result = await pool.query<{ branch_name: string }>(`
            SELECT branch_name
            FROM spk_backdate_branch_policy
            WHERE is_enabled = true
            ORDER BY branch_name ASC
        `);
        return normalizeBranches(result.rows.map((row) => row.branch_name));
    },

    async isBranchEnabled(branchName?: string | null): Promise<boolean> {
        const normalized = getPolicyBranchKey(branchName);
        if (!normalized) return false;

        await this.ensureSchema();
        const result = await pool.query<{ is_enabled: boolean }>(
            `
            SELECT is_enabled
            FROM spk_backdate_branch_policy
            WHERE branch_name = $1
            `,
            [normalized]
        );
        return Boolean(result.rows[0]?.is_enabled);
    },

    async replaceEnabledBranches(input: UpdateSpkBackdatePolicyInput): Promise<SpkBackdatePolicyRow[]> {
        const normalizedBranches = normalizeBranches(input.branches);

        return withTransaction(async (client) => {
            await client.query(`
                CREATE TABLE IF NOT EXISTS spk_backdate_branch_policy (
                    branch_name TEXT PRIMARY KEY,
                    is_enabled BOOLEAN NOT NULL DEFAULT true,
                    updated_by_email TEXT,
                    updated_by_role TEXT,
                    updated_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS spk_backdate_branch_policy_log (
                    id BIGSERIAL PRIMARY KEY,
                    branch_name TEXT NOT NULL,
                    is_enabled BOOLEAN NOT NULL,
                    actor_email TEXT,
                    actor_role TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
                )
            `);

            await client.query(
                `
                UPDATE spk_backdate_branch_policy
                SET is_enabled = false,
                    updated_by_email = $1,
                    updated_by_role = $2,
                    updated_at = timezone('Asia/Jakarta', now())
                WHERE is_enabled = true
                  AND NOT (branch_name = ANY($3::text[]))
                `,
                [input.actor_email ?? null, input.actor_role ?? null, normalizedBranches]
            );

            if (normalizedBranches.length > 0) {
                await client.query(
                    `
                    INSERT INTO spk_backdate_branch_policy (
                        branch_name, is_enabled, updated_by_email, updated_by_role, updated_at
                    )
                    SELECT branch_name, true, $2, $3, timezone('Asia/Jakarta', now())
                    FROM unnest($1::text[]) AS branch_name
                    ON CONFLICT (branch_name) DO UPDATE
                    SET is_enabled = true,
                        updated_by_email = EXCLUDED.updated_by_email,
                        updated_by_role = EXCLUDED.updated_by_role,
                        updated_at = EXCLUDED.updated_at
                    `,
                    [normalizedBranches, input.actor_email ?? null, input.actor_role ?? null]
                );
            }

            await client.query(
                `
                INSERT INTO spk_backdate_branch_policy_log (
                    branch_name, is_enabled, actor_email, actor_role
                )
                SELECT branch_name, is_enabled, $1, $2
                FROM spk_backdate_branch_policy
                `,
                [input.actor_email ?? null, input.actor_role ?? null]
            );

            const result = await client.query<SpkBackdatePolicyRow>(`
                SELECT branch_name, is_enabled, updated_by_email, updated_by_role, updated_at
                FROM spk_backdate_branch_policy
                ORDER BY branch_name ASC
            `);
            return result.rows;
        });
    },
};
