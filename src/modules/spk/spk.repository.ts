import { pool, withTransaction } from "../../db/pool";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { ACTIVE_SPK_STATUSES, SPK_APPROVED_STATUSES, type SpkStatus } from "./spk.constants";
import type { SpkApprovalInput, SpkInterventionInput } from "./spk.schema";
import { calculateEffectiveStDate, toIsoDateString } from "../../common/national-holidays";

export type PengajuanSpkRow = {
    id: string;
    id_toko: number;
    nomor_ulok: string;
    email_pembuat: string;
    lingkup_pekerjaan: string;
    nama_kontraktor: string;
    proyek: string;
    waktu_mulai: string;
    durasi: number;
    waktu_selesai: string;
    grand_total: number;
    terbilang: string;
    nomor_spk: string;
    par: string;
    spk_manual_1: string;
    spk_manual_2: string;
    status: SpkStatus;
    link_pdf: string | null;
    approver_email: string | null;
    waktu_persetujuan: string | null;
    alasan_penolakan: string | null;
    created_at: string;
};

export type SpkTokoSummary = {
    id: number | null;
    nomor_ulok: string;
    kode_toko: string | null;
    nama_toko: string | null;
    cabang: string | null;
    alamat: string | null;
};

export type SpkListRow = PengajuanSpkRow & {
    toko: SpkTokoSummary;
    effective_waktu_selesai: string | null;
    effective_durasi: number | null;
    pertambahan_spk_approved_until: string | null;
    st_target_date: string | null;
    st_offset_days: number;
    st_offset_label: string | null;
    st_offset_explanation: string | null;
    st_skipped_weekends: number;
    st_skipped_holidays: number;
};

export type SpkApprovalLogRow = {
    id: string;
    pengajuan_spk_id: string;
    approver_email: string;
    tindakan: string;
    alasan_penolakan: string | null;
    catatan_approval: string | null;
    waktu_tindakan: string;
};

export type SpkApprovedRabTotalsRow = {
    id: number;
    grand_total: string | null;
    grand_total_non_sbo: string | null;
    grand_total_final: string | null;
};

type SpkListJoinRow = PengajuanSpkRow & {
    effective_waktu_selesai: string | null;
    effective_durasi: number | null;
    pertambahan_spk_approved_until: string | null;
    toko_id: number | null;
    toko_nomor_ulok: string;
    toko_kode_toko: string | null;
    toko_nama_toko: string | null;
    toko_cabang: string | null;
    toko_alamat: string | null;
};

const parseDateOnly = (value?: string | null): Date | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = raw.includes("/")
        ? (() => {
            const [dd, mm, yyyy] = raw.split("/");
            return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        })()
        : new Date(raw.split("T")[0] + "T00:00:00");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildStTargetInfo = (effectiveEnd?: string | null) => {
    const endDate = parseDateOnly(effectiveEnd);
    if (!endDate) {
        return {
            st_target_date: null,
            st_offset_days: 0,
            st_offset_label: null,
            st_offset_explanation: null,
            st_skipped_weekends: 0,
            st_skipped_holidays: 0
        };
    }

    const target = calculateEffectiveStDate(endDate);
    return {
        st_target_date: toIsoDateString(target.effectiveStDate),
        st_offset_days: target.offsetDays,
        st_offset_label: target.label,
        st_offset_explanation: target.explanation,
        st_skipped_weekends: target.skippedWeekends,
        st_skipped_holidays: target.skippedHolidays
    };
};

const SPK_COLUMNS = `
    id, id_toko, nomor_ulok, email_pembuat, lingkup_pekerjaan, nama_kontraktor, proyek,
  waktu_mulai, durasi, waktu_selesai, grand_total, terbilang, nomor_spk,
  par, spk_manual_1, spk_manual_2, status, link_pdf, approver_email,
  waktu_persetujuan, alasan_penolakan, created_at
`;

export const spkRepository = {
    async findLatestByTokoId(idToko: number): Promise<PengajuanSpkRow | null> {
        const result = await pool.query<PengajuanSpkRow>(
            `
      SELECT ${SPK_COLUMNS}
      FROM pengajuan_spk
      WHERE id_toko = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async existsActiveByUlokAndLingkup(nomorUlok: string, lingkupPekerjaan: string): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `
      SELECT EXISTS(
        SELECT 1
        FROM pengajuan_spk
        WHERE nomor_ulok = $1
          AND lingkup_pekerjaan = $2
          AND status = ANY($3::text[])
      )
      `,
            [nomorUlok, lingkupPekerjaan, ACTIVE_SPK_STATUSES]
        );

        return result.rows[0]?.exists ?? false;
    },

    // Cek apakah ada SPK yang benar-benar Approved (bukan sekedar aktif/pending)
    // Digunakan untuk memblokir Gantt/Pengawasan jika SPK belum benar-benar disetujui
    async existsApprovedByUlokAndLingkup(nomorUlok: string, lingkupPekerjaan: string): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `
      SELECT EXISTS(
        SELECT 1
        FROM pengajuan_spk
        WHERE UPPER(nomor_ulok) = UPPER($1)
          AND UPPER(lingkup_pekerjaan) = UPPER($2)
          AND status = ANY($3::text[])
      )
      `,
            [nomorUlok, lingkupPekerjaan, SPK_APPROVED_STATUSES]
        );

        return result.rows[0]?.exists ?? false;
    },

    async findApprovedRabTotalsByTokoId(idToko: number): Promise<SpkApprovedRabTotalsRow | null> {
        const result = await pool.query<SpkApprovedRabTotalsRow>(
            `
      SELECT id, grand_total, grand_total_non_sbo, grand_total_final
      FROM rab
      WHERE id_toko = $1
        AND status = 'Disetujui'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
            [idToko]
        );

        return result.rows[0] ?? null;
    },

    async getNextSequence(cabang: string, year: number, month: number): Promise<number> {
        const result = await pool.query<{ count: string }>(
            `
      SELECT COUNT(*)::text AS count
      FROM pengajuan_spk p
    JOIN toko t ON t.id = p.id_toko
      WHERE UPPER(t.cabang) = UPPER($1)
        AND EXTRACT(YEAR FROM p.created_at) = $2
        AND EXTRACT(MONTH FROM p.created_at) = $3
      `,
            [cabang, year, month]
        );

        return parseInt(result.rows[0]?.count ?? "0", 10) + 1;
    },

    async create(payload: {
        id_toko: number;
        nomor_ulok: string;
        email_pembuat: string;
        lingkup_pekerjaan: string;
        nama_kontraktor: string;
        proyek: string;
        waktu_mulai: string;
        durasi: number;
        waktu_selesai: string;
        grand_total: number;
        terbilang: string;
        nomor_spk: string;
        par: string;
        spk_manual_1: string;
        spk_manual_2: string;
        status: SpkStatus;
    }): Promise<PengajuanSpkRow> {
        const result = await pool.query<PengajuanSpkRow>(
            `
      INSERT INTO pengajuan_spk (
      id_toko, nomor_ulok, email_pembuat, lingkup_pekerjaan, nama_kontraktor, proyek,
        waktu_mulai, durasi, waktu_selesai, grand_total, terbilang, nomor_spk,
        par, spk_manual_1, spk_manual_2, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING ${SPK_COLUMNS}
      `,
            [
            payload.id_toko,
                payload.nomor_ulok,
                payload.email_pembuat,
                payload.lingkup_pekerjaan,
                payload.nama_kontraktor,
                payload.proyek,
                payload.waktu_mulai,
                payload.durasi,
                payload.waktu_selesai,
                payload.grand_total,
                payload.terbilang,
                payload.nomor_spk,
                payload.par,
                payload.spk_manual_1,
                payload.spk_manual_2,
                payload.status
            ]
        );

        return result.rows[0];
    },

    async findLatestRejectedByUlokAndLingkup(
        nomorUlok: string,
        lingkupPekerjaan: string
    ): Promise<PengajuanSpkRow | null> {
        const result = await pool.query<PengajuanSpkRow>(
            `
      SELECT ${SPK_COLUMNS}
      FROM pengajuan_spk
      WHERE nomor_ulok = $1
        AND lingkup_pekerjaan = $2
        AND status = 'SPK_REJECTED'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      `,
            [nomorUlok, lingkupPekerjaan]
        );

        return result.rows[0] ?? null;
    },

    async resubmitRejected(
        id: string,
        payload: {
            id_toko: number;
            nomor_ulok: string;
            email_pembuat: string;
            lingkup_pekerjaan: string;
            nama_kontraktor: string;
            proyek: string;
            waktu_mulai: string;
            durasi: number;
            waktu_selesai: string;
            grand_total: number;
            terbilang: string;
            nomor_spk: string;
            par: string;
            spk_manual_1: string;
            spk_manual_2: string;
            status: SpkStatus;
        }
    ): Promise<PengajuanSpkRow> {
        const result = await pool.query<PengajuanSpkRow>(
            `
      UPDATE pengajuan_spk
      SET id_toko = $1,
          nomor_ulok = $2,
          email_pembuat = $3,
          lingkup_pekerjaan = $4,
          nama_kontraktor = $5,
          proyek = $6,
          waktu_mulai = $7,
          durasi = $8,
          waktu_selesai = $9,
          grand_total = $10,
          terbilang = $11,
          nomor_spk = $12,
          par = $13,
          spk_manual_1 = $14,
          spk_manual_2 = $15,
          status = $16,
          link_pdf = NULL,
          approver_email = NULL,
          waktu_persetujuan = NULL,
          alasan_penolakan = NULL,
          created_at = NOW()
      WHERE id = $17
      RETURNING ${SPK_COLUMNS}
      `,
            [
                payload.id_toko,
                payload.nomor_ulok,
                payload.email_pembuat,
                payload.lingkup_pekerjaan,
                payload.nama_kontraktor,
                payload.proyek,
                payload.waktu_mulai,
                payload.durasi,
                payload.waktu_selesai,
                payload.grand_total,
                payload.terbilang,
                payload.nomor_spk,
                payload.par,
                payload.spk_manual_1,
                payload.spk_manual_2,
                payload.status,
                id
            ]
        );

        return result.rows[0];
    },

    async findById(id: string): Promise<{
        pengajuan: PengajuanSpkRow;
        approvalLogs: SpkApprovalLogRow[];
    } | null> {
        const header = await pool.query<PengajuanSpkRow>(
            `SELECT ${SPK_COLUMNS} FROM pengajuan_spk WHERE id = $1`,
            [id]
        );

        if (header.rowCount === 0) {
            return null;
        }

        const logs = await pool.query<SpkApprovalLogRow>(
            `
      SELECT id, pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, catatan_approval, waktu_tindakan
      FROM spk_approval_log
      WHERE pengajuan_spk_id = $1
      ORDER BY waktu_tindakan ASC
      `,
            [id]
        );

        return {
            pengajuan: header.rows[0],
            approvalLogs: logs.rows
        };
    },

    async list(filter: { 
        status?: string; 
        nomor_ulok?: string; 
        nama_kontraktor?: string; 
        cabang?: string;
        cabang_array?: string[]; // NEW: Accept array of branches
    }): Promise<SpkListRow[]> {
        const conditions: string[] = [];
        const values: Array<string | string[]> = [];

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`p.status = $${values.length}`);
        }

        if (filter.nomor_ulok) {
            values.push(filter.nomor_ulok);
            conditions.push(`p.nomor_ulok = $${values.length}`);
        }

        if (filter.nama_kontraktor) {
            values.push(filter.nama_kontraktor);
            // Normalisasi kedua sisi: hapus PT/CV dan karakter non-alfanumerik, lalu bandingkan exact.
            // Contoh: "CV ABADI TEKNIK" == "ABADI TEKNIK, CV" tapi != "PT ABADI TEKNIK SEJAHTERA"
            conditions.push(`
                REPLACE(REPLACE(regexp_replace(upper(p.nama_kontraktor), '[^A-Z0-9]', '', 'g'), 'PT', ''), 'CV', '')
                =
                REPLACE(REPLACE(regexp_replace(upper($${values.length}::text), '[^A-Z0-9]', '', 'g'), 'PT', ''), 'CV', '')
            `);
        }

        // NEW: Prioritize cabang_array over cabang
        if (filter.cabang_array && filter.cabang_array.length > 0) {
            const normalizedBranches = filter.cabang_array.map(b => b.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        } else if (filter.cabang) {
            values.push(getBranchScopeCandidates(filter.cabang));
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<SpkListJoinRow>(
            `
          SELECT p.id, p.id_toko, p.nomor_ulok, p.email_pembuat, p.lingkup_pekerjaan, p.nama_kontraktor, p.proyek,
                p.waktu_mulai, p.durasi, p.waktu_selesai, p.grand_total, p.terbilang, p.nomor_spk,
                p.par, p.spk_manual_1, p.spk_manual_2, p.status, p.link_pdf, p.approver_email,
                p.waktu_persetujuan, p.alasan_penolakan, p.created_at,
        COALESCE(psp.approved_until, p.waktu_selesai::date)::text AS effective_waktu_selesai,
        CASE
            WHEN p.waktu_mulai IS NOT NULL
             AND COALESCE(psp.approved_until, p.waktu_selesai::date) IS NOT NULL
            THEN (COALESCE(psp.approved_until, p.waktu_selesai::date) - p.waktu_mulai::date + 1)::int
            ELSE p.durasi
        END AS effective_durasi,
        psp.approved_until::text AS pertambahan_spk_approved_until,
        t.id AS toko_id,
        t.nomor_ulok AS toko_nomor_ulok, t.takeover_sequence AS toko_takeover_sequence,
        t.kode_toko AS toko_kode_toko,
        t.nama_toko AS toko_nama_toko, t.takeover_sequence AS toko_takeover_sequence,
        t.cabang AS toko_cabang,
        t.alamat AS toko_alamat
      FROM pengajuan_spk p
        LEFT JOIN toko t ON t.id = p.id_toko
        LEFT JOIN LATERAL (
            SELECT MAX(parsed_extension_date) AS approved_until
            FROM (
                SELECT
                    CASE
                        WHEN parsed.raw_value ~ '^\\d{4}-\\d{2}-\\d{2}'
                         AND to_char(to_date(LEFT(parsed.raw_value, 10), 'YYYY-MM-DD'), 'YYYY-MM-DD') = LEFT(parsed.raw_value, 10)
                            THEN to_date(LEFT(parsed.raw_value, 10), 'YYYY-MM-DD')
                        WHEN parsed.raw_value ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
                         AND (to_char(to_date(parsed.raw_value, 'DD/MM/YYYY'), 'FMDD/FMMM/YYYY') = parsed.raw_value
                          OR to_char(to_date(parsed.raw_value, 'DD/MM/YYYY'), 'DD/MM/YYYY') = parsed.raw_value)
                            THEN to_date(parsed.raw_value, 'DD/MM/YYYY')
                        ELSE NULL
                    END AS parsed_extension_date
                FROM pengajuan_spk ps_scope
                JOIN pertambahan_spk pt ON pt.id_spk = ps_scope.id
                CROSS JOIN LATERAL (
                    SELECT TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan, '')) AS raw_value
                ) parsed
                WHERE ps_scope.nomor_ulok = p.nomor_ulok
                  AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
            ) safe_extension_dates
        ) psp ON true
      ${whereClause}
      ORDER BY p.created_at DESC
      `,
            values
        );

        return result.rows.map((row: SpkListJoinRow): SpkListRow => {
            const {
                toko_id,
                toko_nomor_ulok,
                toko_kode_toko,
                toko_nama_toko,
                toko_cabang,
                toko_alamat,
                effective_waktu_selesai,
                effective_durasi,
                pertambahan_spk_approved_until,
                ...spk
            } = row;

            return {
                ...spk,
                effective_waktu_selesai,
                effective_durasi,
                pertambahan_spk_approved_until,
                ...buildStTargetInfo(effective_waktu_selesai),
                toko: {
                    id: toko_id,
                    nomor_ulok: toko_nomor_ulok ?? spk.nomor_ulok,
                    kode_toko: toko_kode_toko,
                    nama_toko: toko_nama_toko,
                    cabang: toko_cabang,
                    alamat: toko_alamat
                }
            };
        });
    },

    async updateStatusAndInsertLog(
        pengajuanSpkId: string,
        newStatus: SpkStatus,
        action: SpkApprovalInput
    ): Promise<void> {
        await withTransaction(async (client) => {
            if (action.tindakan === "APPROVE") {
                await client.query(
                    `
          UPDATE pengajuan_spk
          SET status = $1,
              approver_email = $2,
              waktu_persetujuan = NOW()
          WHERE id = $3
          `,
                    [newStatus, action.approver_email, pengajuanSpkId]
                );
            } else {
                await client.query(
                    `
          UPDATE pengajuan_spk
          SET status = $1,
              alasan_penolakan = $2
          WHERE id = $3
          `,
                    [newStatus, action.alasan_penolakan ?? null, pengajuanSpkId]
                );
            }

            await client.query(
                `
        INSERT INTO spk_approval_log (
          pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, catatan_approval, waktu_tindakan
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        `,
                [
                    pengajuanSpkId,
                    action.approver_email,
                    action.tindakan,
                    action.alasan_penolakan ?? null,
                    action.catatan_approval?.trim() || null
                ]
            );
        });
    },

    async interveneStatusAndInsertLog(
        pengajuanSpkId: string,
        oldStatus: SpkStatus,
        targetStatus: SpkStatus,
        action: SpkInterventionInput
    ): Promise<void> {
        const logAction = targetStatus === "SPK_APPROVED" ? "APPROVE" : "REJECT";
        const customReason = action.alasan_intervensi?.trim();
        const logReason = customReason
            ? `[INTERVENSI SUPER HUMAN] ${oldStatus} -> ${targetStatus}. ${customReason}`
            : `[INTERVENSI SUPER HUMAN] ${oldStatus} -> ${targetStatus}`;

        await withTransaction(async (client) => {
            if (targetStatus === "SPK_APPROVED") {
                await client.query(
                    `
          UPDATE pengajuan_spk
          SET status = $1,
              approver_email = $2,
              waktu_persetujuan = NOW(),
              alasan_penolakan = NULL
          WHERE id = $3
          `,
                    [targetStatus, action.actor_email, pengajuanSpkId]
                );
            } else if (targetStatus === "SPK_REJECTED") {
                await client.query(
                    `
          UPDATE pengajuan_spk
          SET status = $1,
              approver_email = NULL,
              waktu_persetujuan = NULL,
              alasan_penolakan = $2,
              link_pdf = NULL
          WHERE id = $3
          `,
                    [targetStatus, logReason, pengajuanSpkId]
                );
            } else {
                await client.query(
                    `
          UPDATE pengajuan_spk
          SET status = $1,
              approver_email = NULL,
              waktu_persetujuan = NULL,
              alasan_penolakan = NULL,
              link_pdf = NULL
          WHERE id = $2
          `,
                    [targetStatus, pengajuanSpkId]
                );
            }

            await client.query(
                `
        INSERT INTO spk_approval_log (
          pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, waktu_tindakan
        ) VALUES ($1, $2, $3, $4, NOW())
        `,
                [pengajuanSpkId, action.actor_email, logAction, logReason]
            );

            await activityLogRepository.insert({
                entity_type: "SPK",
                entity_id: Number(pengajuanSpkId),
                actor_email: action.actor_email,
                actor_role: action.actor_role,
                action: "INTERVENTION",
                status_before: oldStatus,
                status_after: targetStatus,
                reason: customReason || null,
                metadata: {
                    legacy_log_reason: logReason
                }
            }, client);
        });
    },

    async updatePdfLink(
        pengajuanSpkId: string,
        linkPdf: string
    ): Promise<void> {
        await pool.query(
            `
      UPDATE pengajuan_spk
      SET link_pdf = $1
      WHERE id = $2
      `,
            [linkPdf, pengajuanSpkId]
        );
    },

    async deleteById(id: string): Promise<void> {
        await pool.query(`DELETE FROM pengajuan_spk WHERE id = $1`, [id]);
    }
};
