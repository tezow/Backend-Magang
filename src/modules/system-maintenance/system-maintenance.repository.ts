import { pool, withTransaction } from "../../db/pool";

export type SystemMaintenanceRow = {
    id: number;
    is_active: boolean;
    title: string;
    message: string;
    started_at: string | null;
    ended_at: string | null;
    updated_by_email: string | null;
    updated_by_role: string | null;
    updated_at: string;
};

export type UpdateSystemMaintenanceInput = {
    is_active: boolean;
    title: string;
    message: string;
    actor_email?: string | null;
    actor_role?: string | null;
};

const DEFAULT_TITLE = "Sistem sedang dalam pemeliharaan";
const DEFAULT_MESSAGE = "Akses sementara dibatasi agar pembaruan dapat berjalan stabil. Silakan kembali beberapa saat lagi.";

export const SYSTEM_MAINTENANCE_TEMPLATE = {
    title: DEFAULT_TITLE,
    message: DEFAULT_MESSAGE,
} as const;

export const systemMaintenanceRepository = {
    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_maintenance (
                id INTEGER PRIMARY KEY DEFAULT 1,
                is_active BOOLEAN NOT NULL DEFAULT false,
                title TEXT NOT NULL DEFAULT '${DEFAULT_TITLE.replace(/'/g, "''")}',
                message TEXT NOT NULL DEFAULT '${DEFAULT_MESSAGE.replace(/'/g, "''")}',
                started_at TIMESTAMP,
                ended_at TIMESTAMP,
                updated_by_email TEXT,
                updated_by_role TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now()),
                CONSTRAINT system_maintenance_singleton CHECK (id = 1)
            )
        `);

        await pool.query(`
            INSERT INTO system_maintenance (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_maintenance_log (
                id BIGSERIAL PRIMARY KEY,
                is_active BOOLEAN NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                actor_email TEXT,
                actor_role TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);
    },

    async getStatus(): Promise<SystemMaintenanceRow> {
        const result = await pool.query<SystemMaintenanceRow>(`
            SELECT id, is_active, title, message, started_at, ended_at,
                updated_by_email, updated_by_role, updated_at
            FROM system_maintenance
            WHERE id = 1
        `);

        if (result.rows[0]) return result.rows[0];

        await this.ensureSchema();
        const fallback = await pool.query<SystemMaintenanceRow>(`
            SELECT id, is_active, title, message, started_at, ended_at,
                updated_by_email, updated_by_role, updated_at
            FROM system_maintenance
            WHERE id = 1
        `);
        return fallback.rows[0];
    },

    async updateStatus(input: UpdateSystemMaintenanceInput): Promise<SystemMaintenanceRow> {
        return withTransaction(async (client) => {
            const current = await client.query<SystemMaintenanceRow>(
                "SELECT is_active, started_at FROM system_maintenance WHERE id = 1 FOR UPDATE"
            );
            const wasActive = current.rows[0]?.is_active ?? false;

            const result = await client.query<SystemMaintenanceRow>(
                `
                UPDATE system_maintenance
                SET is_active = $1,
                    title = $2,
                    message = $3,
                    started_at = CASE
                        WHEN $1 = true AND is_active = false THEN timezone('Asia/Jakarta', now())
                        WHEN $1 = true THEN started_at
                        ELSE NULL
                    END,
                    ended_at = CASE
                        WHEN $1 = false AND is_active = true THEN timezone('Asia/Jakarta', now())
                        WHEN $1 = false THEN ended_at
                        ELSE NULL
                    END,
                    updated_by_email = $4,
                    updated_by_role = $5,
                    updated_at = timezone('Asia/Jakarta', now())
                WHERE id = 1
                RETURNING id, is_active, title, message, started_at, ended_at,
                    updated_by_email, updated_by_role, updated_at
                `,
                [
                    input.is_active,
                    input.title,
                    input.message,
                    input.actor_email ?? null,
                    input.actor_role ?? null,
                ]
            );

            const updated = result.rows[0];
            if (!updated) throw new Error("Konfigurasi pemeliharaan sistem tidak ditemukan.");

            if (wasActive !== updated.is_active) {
                await client.query(
                    `
                    INSERT INTO system_maintenance_log (
                        is_active, title, message, actor_email, actor_role
                    )
                    VALUES ($1, $2, $3, $4, $5)
                    `,
                    [
                        updated.is_active,
                        updated.title,
                        updated.message,
                        input.actor_email ?? null,
                        input.actor_role ?? null,
                    ]
                );
            }

            return updated;
        });
    },
};
