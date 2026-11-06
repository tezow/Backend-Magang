import { pool, withTransaction } from "../../db/pool";

export type SystemAccessScheduleRow = {
    id: number;
    is_enabled: boolean;
    weekday_enabled: boolean;
    weekend_enabled: boolean;
    general_start_minutes: number;
    general_end_minutes: number;
    contractor_start_minutes: number;
    contractor_end_minutes: number;
    updated_by_email: string | null;
    updated_by_role: string | null;
    updated_at: string;
};

export type UpdateSystemAccessScheduleInput = {
    is_enabled: boolean;
    weekday_enabled: boolean;
    weekend_enabled: boolean;
    general_start_minutes: number;
    general_end_minutes: number;
    contractor_start_minutes: number;
    contractor_end_minutes: number;
    actor_email?: string | null;
    actor_role?: string | null;
};

export const systemAccessScheduleRepository = {
    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_access_schedule (
                id INTEGER PRIMARY KEY DEFAULT 1,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                weekday_enabled BOOLEAN NOT NULL DEFAULT true,
                weekend_enabled BOOLEAN NOT NULL DEFAULT false,
                general_start_minutes INTEGER NOT NULL DEFAULT 360 CHECK (general_start_minutes >= 0 AND general_start_minutes <= 1440),
                general_end_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (general_end_minutes >= 0 AND general_end_minutes <= 1440),
                contractor_start_minutes INTEGER NOT NULL DEFAULT 360 CHECK (contractor_start_minutes >= 0 AND contractor_start_minutes <= 1440),
                contractor_end_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (contractor_end_minutes >= 0 AND contractor_end_minutes <= 1440),
                updated_by_email TEXT,
                updated_by_role TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now()),
                CONSTRAINT system_access_schedule_singleton CHECK (id = 1)
            )
        `);

        await pool.query(`
            INSERT INTO system_access_schedule (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_access_schedule_log (
                id BIGSERIAL PRIMARY KEY,
                is_enabled BOOLEAN NOT NULL,
                weekday_enabled BOOLEAN NOT NULL,
                weekend_enabled BOOLEAN NOT NULL,
                general_start_minutes INTEGER NOT NULL,
                general_end_minutes INTEGER NOT NULL,
                contractor_start_minutes INTEGER NOT NULL,
                contractor_end_minutes INTEGER NOT NULL,
                actor_email TEXT,
                actor_role TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);
    },

    async getSchedule(): Promise<SystemAccessScheduleRow> {
        const result = await pool.query<SystemAccessScheduleRow>(`
            SELECT id, is_enabled, weekday_enabled, weekend_enabled,
                general_start_minutes, general_end_minutes,
                contractor_start_minutes, contractor_end_minutes,
                updated_by_email, updated_by_role, updated_at
            FROM system_access_schedule
            WHERE id = 1
        `);

        if (result.rows[0]) return result.rows[0];

        await this.ensureSchema();
        const fallback = await pool.query<SystemAccessScheduleRow>(`
            SELECT id, is_enabled, weekday_enabled, weekend_enabled,
                general_start_minutes, general_end_minutes,
                contractor_start_minutes, contractor_end_minutes,
                updated_by_email, updated_by_role, updated_at
            FROM system_access_schedule
            WHERE id = 1
        `);
        return fallback.rows[0];
    },

    async updateSchedule(input: UpdateSystemAccessScheduleInput): Promise<SystemAccessScheduleRow> {
        return withTransaction(async (client) => {
            const result = await client.query<SystemAccessScheduleRow>(
                `
                UPDATE system_access_schedule
                SET is_enabled = $1,
                    weekday_enabled = $2,
                    weekend_enabled = $3,
                    general_start_minutes = $4,
                    general_end_minutes = $5,
                    contractor_start_minutes = $6,
                    contractor_end_minutes = $7,
                    updated_by_email = $8,
                    updated_by_role = $9,
                    updated_at = timezone('Asia/Jakarta', now())
                WHERE id = 1
                RETURNING id, is_enabled, weekday_enabled, weekend_enabled,
                    general_start_minutes, general_end_minutes,
                    contractor_start_minutes, contractor_end_minutes,
                    updated_by_email, updated_by_role, updated_at
                `,
                [
                    input.is_enabled,
                    input.weekday_enabled,
                    input.weekend_enabled,
                    input.general_start_minutes,
                    input.general_end_minutes,
                    input.contractor_start_minutes,
                    input.contractor_end_minutes,
                    input.actor_email ?? null,
                    input.actor_role ?? null,
                ]
            );

            const updated = result.rows[0];
            if (!updated) throw new Error("Konfigurasi jadwal akses tidak ditemukan.");

            await client.query(
                `
                INSERT INTO system_access_schedule_log (
                    is_enabled, weekday_enabled, weekend_enabled,
                    general_start_minutes, general_end_minutes,
                    contractor_start_minutes, contractor_end_minutes,
                    actor_email, actor_role
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [
                    updated.is_enabled,
                    updated.weekday_enabled,
                    updated.weekend_enabled,
                    updated.general_start_minutes,
                    updated.general_end_minutes,
                    updated.contractor_start_minutes,
                    updated.contractor_end_minutes,
                    input.actor_email ?? null,
                    input.actor_role ?? null,
                ]
            );

            return updated;
        });
    },
};
