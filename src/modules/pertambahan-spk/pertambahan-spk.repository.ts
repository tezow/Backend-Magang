import { pool, withTransaction } from "../../db/pool";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import type {
    CreatePertambahanSpkInput,
    PertambahanSpkApprovalInput,
    PertambahanSpkListQuery,
    UpdatePertambahanSpkInput,
    PertambahanSpkInterventionInput
} from "./pertambahan-spk.schema";
import { activityLogRepository } from "../activity-log/activity-log.repository";

export type PertambahanSpkRow = {
    id: string;
    id_spk: string;
    pertambahan_hari: string;
    tanggal_spk_akhir: string;
    tanggal_spk_akhir_setelah_perpanjangan: string;
    alasan_perpanjangan: string;
    dibuat_oleh: string;
    status_persetujuan: string;
    disetujui_oleh: string | null;
    waktu_persetujuan: string | null;
    alasan_penolakan: string | null;
    catatan_approval: string | null;
    catatan_penolakan: string | null;
    link_pdf: string | null;
    link_lampiran_pendukung: string | null;
    created_at: string;
};

export type PertambahanSpkDetailRow = PertambahanSpkRow & {
    nomor_spk: string | null;
    nomor_spk_sipil: string | null;
    nomor_spk_me: string | null;
    spk: {
        id: string;
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
        status: string;
        link_pdf: string | null;
        approver_email: string | null;
        waktu_persetujuan: string | null;
        alasan_penolakan: string | null;
        created_at: string;
    } | null;
    toko: {
        id: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string | null;
        nama_toko: string;
        kode_toko: string;
        proyek: string | null;
        cabang: string;
        alamat: string;
        nama_kontraktor: string | null;
    } | null;
};

const PERTAMBAHAN_SPK_COLUMNS = `
  id, id_spk, pertambahan_hari, tanggal_spk_akhir,
  tanggal_spk_akhir_setelah_perpanjangan, alasan_perpanjangan,
  dibuat_oleh, status_persetujuan, disetujui_oleh, waktu_persetujuan,
  alasan_penolakan, catatan_approval, catatan_penolakan, link_pdf, link_lampiran_pendukung, created_at
`;

const PERTAMBAHAN_SPK_DETAIL_COLUMNS = `
    p.id,
    p.id_spk,
    p.pertambahan_hari,
    p.tanggal_spk_akhir,
    p.tanggal_spk_akhir_setelah_perpanjangan,
    p.alasan_perpanjangan,
    p.dibuat_oleh,
    p.status_persetujuan,
    p.disetujui_oleh,
    p.waktu_persetujuan,
    p.alasan_penolakan,
    p.catatan_approval,
    p.catatan_penolakan,
    p.link_pdf,
    p.link_lampiran_pendukung,
    p.created_at,
    s.nomor_spk,
    (SELECT spk_sipil.nomor_spk FROM pengajuan_spk spk_sipil WHERE spk_sipil.nomor_ulok = s.nomor_ulok AND UPPER(spk_sipil.lingkup_pekerjaan) = 'SIPIL' ORDER BY spk_sipil.created_at DESC LIMIT 1) AS nomor_spk_sipil,
    (SELECT spk_me.nomor_spk FROM pengajuan_spk spk_me WHERE spk_me.nomor_ulok = s.nomor_ulok AND UPPER(spk_me.lingkup_pekerjaan) = 'ME' ORDER BY spk_me.created_at DESC LIMIT 1) AS nomor_spk_me,
    CASE
        WHEN s.id IS NULL THEN NULL
        ELSE jsonb_build_object(
            'id', s.id,
            'nomor_ulok', s.nomor_ulok,
            'email_pembuat', s.email_pembuat,
            'lingkup_pekerjaan', s.lingkup_pekerjaan,
            'nama_kontraktor', s.nama_kontraktor,
            'proyek', s.proyek,
            'waktu_mulai', s.waktu_mulai,
            'durasi', s.durasi,
            'waktu_selesai', s.waktu_selesai,
            'grand_total', s.grand_total,
            'terbilang', s.terbilang,
            'nomor_spk', s.nomor_spk,
            'par', s.par,
            'spk_manual_1', s.spk_manual_1,
            'spk_manual_2', s.spk_manual_2,
            'status', s.status,
            'link_pdf', s.link_pdf,
            'approver_email', s.approver_email,
            'waktu_persetujuan', s.waktu_persetujuan,
            'alasan_penolakan', s.alasan_penolakan,
            'created_at', s.created_at
        )
    END AS spk,
    CASE
        WHEN t.id IS NULL THEN NULL
        ELSE jsonb_build_object(
            'id', t.id,
            'nomor_ulok', t.nomor_ulok,
            'lingkup_pekerjaan', t.lingkup_pekerjaan,
            'nama_toko', t.nama_toko,
            'kode_toko', t.kode_toko,
            'proyek', t.proyek,
            'cabang', t.cabang,
            'alamat', t.alamat,
            'nama_kontraktor', t.nama_kontraktor
        )
    END AS toko
`;

export const pertambahanSpkRepository = {
    async findLatestRejectedBySpkId(idSpk: number): Promise<PertambahanSpkDetailRow | null> {
        const result = await pool.query<PertambahanSpkDetailRow>(
            `
            SELECT
                ${PERTAMBAHAN_SPK_DETAIL_COLUMNS}
            FROM pertambahan_spk p
            LEFT JOIN pengajuan_spk s ON s.id = p.id_spk
            LEFT JOIN toko t ON t.id = s.id_toko
            WHERE p.id_spk = $1
              AND p.status_persetujuan = 'Ditolak BM'
            ORDER BY p.created_at DESC
            LIMIT 1
            `,
            [idSpk]
        );

        return result.rows[0] ?? null;
    },

    async create(payload: CreatePertambahanSpkInput): Promise<PertambahanSpkRow> {
        const result = await pool.query<PertambahanSpkRow>(
            `
            INSERT INTO pertambahan_spk (
                id_spk,
                pertambahan_hari,
                tanggal_spk_akhir,
                tanggal_spk_akhir_setelah_perpanjangan,
                alasan_perpanjangan,
                dibuat_oleh,
                status_persetujuan,
                disetujui_oleh,
                waktu_persetujuan,
                alasan_penolakan,
                catatan_approval,
                catatan_penolakan,
                link_pdf,
                link_lampiran_pendukung,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NULL, $11, $12, NOW())
            RETURNING ${PERTAMBAHAN_SPK_COLUMNS}
            `,
            [
                payload.id_spk,
                payload.pertambahan_hari,
                payload.tanggal_spk_akhir,
                payload.tanggal_spk_akhir_setelah_perpanjangan,
                payload.alasan_perpanjangan,
                payload.dibuat_oleh,
                payload.status_persetujuan,
                payload.disetujui_oleh ?? null,
                payload.waktu_persetujuan ?? null,
                payload.alasan_penolakan ?? null,
                payload.link_pdf ?? null,
                payload.link_lampiran_pendukung ?? null
            ]
        );

        return result.rows[0];
    },

    async list(query: PertambahanSpkListQuery): Promise<PertambahanSpkDetailRow[]> {
        const conditions: string[] = [];
        const values: Array<string | number | string[]> = [];

        if (query.id_spk) {
            values.push(query.id_spk);
            conditions.push(`p.id_spk = $${values.length}`);
        }

        if (query.status_persetujuan) {
            values.push(query.status_persetujuan);
            conditions.push(`p.status_persetujuan = $${values.length}`);
        }

        if (query.nomor_ulok) {
            values.push(query.nomor_ulok);
            conditions.push(`s.nomor_ulok = $${values.length}`);
        }

        // NEW: Prioritize cabang_array over cabang
        if (query.cabang_array && query.cabang_array.length > 0) {
            const normalizedBranches = query.cabang_array.map(b => b.trim().replace(/_+/g, " ").replace(/\s+/g, " ").toUpperCase());
            values.push(normalizedBranches);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        } else if (query.cabang) {
            const branchCandidates = getBranchScopeCandidates(query.cabang);
            values.push(branchCandidates as any);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length}::text[])`);
        }

        // SECURITY: Contractor filter - pastikan kontraktor hanya lihat proyek mereka sendiri
        if (query.nama_kontraktor) {
            const normalizedKontraktor = query.nama_kontraktor.toLowerCase().replace(/\b(pt|cv)\b/gi, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
            values.push(normalizedKontraktor);
            conditions.push(`LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.nama_kontraktor, '\\y(pt|cv)\\y|[\\.,]', ' ', 'gi'), '\\s+', ' ', 'g'))) = $${values.length}`);
            console.log('[KTK FILTER] Contractor filter applied:', query.nama_kontraktor);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<PertambahanSpkDetailRow>(
            `
            SELECT
                ${PERTAMBAHAN_SPK_DETAIL_COLUMNS}
            FROM pertambahan_spk p
            LEFT JOIN pengajuan_spk s ON s.id = p.id_spk
            LEFT JOIN toko t ON t.id = s.id_toko
            ${whereClause}
            ORDER BY p.created_at DESC
            `,
            values
        );

        return result.rows;
    },

    async findById(id: string): Promise<PertambahanSpkDetailRow | null> {
        const result = await pool.query<PertambahanSpkDetailRow>(
            `
            SELECT
                ${PERTAMBAHAN_SPK_DETAIL_COLUMNS}
            FROM pertambahan_spk p
            LEFT JOIN pengajuan_spk s ON s.id = p.id_spk
            LEFT JOIN toko t ON t.id = s.id_toko
            WHERE p.id = $1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async updateById(id: string, payload: UpdatePertambahanSpkInput): Promise<PertambahanSpkDetailRow | null> {
        const updates: string[] = [];
        const values: Array<string | number | null> = [];

        const setField = (field: string, value: string | number | null | undefined): void => {
            if (value !== undefined) {
                values.push(value);
                updates.push(`${field} = $${values.length}`);
            }
        };

        setField("id_spk", payload.id_spk);
        setField("pertambahan_hari", payload.pertambahan_hari);
        setField("tanggal_spk_akhir", payload.tanggal_spk_akhir);
        setField("tanggal_spk_akhir_setelah_perpanjangan", payload.tanggal_spk_akhir_setelah_perpanjangan);
        setField("alasan_perpanjangan", payload.alasan_perpanjangan);
        setField("dibuat_oleh", payload.dibuat_oleh);
        setField("status_persetujuan", payload.status_persetujuan);
        if (Object.prototype.hasOwnProperty.call(payload, "disetujui_oleh")) {
            setField("disetujui_oleh", payload.disetujui_oleh ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(payload, "waktu_persetujuan")) {
            setField("waktu_persetujuan", payload.waktu_persetujuan ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(payload, "alasan_penolakan")) {
            setField("alasan_penolakan", payload.alasan_penolakan ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(payload, "link_pdf")) {
            setField("link_pdf", payload.link_pdf ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(payload, "link_lampiran_pendukung")) {
            setField("link_lampiran_pendukung", payload.link_lampiran_pendukung ?? null);
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        values.push(id);

        const result = await pool.query<{ id: string }>(
            `
            UPDATE pertambahan_spk
            SET ${updates.join(", ")}
            WHERE id = $${values.length}
            RETURNING id
            `,
            values
        );

        if (!result.rows[0]) {
            return null;
        }

        return this.findById(id);
    },

    async deleteById(id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM pertambahan_spk WHERE id = $1`,
            [id]
        );

        return (result.rowCount ?? 0) > 0;
    },

    async applyApproval(
        id: string,
        nextStatus: string,
        action: PertambahanSpkApprovalInput
    ): Promise<PertambahanSpkDetailRow | null> {
        const isApprove = action.tindakan === "APPROVE";

        const result = await pool.query<{ id: string }>(
            `
            UPDATE pertambahan_spk p
            SET status_persetujuan = $1,
                disetujui_oleh = $2,
                waktu_persetujuan = $3,
                alasan_penolakan = $4,
                catatan_approval = $5,
                catatan_penolakan = $6
            WHERE p.id = $7
            RETURNING p.id
            `,
            [
                nextStatus,
                isApprove ? action.approver_email : null,
                isApprove ? new Date().toISOString() : null,
                isApprove ? null : (action.alasan_penolakan ?? null),
                isApprove ? (action.catatan_approval?.trim() || null) : null,
                isApprove ? null : (action.catatan_approval?.trim() || null),
                id
            ]
        );

        if (!result.rows[0]) {
            return null;
        }

        return this.findById(id);
    },

    async interveneStatusAndInsertLog(
        id: string,
        oldStatus: string,
        targetStatus: string,
        action: PertambahanSpkInterventionInput
    ): Promise<PertambahanSpkDetailRow | null> {
        let updatedId: string | null = null;
        const customReason = action.alasan_intervensi?.trim();
        const logReason = customReason
            ? `[INTERVENSI SUPER HUMAN] ${oldStatus} -> ${targetStatus}. ${customReason}`
            : `[INTERVENSI SUPER HUMAN] ${oldStatus} -> ${targetStatus}`;

        await withTransaction(async (client) => {
            const isApprove = targetStatus === "Disetujui BM" || targetStatus === "APPROVED_BY_BM";
            const isReject = targetStatus === "Ditolak BM" || targetStatus === "REJECTED_BY_BM";

            const result = await client.query<{ id: string }>(
                `
                UPDATE pertambahan_spk p
                SET status_persetujuan = $1,
                    disetujui_oleh = $2,
                    waktu_persetujuan = $3,
                    alasan_penolakan = $4,
                    catatan_approval = NULL,
                    catatan_penolakan = NULL
                WHERE p.id = $5
                RETURNING p.id
                `,
                [
                    targetStatus,
                    isApprove ? action.actor_email : null,
                    isApprove ? new Date().toISOString() : null,
                    isReject ? logReason : null,
                    id
                ]
            );

            if (!result.rows[0]) {
                return;
            }

            await activityLogRepository.insert({
                entity_type: "PERTAMBAHAN_SPK",
                entity_id: Number(id),
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

            updatedId = result.rows[0].id;
        });

        return updatedId ? this.findById(updatedId) : null;
    }
};
