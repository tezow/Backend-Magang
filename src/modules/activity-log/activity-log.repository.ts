import type { PoolClient } from "pg";
import { pool } from "../../db/pool";

export type ActivityLogEntityType =
    | "RAB"
    | "SPK"
    | "PERTAMBAHAN_SPK"
    | "OPNAME"
    | "OPNAME_FINAL"
    | "PENGAWASAN"
    | "BERKAS_SERAH_TERIMA"
    | "INSTRUKSI_LAPANGAN"
    | "GANTT"
    | "PROJECT_PLANNING"
    | "DOKUMENTASI_BANGUNAN"
    | "PENYIMPANAN_DOKUMEN"
    | "SURAT_PERINGATAN"
    | "INTERVENSI"
    | "DC_DEVELOPMENT";

export type ActivityLogRow = {
    id: number;
    entity_type: ActivityLogEntityType;
    entity_id: number;
    actor_email: string | null;
    actor_role: string | null;
    action: string;
    status_before: string | null;
    status_after: string | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
};

export type InsertActivityLogInput = {
    entity_type: ActivityLogEntityType;
    entity_id: number;
    actor_email?: string | null;
    actor_role?: string | null;
    action: string;
    status_before?: string | null;
    status_after?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
};

export const activityLogRepository = {
    async insert(input: InsertActivityLogInput, client?: PoolClient): Promise<ActivityLogRow> {
        const db = client ?? pool;
        const result = await db.query<ActivityLogRow>(
            `
            INSERT INTO activity_log (
                entity_type, entity_id, actor_email, actor_role, action,
                status_before, status_after, reason, metadata, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, timezone('Asia/Jakarta', now()))
            RETURNING id, entity_type, entity_id, actor_email, actor_role, action,
                status_before, status_after, reason, metadata, created_at
            `,
            [
                input.entity_type,
                input.entity_id,
                input.actor_email ?? null,
                input.actor_role ?? null,
                input.action,
                input.status_before ?? null,
                input.status_after ?? null,
                input.reason ?? null,
                input.metadata ? JSON.stringify(input.metadata) : null
            ]
        );

        return result.rows[0];
    },

    async list(filter: { entity_type: ActivityLogEntityType; entity_id: number }): Promise<ActivityLogRow[]> {
        const result = await pool.query<ActivityLogRow>(
            `
            SELECT id, entity_type, entity_id, actor_email, actor_role, action,
                status_before, status_after, reason, metadata, created_at
            FROM activity_log
            WHERE entity_type = $1
              AND entity_id = $2
            ORDER BY created_at ASC, id ASC
            `,
            [filter.entity_type, filter.entity_id]
        );

        return result.rows;
    }
};
