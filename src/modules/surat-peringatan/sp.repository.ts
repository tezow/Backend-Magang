export const branchGroupSql = (colName: string) => `
    CASE 
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('BANDUNG', 'BANDUNG 1', 'BANDUNG 2', 'BANDUNG RAYA') THEN 'BANDUNG RAYA'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('SUMBAWA', 'LOMBOK') THEN 'LOMBOK'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('BOGOR', 'BEKASI', 'KARAWANG', 'CILEUNGSI') THEN 'CILEUNGSI'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('PARUNG', 'BALARAJA', 'SERANG', 'BINTAN', 'CIKOKOL') THEN 'CIKOKOL'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('ACEH', 'MEDAN') THEN 'MEDAN'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('KOTABUMI', 'LAMPUNG') THEN 'LAMPUNG'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('BENGKULU', 'BANGKA', 'BELITUNG', 'PALEMBANG') THEN 'PALEMBANG'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('SIDOARJO BPN SMD', 'MANOKWARI', 'NTT', 'SORONG', 'SIDOARJO') THEN 'SIDOARJO'
      WHEN UPPER(TRIM(COALESCE(${colName}, ''))) IN ('BANJARMASIN', 'PALANGKARAYA') THEN 'BANJARMASIN'
      ELSE UPPER(TRIM(COALESCE(${colName}, '')))
    END
`;
import { pool } from "../../db/pool";
import type { DendaActionStatus, DendaActionType, ListDendaActionsQuery, SpReason } from "./sp.schema";
import { getEffectiveBranchesForUser } from "../../common/branch-scope";
import type { AuthenticatedUser } from "../auth/auth-session.service";

export type DendaActionCandidateRow = {
    opname_final_id: number | null;
    id_toko: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    nama_kontraktor: string | null;
    nomor_spk: string | null;
    hari_denda: number;
    nilai_denda: string;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    active_sp_count: number;
    next_sp_level: number | null;
    has_pending_approval: boolean;
    latest_action_type: DendaActionType | null;
    latest_action_status: DendaActionStatus | null;
    latest_action_created_at: string | null;
    latest_action_expires_at: string | null;
    latest_action_is_expired: boolean;
};

export type DendaActionRow = {
    id: number;
    id_toko: number;
    id_opname_final: number | null;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    nama_kontraktor: string | null;
    nomor_spk: string | null;
    action_type: DendaActionType;
    status: DendaActionStatus;
    sp_level: number | null;
    hari_denda: number;
    nilai_denda: string;
    alasan_sp: SpReason | null;
    alasan_lainnya: string | null;
    catatan: string | null;
    instruksi_tindak_lanjut: string | null;
    deadline_tindak_lanjut: string | null;
    lampiran_1_url: string | null;
    lampiran_2_url: string | null;
    nomor_surat: string | null;
    link_pdf: string | null;
    submitted_by_email: string | null;
    submitted_by_name: string | null;
    submitted_by_role: string | null;
    submitted_at: string | null;
    manager_approved_by: string | null;
    manager_approved_role: string | null;
    manager_approved_at: string | null;
    manager_rejected_by: string | null;
    manager_rejected_role: string | null;
    manager_rejected_at: string | null;
    manager_rejected_reason: string | null;
    sent_to_contractor_at: string | null;
    viewed_by_contractor_at: string | null;
    acknowledged_by_contractor_at: string | null;
    acknowledged_by_email: string | null;
    acknowledged_by_role: string | null;
    catatan_acknowledge: string | null;
    expires_at: string | null;
    actor_email: string | null;
    actor_role: string | null;
    created_at: string;
    updated_at: string;
    is_expired: boolean;
    is_active: boolean;
};

export type DendaActionTargetRow = {
    id_opname_final: number | null;
    id_toko: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    nama_kontraktor: string | null;
    nomor_spk: string | null;
    hari_denda: number;
    nilai_denda: string;
};

const ACTION_SELECT = `
    id, id_toko, id_opname_final, nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko, ${branchGroupSql('cabang')} AS cabang, nama_kontraktor, nomor_spk,
    action_type, status, sp_level, hari_denda, nilai_denda, alasan_sp, alasan_lainnya, catatan,
    instruksi_tindak_lanjut, deadline_tindak_lanjut, lampiran_1_url, lampiran_2_url,
    nomor_surat, link_pdf, submitted_by_email, submitted_by_name, submitted_by_role, submitted_at,
    manager_approved_by, manager_approved_role, manager_approved_at,
    manager_rejected_by, manager_rejected_role, manager_rejected_at, manager_rejected_reason,
    sent_to_contractor_at, viewed_by_contractor_at, acknowledged_by_contractor_at,
    acknowledged_by_email, acknowledged_by_role, catatan_acknowledge, expires_at,
    actor_email, actor_role, created_at, updated_at,
    (expires_at IS NOT NULL AND expires_at < timezone('Asia/Jakarta', now())) AS is_expired,
    (
        action_type = 'SP'
        AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
        AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
    ) AS is_active
`;

const contractorMatchSql = (param: string) => `
    (
        LOWER(TRIM(COALESCE(nama_kontraktor, ''))) = LOWER(TRIM(${param}))
        OR LOWER(TRIM(COALESCE(nama_kontraktor, ''))) LIKE '%' || LOWER(TRIM(${param})) || '%'
        OR LOWER(TRIM(${param})) LIKE '%' || LOWER(TRIM(COALESCE(nama_kontraktor, ''))) || '%'
        OR regexp_replace(UPPER(COALESCE(nama_kontraktor, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(UPPER(${param}), '[^A-Z0-9]', '', 'g')
        OR regexp_replace(UPPER(COALESCE(nama_kontraktor, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER(${param}), '[^A-Z0-9]', '', 'g') || '%'
        OR regexp_replace(UPPER(${param}), '[^A-Z0-9]', '', 'g') LIKE '%' || regexp_replace(UPPER(COALESCE(nama_kontraktor, '')), '[^A-Z0-9]', '', 'g') || '%'
    )
`;

export const spRepository = {
    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS denda_keterlambatan_action (
                id BIGSERIAL PRIMARY KEY,
                id_toko INTEGER REFERENCES toko(id) ON DELETE CASCADE,
                id_opname_final INTEGER REFERENCES opname_final(id) ON DELETE CASCADE,
                nomor_ulok TEXT,
                lingkup_pekerjaan TEXT,
                nama_toko TEXT,
                kode_toko TEXT,
                cabang TEXT,
                nama_kontraktor TEXT,
                nomor_spk TEXT,
                action_type TEXT NOT NULL CHECK (action_type IN ('SP', 'TAKEOVER')),
                status TEXT NOT NULL DEFAULT 'WAITING_MANAGER',
                sp_level INTEGER,
                hari_denda INTEGER NOT NULL,
                nilai_denda NUMERIC NOT NULL DEFAULT 0,
                alasan_sp TEXT,
                catatan TEXT,
                instruksi_tindak_lanjut TEXT,
                deadline_tindak_lanjut DATE,
                lampiran_1_url TEXT,
                lampiran_2_url TEXT,
                nomor_surat TEXT,
                link_pdf TEXT,
                submitted_by_email TEXT,
                submitted_by_role TEXT,
                submitted_at TIMESTAMP,
                manager_approved_by TEXT,
                manager_approved_role TEXT,
                manager_approved_at TIMESTAMP,
                manager_rejected_by TEXT,
                manager_rejected_role TEXT,
                manager_rejected_at TIMESTAMP,
                manager_rejected_reason TEXT,
                sent_to_contractor_at TIMESTAMP,
                viewed_by_contractor_at TIMESTAMP,
                acknowledged_by_contractor_at TIMESTAMP,
                acknowledged_by_email TEXT,
                acknowledged_by_role TEXT,
                catatan_acknowledge TEXT,
                expires_at TIMESTAMP,
                actor_email TEXT,
                actor_role TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now()),
                updated_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);

        await pool.query(`
            ALTER TABLE denda_keterlambatan_action
                ALTER COLUMN status SET DEFAULT 'WAITING_MANAGER',
                ALTER COLUMN id_toko DROP NOT NULL,
                ALTER COLUMN id_opname_final DROP NOT NULL,
                ADD COLUMN IF NOT EXISTS alasan_lainnya TEXT,
                ADD COLUMN IF NOT EXISTS sp_level INTEGER,
                ADD COLUMN IF NOT EXISTS nama_toko TEXT,
                ADD COLUMN IF NOT EXISTS kode_toko TEXT,
                ADD COLUMN IF NOT EXISTS nama_kontraktor TEXT,
                ADD COLUMN IF NOT EXISTS nomor_spk TEXT,
                ADD COLUMN IF NOT EXISTS alasan_sp TEXT,
                ADD COLUMN IF NOT EXISTS instruksi_tindak_lanjut TEXT,
                ADD COLUMN IF NOT EXISTS deadline_tindak_lanjut DATE,
                ADD COLUMN IF NOT EXISTS lampiran_1_url TEXT,
                ADD COLUMN IF NOT EXISTS lampiran_2_url TEXT,
                ADD COLUMN IF NOT EXISTS nomor_surat TEXT,
                ADD COLUMN IF NOT EXISTS link_pdf TEXT,
                ADD COLUMN IF NOT EXISTS submitted_by_email TEXT,
                ADD COLUMN IF NOT EXISTS submitted_by_role TEXT,
                ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS manager_approved_by TEXT,
                ADD COLUMN IF NOT EXISTS manager_approved_role TEXT,
                ADD COLUMN IF NOT EXISTS manager_approved_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS manager_rejected_by TEXT,
                ADD COLUMN IF NOT EXISTS manager_rejected_role TEXT,
                ADD COLUMN IF NOT EXISTS manager_rejected_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS manager_rejected_reason TEXT,
                ADD COLUMN IF NOT EXISTS sent_to_contractor_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS viewed_by_contractor_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS acknowledged_by_contractor_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS acknowledged_by_email TEXT,
                ADD COLUMN IF NOT EXISTS acknowledged_by_role TEXT,
                ADD COLUMN IF NOT EXISTS catatan_acknowledge TEXT,
                ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS submitted_by_name TEXT
        `);

        await pool.query(`
            UPDATE denda_keterlambatan_action
            SET status = 'WAITING_MANAGER',
                submitted_by_email = COALESCE(submitted_by_email, actor_email),
                submitted_by_role = COALESCE(submitted_by_role, actor_role),
                submitted_at = COALESCE(submitted_at, created_at),
                updated_at = timezone('Asia/Jakarta', now())
            WHERE status = 'OPEN'
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_denda_action_opname_final
            ON denda_keterlambatan_action (id_opname_final, created_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_denda_action_toko
            ON denda_keterlambatan_action (id_toko, created_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_denda_action_status_expiry
            ON denda_keterlambatan_action (status, expires_at)
        `);
    },

    async listCandidates(cabang_array?: string[]): Promise<DendaActionCandidateRow[]> {
        const conditions = [
            `st.id IS NULL`,
            `spk.nomor_spk IS NOT NULL`,
            `NULLIF(TRIM(COALESCE(spk.nama_kontraktor, t.nama_kontraktor, '')), '') IS NOT NULL`
        ];
        const values: any[] = [];
        
        if (cabang_array && cabang_array.length > 0) {
            const normalizedBranches = cabang_array.map(b => b.trim().toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`UPPER(t.cabang) = ANY($${values.length})`);
        }
        
        const whereClause = `WHERE ${conditions.join(" AND ")}`;

        const result = await pool.query<DendaActionCandidateRow>(`
            WITH latest_opname AS (
                SELECT DISTINCT ON (ofn.id_toko)
                    ofn.id,
                    ofn.id_toko,
                    ofn.hari_denda,
                    ofn.nilai_denda,
                    ofn.tanggal_akhir_spk_denda,
                    ofn.tanggal_serah_terima_denda,
                    ofn.created_at
                FROM opname_final ofn
                ORDER BY ofn.id_toko, ofn.created_at DESC NULLS LAST, ofn.id DESC
            ),
            raw_candidates AS (
            SELECT
                ofn.id AS opname_final_id,
                t.id AS id_toko,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                ${branchGroupSql('t.cabang')} AS cabang,
                COALESCE(NULLIF(TRIM(spk.nama_kontraktor), ''), NULLIF(TRIM(t.nama_kontraktor), '')) AS nama_kontraktor,
                spk.nomor_spk,
                GREATEST(COALESCE(ofn.hari_denda, 0), COALESCE(delay.hari_terlambat, 0))::int AS hari_denda,
                GREATEST(COALESCE(ofn.nilai_denda, 0), COALESCE(delay.nilai_terlambat, 0))::text AS nilai_denda,
                COALESCE(ofn.tanggal_akhir_spk_denda, spk.effective_waktu_selesai) AS tanggal_akhir_spk_denda,
                ofn.tanggal_serah_terima_denda,
                COALESCE(sp_stats.active_sp_count, 0)::int AS active_sp_count,
                CASE
                    WHEN COALESCE(sp_stats.active_sp_count, 0) >= 3 THEN NULL
                    WHEN COALESCE(sp_stats.highest_active_sp_level, 0) >= 3 THEN NULL
                    ELSE (COALESCE(sp_stats.highest_active_sp_level, 0) + 1)::int
                END AS next_sp_level,
                COALESCE(sp_stats.pending_approval_count, 0) > 0 AS has_pending_approval,
                latest_action.action_type AS latest_action_type,
                latest_action.status AS latest_action_status,
                latest_action.created_at AS latest_action_created_at,
                latest_action.expires_at AS latest_action_expires_at,
                COALESCE(latest_action.expires_at < timezone('Asia/Jakarta', now()), false) AS latest_action_is_expired,
                ofn.created_at AS ofn_created_at,
                delay.hari_terlambat
            FROM toko t
            LEFT JOIN latest_opname ofn ON ofn.id_toko = t.id
            LEFT JOIN LATERAL (
                SELECT
                    ps.nomor_spk,
                    ps.nama_kontraktor,
                    COALESCE(extension.approved_until, ps.waktu_selesai::date) AS effective_waktu_selesai
                FROM pengajuan_spk ps
                LEFT JOIN LATERAL (
                    SELECT MAX(parsed_extension_date) AS approved_until
                    FROM (
                        SELECT
                            CASE
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan, '')) ~ '^\\d{4}-\\d{2}-\\d{2}'
                                    THEN LEFT(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan), 10)::date
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan, '')) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
                                    THEN to_date(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan), 'DD/MM/YYYY')
                                ELSE NULL::date
                            END AS parsed_extension_date
                        FROM pertambahan_spk pt
                        JOIN pengajuan_spk ps_source ON ps_source.id = pt.id_spk
                        JOIN toko t_source ON t_source.id = ps_source.id_toko
                        WHERE t_source.nomor_ulok = t.nomor_ulok
                          AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED_BY_BM', 'DISETUJUI BM', 'DISETUJUI', 'APPROVED')
                    ) parsed
                ) extension ON TRUE
                WHERE ps.id_toko = t.id
                  AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ORDER BY ps.created_at DESC NULLS LAST, ps.id DESC
                LIMIT 1
            ) spk ON TRUE
            LEFT JOIN LATERAL (
                WITH base AS (
                    SELECT
                        spk.effective_waktu_selesai AS end_date,
                        (timezone('Asia/Jakarta', now()))::date AS today
                ),
                free_day AS (
                    SELECT
                        CASE
                            WHEN end_date IS NULL THEN NULL::date
                            WHEN EXTRACT(ISODOW FROM end_date + 1) = 6 THEN end_date + 3
                            WHEN EXTRACT(ISODOW FROM end_date + 1) = 7 THEN end_date + 2
                            ELSE end_date + 1
                        END AS free_date,
                        today
                    FROM base
                ),
                counted AS (
                    SELECT COUNT(*)::int AS hari
                    FROM free_day,
                    LATERAL generate_series(free_date + 1, today, INTERVAL '1 day') AS day(value)
                    WHERE free_date IS NOT NULL
                      AND today > free_date
                      AND EXTRACT(ISODOW FROM day.value) BETWEEN 1 AND 5
                )
                SELECT
                    COALESCE(hari, 0)::int AS hari_terlambat,
                    LEAST(
                        (LEAST(COALESCE(hari, 0), 5) * 1000000)
                        + (GREATEST(0, LEAST(COALESCE(hari, 0) - 5, 5)) * 500000),
                        7500000
                    )::numeric AS nilai_terlambat
                FROM counted
            ) delay ON TRUE
            LEFT JOIN LATERAL (
                SELECT id
                FROM berkas_serah_terima bst
                WHERE bst.id_toko = t.id
                ORDER BY bst.created_at DESC NULLS LAST, bst.id DESC
                LIMIT 1
            ) st ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (
                        WHERE action_type = 'SP'
                          AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                          AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                    ) AS active_sp_count,
                    COUNT(*) FILTER (WHERE status = 'WAITING_MANAGER') AS pending_approval_count,
                    MAX(sp_level) FILTER (
                        WHERE action_type = 'SP'
                          AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                          AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                    ) AS highest_active_sp_level
                FROM denda_keterlambatan_action action
                WHERE LOWER(TRIM(COALESCE(action.nama_kontraktor, ''))) = LOWER(TRIM(COALESCE(spk.nama_kontraktor, t.nama_kontraktor, '')))
                  AND ${branchGroupSql('action.cabang')} = ${branchGroupSql('t.cabang')}
            ) sp_stats ON TRUE
            LEFT JOIN LATERAL (
                SELECT action_type, status, created_at, expires_at
                FROM denda_keterlambatan_action action
                WHERE LOWER(TRIM(COALESCE(action.nama_kontraktor, ''))) = LOWER(TRIM(COALESCE(spk.nama_kontraktor, t.nama_kontraktor, '')))
                  AND ${branchGroupSql('action.cabang')} = ${branchGroupSql('t.cabang')}
                ORDER BY action.created_at DESC, action.id DESC
                LIMIT 1
            ) latest_action ON TRUE
            ${whereClause}
            )
            SELECT
                MAX(opname_final_id) AS opname_final_id,
                MAX(id_toko) AS id_toko,
                nomor_ulok,
                STRING_AGG(DISTINCT lingkup_pekerjaan, ' + ' ORDER BY lingkup_pekerjaan DESC) AS lingkup_pekerjaan,
                MAX(nama_toko) AS nama_toko,
                MAX(kode_toko) AS kode_toko,
                MAX(cabang) AS cabang,
                MAX(nama_kontraktor) AS nama_kontraktor,
                MAX(nomor_spk) AS nomor_spk,
                MAX(hari_denda) AS hari_denda,
                MAX(nilai_denda) AS nilai_denda,
                MAX(tanggal_akhir_spk_denda) AS tanggal_akhir_spk_denda,
                MAX(tanggal_serah_terima_denda) AS tanggal_serah_terima_denda,
                MAX(active_sp_count) AS active_sp_count,
                MAX(next_sp_level) AS next_sp_level,
                BOOL_OR(has_pending_approval) AS has_pending_approval,
                MAX(latest_action_type) AS latest_action_type,
                MAX(latest_action_status) AS latest_action_status,
                MAX(latest_action_created_at) AS latest_action_created_at,
                MAX(latest_action_expires_at) AS latest_action_expires_at,
                BOOL_OR(latest_action_is_expired) AS latest_action_is_expired
            FROM raw_candidates
            GROUP BY nomor_ulok
            ORDER BY GREATEST(MAX(hari_denda), MAX(hari_terlambat)) DESC, MAX(ofn_created_at) DESC NULLS LAST, MAX(id_toko) DESC
        `, values);

        return result.rows;
    },

    async listActions(query: ListDendaActionsQuery): Promise<DendaActionRow[]> {
        const filters: string[] = [];
        const values: Array<string | number> = [];

        if (query.id_toko) {
            values.push(query.id_toko);
            filters.push(`id_toko = $${values.length}`);
        }

        if (query.id_opname_final) {
            values.push(query.id_opname_final);
            filters.push(`id_opname_final = $${values.length}`);
        }

        if (query.nomor_ulok) {
            values.push(query.nomor_ulok);
            filters.push(`UPPER(TRIM(COALESCE(nomor_ulok, ''))) = UPPER(TRIM($${values.length}::text))`);
        }

        if (query.action_type) {
            values.push(query.action_type);
            filters.push(`action_type = $${values.length}`);
        }

        if (query.cabang_array && query.cabang_array.length > 0) {
            const normalizedBranches = query.cabang_array.map(b => b.trim().toUpperCase());
            values.push(normalizedBranches as any);
            filters.push(`(${branchGroupSql('cabang')} = ANY($${values.length}) OR UPPER(cabang) = ANY($${values.length}))`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const result = await pool.query<DendaActionRow>(
            `
            SELECT dka.*, 
                   ${branchGroupSql('dka.cabang')} AS cabang,
                   (dka.expires_at IS NOT NULL AND dka.expires_at < timezone('Asia/Jakarta', now())) AS is_expired,
                   (
                       dka.action_type = 'SP'
                       AND dka.status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                       AND (dka.expires_at IS NULL OR dka.expires_at >= timezone('Asia/Jakarta', now()))
                   ) AS is_active
            FROM denda_keterlambatan_action dka
            ${whereClause.replace(/cabang/g, 'dka.cabang').replace(/nama_kontraktor/g, 'dka.nama_kontraktor').replace(/action_type/g, 'dka.action_type').replace(/status/g, 'dka.status')}
            ORDER BY dka.created_at DESC, dka.id DESC
            `,
            values
        );

        return result.rows;
    },

    async findActionById(id: number): Promise<DendaActionRow | null> {
        const result = await pool.query<DendaActionRow>(
            `
            SELECT ${ACTION_SELECT}
            FROM denda_keterlambatan_action
            WHERE id = $1
            LIMIT 1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async getActionHistory(entityId: number): Promise<any[]> {
        const result = await pool.query(
            `
            SELECT id, entity_type, entity_id, actor_email, actor_role, action, status_before, status_after, reason, metadata, created_at
            FROM activity_log
            WHERE entity_type = 'DENDA_ACTION' AND entity_id = $1
            ORDER BY created_at ASC, id ASC
            `,
            [entityId]
        );
        return result.rows;
    },

    async findTargetByOpnameFinalId(idOpnameFinal: number): Promise<DendaActionTargetRow | null> {
        const result = await pool.query<DendaActionTargetRow>(
            `
            SELECT
                ofn.id AS id_opname_final,
                ofn.id_toko,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                ${branchGroupSql('t.cabang')} AS cabang,
                t.nama_kontraktor,
                spk.nomor_spk,
                COALESCE(ofn.hari_denda, 0)::int AS hari_denda,
                COALESCE(ofn.nilai_denda, 0)::text AS nilai_denda
            FROM opname_final ofn
            JOIN toko t ON t.id = ofn.id_toko
            LEFT JOIN LATERAL (
                SELECT nomor_spk
                FROM pengajuan_spk ps
                WHERE ps.id_toko = ofn.id_toko
                  AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ORDER BY ps.created_at DESC NULLS LAST, ps.id DESC
                LIMIT 1
            ) spk ON TRUE
            WHERE ofn.id = $1
            LIMIT 1
            `,
            [idOpnameFinal]
        );

        return result.rows[0] ?? null;
    },

    async findTargetByTokoId(idToko: number): Promise<DendaActionTargetRow | null> {
        const result = await pool.query<DendaActionTargetRow>(
            `
            SELECT
                ofn.id AS id_opname_final,
                t.id AS id_toko,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.nama_toko,
                t.kode_toko,
                ${branchGroupSql('t.cabang')} AS cabang,
                COALESCE(NULLIF(TRIM(spk.nama_kontraktor), ''), NULLIF(TRIM(t.nama_kontraktor), '')) AS nama_kontraktor,
                spk.nomor_spk,
                GREATEST(COALESCE(ofn.hari_denda, 0), COALESCE(delay.hari_terlambat, 0))::int AS hari_denda,
                GREATEST(COALESCE(ofn.nilai_denda, 0), COALESCE(delay.nilai_terlambat, 0))::text AS nilai_denda
            FROM toko t
            LEFT JOIN LATERAL (
                SELECT id, hari_denda, nilai_denda
                FROM opname_final latest
                WHERE latest.id_toko = t.id
                ORDER BY latest.created_at DESC NULLS LAST, latest.id DESC
                LIMIT 1
            ) ofn ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    ps.nomor_spk,
                    ps.nama_kontraktor,
                    COALESCE(extension.approved_until, ps.waktu_selesai::date) AS effective_waktu_selesai
                FROM pengajuan_spk ps
                LEFT JOIN LATERAL (
                    SELECT MAX(parsed_extension_date) AS approved_until
                    FROM (
                        SELECT
                            CASE
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan, '')) ~ '^\\d{4}-\\d{2}-\\d{2}'
                                    THEN LEFT(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan), 10)::date
                                WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan, '')) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
                                    THEN to_date(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan), 'DD/MM/YYYY')
                                ELSE NULL::date
                            END AS parsed_extension_date
                        FROM pertambahan_spk pt
                        JOIN pengajuan_spk ps_source ON ps_source.id = pt.id_spk
                        JOIN toko t_source ON t_source.id = ps_source.id_toko
                        WHERE t_source.nomor_ulok = t.nomor_ulok
                          AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED_BY_BM', 'DISETUJUI BM', 'DISETUJUI', 'APPROVED')
                    ) parsed
                ) extension ON TRUE
                WHERE ps.id_toko = t.id
                  AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ORDER BY ps.created_at DESC NULLS LAST, ps.id DESC
                LIMIT 1
            ) spk ON TRUE
            LEFT JOIN LATERAL (
                WITH base AS (
                    SELECT
                        spk.effective_waktu_selesai AS end_date,
                        (timezone('Asia/Jakarta', now()))::date AS today
                ),
                free_day AS (
                    SELECT
                        CASE
                            WHEN end_date IS NULL THEN NULL::date
                            WHEN EXTRACT(ISODOW FROM end_date + 1) = 6 THEN end_date + 3
                            WHEN EXTRACT(ISODOW FROM end_date + 1) = 7 THEN end_date + 2
                            ELSE end_date + 1
                        END AS free_date,
                        today
                    FROM base
                ),
                counted AS (
                    SELECT COUNT(*)::int AS hari
                    FROM free_day,
                    LATERAL generate_series(free_date + 1, today, INTERVAL '1 day') AS day(value)
                    WHERE free_date IS NOT NULL
                      AND today > free_date
                      AND EXTRACT(ISODOW FROM day.value) BETWEEN 1 AND 5
                )
                SELECT
                    COALESCE(hari, 0)::int AS hari_terlambat,
                    LEAST(
                        (LEAST(COALESCE(hari, 0), 5) * 1000000)
                        + (GREATEST(0, LEAST(COALESCE(hari, 0) - 5, 5)) * 500000),
                        7500000
                    )::numeric AS nilai_terlambat
                FROM counted
            ) delay ON TRUE
            LEFT JOIN LATERAL (
                SELECT id
                FROM berkas_serah_terima bst
                WHERE bst.id_toko = t.id
                ORDER BY bst.created_at DESC NULLS LAST, bst.id DESC
                LIMIT 1
            ) st ON TRUE
            WHERE t.id = $1
              AND st.id IS NULL
              AND spk.nomor_spk IS NOT NULL
              AND NULLIF(TRIM(COALESCE(spk.nama_kontraktor, t.nama_kontraktor, '')), '') IS NOT NULL
            LIMIT 1
            `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async getActionStatsByOpnameFinalId(idOpnameFinal: number): Promise<{
        active_sp_count: number;
        pending_approval_count: number;
        highest_active_sp_level: number;
    }> {
        const result = await pool.query<{ active_sp_count: string; pending_approval_count: string; highest_active_sp_level: string }>(
            `
            SELECT
                COUNT(*) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS active_sp_count,
                COUNT(*) FILTER (WHERE status = 'WAITING_MANAGER') AS pending_approval_count,
                MAX(sp_level) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS highest_active_sp_level
            FROM denda_keterlambatan_action
            WHERE id_opname_final = $1
            `,
            [idOpnameFinal]
        );

        return {
            active_sp_count: Number(result.rows[0]?.active_sp_count ?? 0),
            pending_approval_count: Number(result.rows[0]?.pending_approval_count ?? 0),
            highest_active_sp_level: Number(result.rows[0]?.highest_active_sp_level ?? 0),
        };
    },

    async getActionStatsByTokoId(idToko: number): Promise<{
        active_sp_count: number;
        pending_approval_count: number;
        highest_active_sp_level: number;
    }> {
        const result = await pool.query<{ active_sp_count: string; pending_approval_count: string; highest_active_sp_level: string }>(
            `
            SELECT
                COUNT(*) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS active_sp_count,
                COUNT(*) FILTER (WHERE status = 'WAITING_MANAGER') AS pending_approval_count,
                MAX(sp_level) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS highest_active_sp_level
            FROM denda_keterlambatan_action
            WHERE id_toko = $1
            `,
            [idToko]
        );

        return {
            active_sp_count: Number(result.rows[0]?.active_sp_count ?? 0),
            pending_approval_count: Number(result.rows[0]?.pending_approval_count ?? 0),
            highest_active_sp_level: Number(result.rows[0]?.highest_active_sp_level ?? 0),
        };
    },

    async getActionStatsByKontraktor(namaKontraktor: string, cabang_array?: string[]): Promise<{
        active_sp_count: number;
        pending_approval_count: number;
        highest_active_sp_level: number;
    }> {
        let cabangFilter = "";
        const queryArgs: any[] = [namaKontraktor];

        if (cabang_array && cabang_array.length > 0) {
            const normalizedBranches = cabang_array.map(b => b.trim().toUpperCase());
            queryArgs.push(normalizedBranches);
            cabangFilter = `AND UPPER(cabang) = ANY($2)`;
        }

        const result = await pool.query<{ active_sp_count: string; pending_approval_count: string; highest_active_sp_level: string }>(
            `
            SELECT
                COUNT(*) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS active_sp_count,
                COUNT(*) FILTER (WHERE status = 'WAITING_MANAGER') AS pending_approval_count,
                MAX(sp_level) FILTER (
                    WHERE action_type = 'SP'
                      AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                      AND (expires_at IS NULL OR expires_at >= timezone('Asia/Jakarta', now()))
                ) AS highest_active_sp_level
            FROM denda_keterlambatan_action
            WHERE LOWER(TRIM(COALESCE(nama_kontraktor, ''))) = LOWER(TRIM($1))
            ${cabangFilter}
            `,
            queryArgs
        );

        return {
            active_sp_count: Number(result.rows[0]?.active_sp_count ?? 0),
            pending_approval_count: Number(result.rows[0]?.pending_approval_count ?? 0),
            highest_active_sp_level: Number(result.rows[0]?.highest_active_sp_level ?? 0),
        };
    },

    async getNextMonthlySpSequence(referenceDate = new Date()): Promise<number> {
        const monthStart = new Date(referenceDate);
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const nextMonthStart = new Date(monthStart);
        nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

        const result = await pool.query<{ count: string }>(
            `
            SELECT COUNT(*) AS count
            FROM denda_keterlambatan_action
            WHERE action_type = 'SP'
              AND nomor_surat IS NOT NULL
              AND COALESCE(manager_approved_at, created_at) >= $1
              AND COALESCE(manager_approved_at, created_at) < $2
            `,
            [monthStart, nextMonthStart]
        );

        return Number(result.rows[0]?.count ?? 0) + 1;
    },

    async createAction(input: {
        target?: DendaActionTargetRow;
        id_toko?: number;
        nama_kontraktor?: string;
        action_type: DendaActionType;
        sp_level?: number | null;
        alasan_sp?: SpReason | null;
        alasan_lainnya?: string | null;
        catatan: string;
        instruksi_tindak_lanjut?: string | null;
        deadline_tindak_lanjut?: string | null;
        lampiran_1_url?: string | null;
        lampiran_2_url?: string | null;
        actor_email?: string | null;
        actor_name?: string | null;
        actor_role?: string | null;
        cabang?: string | null;
    }): Promise<DendaActionRow> {
        let actionId: number | null = null;
        let isResubmit = false;

        const nomor_ulok = input.target?.nomor_ulok ?? null;
        
        if (nomor_ulok) {
            const existingRes = await pool.query<{ id: string }>(
                `
                SELECT id 
                FROM denda_keterlambatan_action
                WHERE nomor_ulok = $1
                  AND action_type = $2
                  AND sp_level IS NOT DISTINCT FROM $3
                  AND status IN ('REJECTED_BY_MANAGER', 'EXPIRED')
                LIMIT 1
                `,
                [nomor_ulok, input.action_type, input.sp_level ?? null]
            );

            if (existingRes.rowCount && existingRes.rowCount > 0) {
                isResubmit = true;
                actionId = Number(existingRes.rows[0].id);
                
                await pool.query(
                    `
                    UPDATE denda_keterlambatan_action
                    SET status = 'WAITING_MANAGER',
                        id_toko = COALESCE($2, id_toko),
                        nama_kontraktor = COALESCE($3, nama_kontraktor),
                        alasan_sp = $4,
                        alasan_lainnya = $5,
                        catatan = $6,
                        lampiran_1_url = $7,
                        lampiran_2_url = $8,
                        submitted_by_email = $9,
                        submitted_by_name = $10,
                        submitted_by_role = $11,
                        submitted_at = timezone('Asia/Jakarta', now()),
                        updated_at = timezone('Asia/Jakarta', now()),
                        actor_email = $9,
                        actor_role = $11,
                        manager_rejected_by = NULL,
                        manager_rejected_role = NULL,
                        manager_rejected_at = NULL,
                        manager_rejected_reason = NULL,
                        manager_approved_by = NULL,
                        manager_approved_role = NULL,
                        manager_approved_at = NULL
                    WHERE id = $1
                    `,
                    [
                        actionId,
                        input.id_toko ?? input.target?.id_toko ?? null,
                        input.nama_kontraktor ?? input.target?.nama_kontraktor ?? null,
                        input.alasan_sp ?? null,
                        input.alasan_lainnya ?? null,
                        input.catatan,
                        input.lampiran_1_url ?? null,
                        input.lampiran_2_url ?? null,
                        input.actor_email ?? null,
                        input.actor_name ?? null,
                        input.actor_role ?? null
                    ]
                );
            }
        }

        if (!isResubmit) {
            const result = await pool.query<{ id: string }>(
                `
                INSERT INTO denda_keterlambatan_action (
                    id_toko,
                    id_opname_final,
                    nomor_ulok,
                    lingkup_pekerjaan,
                    nama_toko,
                    kode_toko,
                    cabang,
                    nama_kontraktor,
                    nomor_spk,
                    action_type,
                    status,
                    sp_level,
                    hari_denda,
                    nilai_denda,
                    alasan_sp,
                    alasan_lainnya,
                    catatan,
                    instruksi_tindak_lanjut,
                    deadline_tindak_lanjut,
                    lampiran_1_url,
                    lampiran_2_url,
                    submitted_by_email,
                    submitted_by_name,
                    submitted_by_role,
                    submitted_at,
                    actor_email,
                    actor_role
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'WAITING_MANAGER', $11, $12, $13, $14, $15, $16, $17, $18::date, $19, $20, $21, $22, $23, timezone('Asia/Jakarta', now()), $21, $23
                )
                RETURNING id
                `,
                [
                    input.id_toko ?? input.target?.id_toko ?? null,
                    input.target?.id_opname_final ?? null,
                    input.target?.nomor_ulok ?? null,
                    input.target?.lingkup_pekerjaan ?? null,
                    input.target?.nama_toko ?? null,
                    input.target?.kode_toko ?? null,
                    input.target?.cabang ?? input.cabang ?? null,
                    input.nama_kontraktor ?? input.target?.nama_kontraktor ?? null,
                    input.target?.nomor_spk ?? null,
                    input.action_type,
                    input.sp_level ?? null,
                    input.target?.hari_denda ?? 0,
                    input.target?.nilai_denda ?? '0',
                    input.alasan_sp ?? null,
                    input.alasan_lainnya ?? null,
                    input.catatan,
                    input.instruksi_tindak_lanjut ?? null,
                    input.deadline_tindak_lanjut ?? null,
                    input.lampiran_1_url ?? null,
                    input.lampiran_2_url ?? null,
                    input.actor_email ?? null,
                    input.actor_name ?? null,
                    input.actor_role ?? null,
                ]
            );
            actionId = Number(result.rows[0].id);
        }

        await pool.query(
            `
            INSERT INTO activity_log (entity_type, entity_id, actor_email, actor_role, action, status_before, status_after, created_at)
            VALUES ('DENDA_ACTION', $1, $2, $3, $4, $5, 'WAITING_MANAGER', timezone('Asia/Jakarta', now()))
            `,
            [
                actionId!,
                input.actor_email ?? null,
                input.actor_role ?? null,
                isResubmit ? 'RESUBMIT' : 'CREATE',
                isResubmit ? 'REJECTED_BY_MANAGER' : null
            ]
        );

        const created = await this.findActionById(actionId!);
        if (!created) throw new Error("Denda action was created but could not be loaded.");
        return created;
    },

    async approveAction(input: {
        id: number;
        actor_email?: string | null;
        actor_role?: string | null;
        nomor_surat?: string | null;
        link_pdf?: string | null;
    }): Promise<DendaActionRow> {
        const result = await pool.query<{ id: string }>(
            `
            UPDATE denda_keterlambatan_action
            SET status = CASE
                    WHEN action_type = 'SP' THEN 'SENT_TO_CONTRACTOR'
                    ELSE 'APPROVED'
                END,
                manager_approved_by = $2,
                manager_approved_role = $3,
                manager_approved_at = timezone('Asia/Jakarta', now()),
                sent_to_contractor_at = CASE
                    WHEN action_type = 'SP' THEN timezone('Asia/Jakarta', now())
                    ELSE sent_to_contractor_at
                END,
                expires_at = CASE
                    WHEN action_type = 'SP' THEN timezone('Asia/Jakarta', now()) + INTERVAL '6 months'
                    ELSE expires_at
                END,
                nomor_surat = COALESCE($4, nomor_surat),
                link_pdf = COALESCE($5, link_pdf),
                updated_at = timezone('Asia/Jakarta', now())
            WHERE id = $1
              AND status = 'WAITING_MANAGER'
            RETURNING id
            `,
            [input.id, input.actor_email ?? null, input.actor_role ?? null, input.nomor_surat ?? null, input.link_pdf ?? null]
        );

        if (result.rowCount === 0) return null as never;
        const updated = await this.findActionById(Number(result.rows[0].id));
        if (!updated) throw new Error("Denda action was approved but could not be loaded.");

        await pool.query(
            `
            INSERT INTO activity_log (entity_type, entity_id, actor_email, actor_role, action, status_before, status_after, created_at)
            VALUES ('DENDA_ACTION', $1, $2, $3, 'APPROVE', 'WAITING_MANAGER', $4, timezone('Asia/Jakarta', now()))
            `,
            [input.id, input.actor_email ?? null, input.actor_role ?? null, updated.status]
        );

        return updated;
    },

    /**
     * Update link_pdf (dan opsional nomor_surat) tanpa peduli status.
     * Digunakan untuk regenerate PDF pada SP yang sudah diapprove.
     */
    async updatePdfLink(input: {
        id: number;
        link_pdf: string;
        nomor_surat?: string | null;
    }): Promise<DendaActionRow> {
        const result = await pool.query<{ id: string }>(
            `
            UPDATE denda_keterlambatan_action
            SET link_pdf = $2,
                nomor_surat = COALESCE($3, nomor_surat),
                updated_at = timezone('Asia/Jakarta', now())
            WHERE id = $1
            RETURNING id
            `,
            [input.id, input.link_pdf, input.nomor_surat ?? null]
        );

        if (result.rowCount === 0) throw new Error("SP tidak ditemukan saat update link_pdf.");
        const updated = await this.findActionById(Number(result.rows[0].id));
        if (!updated) throw new Error("SP ditemukan tapi gagal di-load setelah update link_pdf.");
        return updated;
    },

    async rejectAction(input: {
        id: number;
        reason: string;
        actor_email?: string | null;
        actor_role?: string | null;
    }): Promise<DendaActionRow> {
        const result = await pool.query<{ id: string }>(
            `
            UPDATE denda_keterlambatan_action
            SET status = 'REJECTED_BY_MANAGER',
                manager_rejected_by = $2,
                manager_rejected_role = $3,
                manager_rejected_at = timezone('Asia/Jakarta', now()),
                manager_rejected_reason = $4,
                updated_at = timezone('Asia/Jakarta', now())
            WHERE id = $1
              AND status = 'WAITING_MANAGER'
            RETURNING id
            `,
            [input.id, input.actor_email ?? null, input.actor_role ?? null, input.reason]
        );

        if (result.rowCount === 0) return null as never;
        const updated = await this.findActionById(Number(result.rows[0].id));
        if (!updated) throw new Error("Denda action was rejected but could not be loaded.");

        await pool.query(
            `
            INSERT INTO activity_log (entity_type, entity_id, actor_email, actor_role, action, status_before, status_after, reason, created_at)
            VALUES ('DENDA_ACTION', $1, $2, $3, 'REJECT', 'WAITING_MANAGER', 'REJECTED_BY_MANAGER', $4, timezone('Asia/Jakarta', now()))
            `,
            [input.id, input.actor_email ?? null, input.actor_role ?? null, input.reason]
        );

        return updated;
    },

    async listKontraktor(user?: AuthenticatedUser): Promise<string[]> {
        try {
            // Get contractors from projects (pengajuan_spk + toko)
            let branchFilter = "";
            let values: any[] = [];

            if (user) {
                const scope = await getEffectiveBranchesForUser({
                    emailSat: user.email_sat,
                    cabang: user.cabang,
                    roles: user.roles
                });
                if (scope.source !== "global") {
                    const branches = scope.branches;
                    if (branches.length === 0) {
                        return [];
                    }
                    const placeholders = branches.map((_, i) => `$${i + 1}`).join(", ");
                    branchFilter = `AND UPPER(TRIM(COALESCE(t.cabang, ''))) IN (${placeholders})`;
                    values = branches;
                }
            }

            const projectResult = await pool.query<{ nama_kontraktor: string }>(`
                SELECT DISTINCT nama_kontraktor
                FROM (
                    -- From pengajuan_spk
                    SELECT TRIM(ps.nama_kontraktor) AS nama_kontraktor 
                    FROM pengajuan_spk ps 
                    LEFT JOIN toko t ON t.id = ps.id_toko
                    WHERE NULLIF(TRIM(ps.nama_kontraktor), '') IS NOT NULL ${branchFilter}
                    
                    UNION
                    
                    -- From toko
                    SELECT TRIM(t.nama_kontraktor) AS nama_kontraktor 
                    FROM toko t 
                    WHERE NULLIF(TRIM(t.nama_kontraktor), '') IS NOT NULL ${branchFilter}
                ) AS combined
                WHERE UPPER(TRIM(nama_kontraktor)) <> 'HEAD OFFICE'
                ORDER BY nama_kontraktor ASC
            `, values);

            const fromProjects = projectResult.rows.map(row => row.nama_kontraktor);

            // Get contractors from user_cabang (registered users)
            const fromUsers = await this.listKontraktorFromUserCabang(user);

            // Merge and deduplicate
            const allKontraktor = Array.from(new Set([...fromProjects, ...fromUsers])).sort();

            return allKontraktor;
        } catch (error) {
            console.error('[listKontraktor] Error:', error);
            // Fallback to project-only list on error
            let branchFilter = "";
            let values: any[] = [];

            if (user) {
                const scope = await getEffectiveBranchesForUser({
                    emailSat: user.email_sat,
                    cabang: user.cabang,
                    roles: user.roles
                });
                if (scope.source !== "global") {
                    const branches = scope.branches;
                    if (branches.length === 0) {
                        return [];
                    }
                    const placeholders = branches.map((_, i) => `$${i + 1}`).join(", ");
                    branchFilter = `AND UPPER(TRIM(COALESCE(t.cabang, ''))) IN (${placeholders})`;
                    values = branches;
                }
            }

            const result = await pool.query<{ nama_kontraktor: string }>(`
                SELECT DISTINCT nama_kontraktor
                FROM (
                    SELECT TRIM(ps.nama_kontraktor) AS nama_kontraktor 
                    FROM pengajuan_spk ps 
                    LEFT JOIN toko t ON t.id = ps.id_toko
                    WHERE NULLIF(TRIM(ps.nama_kontraktor), '') IS NOT NULL ${branchFilter}
                    
                    UNION
                    
                    SELECT TRIM(t.nama_kontraktor) AS nama_kontraktor 
                    FROM toko t 
                    WHERE NULLIF(TRIM(t.nama_kontraktor), '') IS NOT NULL ${branchFilter}
                ) AS combined
                WHERE UPPER(TRIM(nama_kontraktor)) <> 'HEAD OFFICE'
                ORDER BY nama_kontraktor ASC
            `, values);
            
            return result.rows.map(row => row.nama_kontraktor);
        }
    },

    // NEW: Test method to check if user_cabang query works
    async listKontraktorFromUserCabang(user?: AuthenticatedUser): Promise<string[]> {
        try {
            let values: any[] = [];
            // FIX: Use jabatan (not role) to identify kontraktor, and nama_pt for company name
            let whereClause = "WHERE UPPER(TRIM(uc.jabatan)) = 'KONTRAKTOR' AND NULLIF(TRIM(uc.nama_pt), '') IS NOT NULL";

            if (user) {
                const scope = await getEffectiveBranchesForUser({
                    emailSat: user.email_sat,
                    cabang: user.cabang,
                    roles: user.roles
                });
                if (scope.source !== "global") {
                    const branches = scope.branches;
                    if (branches.length === 0) {
                        return [];
                    }
                    const placeholders = branches.map((_, i) => `$${i + 1}`).join(", ");
                    whereClause += ` AND UPPER(TRIM(COALESCE(uc.cabang, ''))) IN (${placeholders})`;
                    values = branches;
                }
            }

            const result = await pool.query<{ nama_kontraktor: string }>(
                `SELECT DISTINCT TRIM(uc.nama_pt) AS nama_kontraktor
                 FROM user_cabang uc
                 ${whereClause}
                 ORDER BY nama_kontraktor ASC`,
                values
            );
            
            return result.rows
                .map(row => row.nama_kontraktor)
                .filter(name => name && name.toUpperCase() !== 'HEAD OFFICE');
        } catch (error) {
            console.error('[listKontraktorFromUserCabang] Error:', error);
            return []; // Return empty array on error, don't break the whole app
        }
    },

    // ===================================================================
    // KONTRAKTOR ACKNOWLEDGEMENT METHODS
    // ===================================================================

    async listKontraktorActions(namaKontraktor: string): Promise<DendaActionRow[]> {
        await this.ensureSchema();
        const result = await pool.query<DendaActionRow>(
            `SELECT ${ACTION_SELECT}
             FROM denda_keterlambatan_action
             WHERE action_type = 'SP'
               AND ${contractorMatchSql("$1")}
               AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
             ORDER BY created_at DESC`,
            [namaKontraktor]
        );
        return result.rows;
    },

    async findActionByIdAndKontraktor(id: number, namaKontraktor: string): Promise<DendaActionRow | null> {
        await this.ensureSchema();
        const result = await pool.query<DendaActionRow>(
            `SELECT ${ACTION_SELECT}
             FROM denda_keterlambatan_action
             WHERE id = $1 
               AND action_type = 'SP'
               AND ${contractorMatchSql("$2")}`,
            [id, namaKontraktor]
        );
        return result.rows[0] ?? null;
    },

    async markAsViewedByKontraktor(id: number, namaKontraktor: string): Promise<DendaActionRow | null> {
        const result = await pool.query<{ id: string }>(
            `UPDATE denda_keterlambatan_action
             SET status = CASE 
                   WHEN status = 'SENT_TO_CONTRACTOR' THEN 'VIEWED_BY_CONTRACTOR'
                   ELSE status
                 END,
                 viewed_by_contractor_at = COALESCE(viewed_by_contractor_at, timezone('Asia/Jakarta', now())),
                 updated_at = timezone('Asia/Jakarta', now())
             WHERE id = $1 
               AND action_type = 'SP'
               AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR')
               AND ${contractorMatchSql("$2")}
             RETURNING id`,
            [id, namaKontraktor]
        );
        if (result.rowCount === 0) return null;
        return this.findActionById(Number(result.rows[0].id));
    },

    async acknowledgeAction(input: {
        id: number;
        namaKontraktor: string;
        catatanAcknowledge?: string | null;
        actor_email: string | null;
        actor_role: string | null;
    }): Promise<DendaActionRow | null> {
        const result = await pool.query<{ id: string }>(
            `UPDATE denda_keterlambatan_action
             SET status = 'ACKNOWLEDGED_BY_CONTRACTOR',
                 acknowledged_by_contractor_at = timezone('Asia/Jakarta', now()),
                 acknowledged_by_email = $2,
                 acknowledged_by_role = $3,
                 catatan_acknowledge = $4,
                 updated_at = timezone('Asia/Jakarta', now())
             WHERE id = $1 
               AND ${contractorMatchSql("$5")}
               AND action_type = 'SP'
               AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR')
             RETURNING id`,
            [input.id, input.actor_email, input.actor_role, input.catatanAcknowledge, input.namaKontraktor]
        );
        if (result.rowCount === 0) return null;
        return this.findActionById(Number(result.rows[0].id));
    },

    async getKontraktorStats(namaKontraktor: string): Promise<{
        total_sp: number;
        active_sp: number;
        acknowledged_sp: number;
        pending_acknowledge: number;
    }> {
        await this.ensureSchema();
        const result = await pool.query<{
            total_sp: string;
            active_sp: string;
            acknowledged_sp: string;
            pending_acknowledge: string;
        }>(
            `SELECT 
               COUNT(*) FILTER (WHERE action_type = 'SP') AS total_sp,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR') AND (expires_at IS NULL OR expires_at > timezone('Asia/Jakarta', now()))) AS active_sp,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status = 'ACKNOWLEDGED_BY_CONTRACTOR') AS acknowledged_sp,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR') AND (expires_at IS NULL OR expires_at > timezone('Asia/Jakarta', now()))) AS pending_acknowledge
             FROM denda_keterlambatan_action
             WHERE ${contractorMatchSql("$1")}`,
            [namaKontraktor]
        );
        return {
            total_sp: parseInt(result.rows[0]?.total_sp ?? '0', 10),
            active_sp: parseInt(result.rows[0]?.active_sp ?? '0', 10),
            acknowledged_sp: parseInt(result.rows[0]?.acknowledged_sp ?? '0', 10),
            pending_acknowledge: parseInt(result.rows[0]?.pending_acknowledge ?? '0', 10),
        };
    },

    // ===================================================================
    // CRON & EXPIRY MANAGEMENT
    // ===================================================================

    async getActiveSpWithExpiry(): Promise<Array<{
        id: number;
        nomor_surat: string | null;
        nama_kontraktor: string | null;
        cabang: string | null;
        nomor_ulok: string | null;
        sp_level: number | null;
        expires_at: string | null;
        status: string;
        manager_approved_at: string | null;
        acknowledged_by_contractor_at: string | null;
    }>> {
        await this.ensureSchema();
        const result = await pool.query<any>(
            `SELECT 
               id, nomor_surat, nama_kontraktor, cabang, nomor_ulok, sp_level,
               expires_at, status, manager_approved_at, acknowledged_by_contractor_at
             FROM denda_keterlambatan_action
             WHERE action_type = 'SP'
               AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
               AND expires_at IS NOT NULL
               AND expires_at > timezone('Asia/Jakarta', now())
             ORDER BY expires_at ASC`
        );
        return result.rows;
    },

    async markExpiredSp(): Promise<number> {
        await this.ensureSchema();
        const result = await pool.query(
            `UPDATE denda_keterlambatan_action
             SET status = 'EXPIRED',
                 updated_at = timezone('Asia/Jakarta', now())
             WHERE action_type = 'SP'
               AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
               AND expires_at IS NOT NULL
               AND expires_at < timezone('Asia/Jakarta', now())
             RETURNING id`
        );
        return result.rowCount || 0;
    },

    async getGlobalStats(): Promise<{
        total_sp: number;
        active_sp: number;
        expiring_soon: number;
        pending_acknowledge: number;
    }> {
        await this.ensureSchema();
        const result = await pool.query<{
            total_sp: string;
            active_sp: string;
            expiring_soon: string;
            pending_acknowledge: string;
        }>(
            `SELECT 
               COUNT(*) FILTER (WHERE action_type = 'SP') AS total_sp,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR') AND (expires_at IS NULL OR expires_at > timezone('Asia/Jakarta', now()))) AS active_sp,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR') AND expires_at IS NOT NULL AND expires_at > timezone('Asia/Jakarta', now()) AND expires_at < timezone('Asia/Jakarta', now()) + INTERVAL '30 days') AS expiring_soon,
               COUNT(*) FILTER (WHERE action_type = 'SP' AND status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR') AND (expires_at IS NULL OR expires_at > timezone('Asia/Jakarta', now()))) AS pending_acknowledge
             FROM denda_keterlambatan_action`
        );
        return {
            total_sp: parseInt(result.rows[0]?.total_sp ?? '0', 10),
            active_sp: parseInt(result.rows[0]?.active_sp ?? '0', 10),
            expiring_soon: parseInt(result.rows[0]?.expiring_soon ?? '0', 10),
            pending_acknowledge: parseInt(result.rows[0]?.pending_acknowledge ?? '0', 10),
        };
    },
};





