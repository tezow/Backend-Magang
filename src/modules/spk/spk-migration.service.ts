import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { normalizeProjectByUlok } from "../../common/project-type";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { SPK_STATUS, type SpkStatus } from "./spk.constants";
import type { SpkMigrationAction, SpkMigrationCommitInput } from "./spk-migration.schema";

type CellRecord = Record<string, unknown>;

type SourceSpk = {
    source_spk_id: number;
    nomor_spk: string;
    par: string | null;
    nomor_ulok: string;
    proyek: string | null;
    alamat: string | null;
    cabang: string | null;
    kode_toko: string | null;
    nama_toko: string | null;
    lingkup_pekerjaan: string;
    nama_kontraktor: string;
    grand_total: number;
    terbilang: string;
    waktu_mulai: string;
    durasi: number;
    waktu_selesai: string;
    email_pembuat: string;
    status: SpkStatus;
    approver_email: string | null;
    waktu_persetujuan: string | null;
    link_pdf: string | null;
    alasan_penolakan: string | null;
    created_at: string | null;
    spk_manual_1: string | null;
    spk_manual_2: string | null;
};

type Candidate = {
    source_spk_id: number;
    spk: SourceSpk;
    issues: string[];
    warnings: string[];
};

type ExistingSpk = {
    existing_toko_id: number | null;
    existing_toko_proyek: string | null;
    existing_toko_match_count: number;
    existing_spk_id: number | null;
    existing_spk_status: string | null;
    existing_spk_created_at: string | null;
    existing_spk_match_count: number;
};

const UNKNOWN_PROJECT = "Tidak Diketahui";

const inferProjectFromUlok = (nomorUlok: string): string =>
    /-R$/i.test(nomorUlok.trim()) ? "Renovasi" : "Alfamart Reguler";

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const nullableText = (value: unknown): string | null => {
    const text = normalizeCell(value);
    return text ? text : null;
};

const excelDateToIso = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 19).replace("T", " ");
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 19).replace("T", " ");
    }

    const raw = normalizeCell(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 19).replace("T", " ");
    if (raw.includes("/")) {
        const parts = raw.split("/");
        if (parts.length === 3) {
            const monthFirst = Number(parts[0]) > 12 ? false : Number(parts[1]) > 12 ? true : true;
            const day = monthFirst ? parts[1] : parts[0];
            const month = monthFirst ? parts[0] : parts[1];
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")} 00:00:00`;
        }
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /\d/.test(raw)) {
        return parsed.toISOString().slice(0, 19).replace("T", " ");
    }
    return null;
};

const dateOnly = (value: unknown): string | null => {
    const iso = excelDateToIso(value);
    return iso ? iso.slice(0, 10) : null;
};

const numberValue = (value: unknown): number => {
    const text = normalizeCell(value);
    if (!text) return 0;
    const numeric = Number(text.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(numeric) ? numeric : 0;
};

const naturalKey = (nomorUlok: unknown, lingkup: unknown): string =>
    `${normalizeCell(nomorUlok).toUpperCase()}\u0000${normalizeCell(lingkup).toUpperCase()}`;

const existingKey = (nomorUlok: string, lingkup?: string | null): string =>
    `${nomorUlok.trim()}\u0000${String(lingkup ?? "").trim().toLowerCase()}`;

const readRows = (workbook: xlsx.WorkBook, sheetName: string): CellRecord[] => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json<CellRecord>(sheet, { defval: "", raw: true });
};

const mapStatus = (rawStatus: unknown): SpkStatus => {
    const status = normalizeCell(rawStatus).toUpperCase();
    if (status.includes("DISETUJUI") || status.includes("APPROVED")) return SPK_STATUS.SPK_APPROVED;
    if (status.includes("DITOLAK") || status.includes("REJECT")) return SPK_STATUS.SPK_REJECTED;
    return SPK_STATUS.WAITING_FOR_BM_APPROVAL;
};

const parseManualSpkParts = (nomorSpk: string): { spk_manual_1: string | null; spk_manual_2: string | null } => {
    const parts = nomorSpk.split("/").map((part) => part.trim()).filter(Boolean);
    return {
        spk_manual_1: parts[2] ?? null,
        spk_manual_2: parts[3] ?? null
    };
};

const parseWorkbook = (buffer: Buffer): Candidate[] => {
    if (!buffer.length) throw new AppError("File Excel wajib diupload", 400);

    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
    if (!workbook.Sheets.SPK_Data) {
        throw new AppError("Format file tidak dikenali. Upload DATA FORM dengan sheet SPK_Data.", 400);
    }

    const rows = readRows(workbook, "SPK_Data");
    const projectByExactKey = new Map<string, string>();
    const projectByUlok = new Map<string, string>();
    const registerProject = (nomorUlok: unknown, lingkup: unknown, proyek: unknown): void => {
        const project = nullableText(proyek);
        const ulok = normalizeCell(nomorUlok);
        if (!project || !ulok) return;
        const exactKey = naturalKey(ulok, lingkup);
        if (!projectByExactKey.has(exactKey)) projectByExactKey.set(exactKey, project);
        const ulokKey = ulok.toUpperCase();
        if (!projectByUlok.has(ulokKey)) projectByUlok.set(ulokKey, project);
    };

    for (const row of rows) {
        registerProject(row["Nomor Ulok"], row["Lingkup Pekerjaan"], row.Proyek);
    }
    for (const row of readRows(workbook, "Form2")) {
        registerProject(row["Nomor Ulok"], row["Lingkup_Pekerjaan"], row.Proyek);
    }

    const candidates: Candidate[] = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        const lingkup = nullableText(row["Lingkup Pekerjaan"]);
        const nomorSpk = nullableText(row["Nomor SPK"]);
        if (!nomorUlok && !nomorSpk) continue;

        const sourceSpkId = 300000 + index + 2;
        const status = mapStatus(row.Status);
        const manualParts = parseManualSpkParts(nomorSpk ?? "");
        const waktuMulai = dateOnly(row["Waktu Mulai"]);
        const waktuSelesai = dateOnly(row["Waktu Selesai"]);
        const createdAt = excelDateToIso(row.Timestamp);
        const waktuPersetujuan = excelDateToIso(row["Waktu Persetujuan"]);

        const projectFromSource = nullableText(row.Proyek);
        const projectFromRelatedData = projectByExactKey.get(naturalKey(nomorUlok ?? "", lingkup ?? ""))
            ?? projectByUlok.get((nomorUlok ?? "").toUpperCase())
            ?? null;
        const projectFromUlok = nomorUlok ? inferProjectFromUlok(nomorUlok) : null;
        const rawProject = projectFromSource ?? projectFromRelatedData ?? projectFromUlok ?? UNKNOWN_PROJECT;
        const spk: SourceSpk = {
            source_spk_id: sourceSpkId,
            nomor_spk: nomorSpk ?? "",
            par: nullableText(row.PAR),
            nomor_ulok: nomorUlok ?? "",
            proyek: normalizeProjectByUlok(nomorUlok, rawProject) ?? UNKNOWN_PROJECT,
            alamat: nullableText(row.Alamat),
            cabang: nullableText(row.Cabang),
            kode_toko: nullableText(row["Kode Toko"]),
            nama_toko: nullableText(row.Nama_Toko),
            lingkup_pekerjaan: lingkup ?? "",
            nama_kontraktor: nullableText(row["Nama Kontraktor"]) ?? "",
            grand_total: Math.round(numberValue(row["Grand Total"])),
            terbilang: nullableText(row.Terbilang) ?? "",
            waktu_mulai: waktuMulai ?? "",
            durasi: Math.max(0, Math.round(numberValue(row.Durasi))),
            waktu_selesai: waktuSelesai ?? "",
            email_pembuat: nullableText(row["Dibuat Oleh"]) ?? "",
            status,
            approver_email: status === SPK_STATUS.SPK_APPROVED ? nullableText(row["Disetujui Oleh"]) : null,
            waktu_persetujuan: status === SPK_STATUS.SPK_APPROVED ? waktuPersetujuan : null,
            link_pdf: nullableText(row["Link PDF"]),
            alasan_penolakan: status === SPK_STATUS.SPK_REJECTED ? nullableText(row["Alasan Penolakan"]) : null,
            created_at: createdAt,
            spk_manual_1: manualParts.spk_manual_1,
            spk_manual_2: manualParts.spk_manual_2
        };

        const issues: string[] = [];
        const warnings: string[] = [];
        if (!spk.nomor_spk) issues.push("Nomor SPK kosong");
        if (!spk.nomor_ulok) issues.push("Nomor ULOK kosong");
        if (!spk.lingkup_pekerjaan) issues.push("Lingkup pekerjaan kosong");
        if (!spk.email_pembuat || !spk.email_pembuat.includes("@")) issues.push("Email pembuat kosong/tidak valid");
        if (!spk.nama_kontraktor) issues.push("Nama kontraktor kosong");
        if (!spk.waktu_mulai) issues.push("Waktu mulai kosong/tidak valid");
        if (!spk.waktu_selesai) issues.push("Waktu selesai kosong/tidak valid");
        if (spk.durasi <= 0) issues.push("Durasi kosong/tidak valid");
        if (spk.grand_total <= 0) issues.push("Grand total kosong/tidak valid");
        if (!spk.link_pdf) warnings.push("Link PDF kosong");
        if (!projectFromSource && projectFromRelatedData) {
            warnings.push(`Proyek diisi dari data ULOK terkait: ${projectFromRelatedData}`);
        }
        if (!projectFromSource && !projectFromRelatedData && projectFromUlok) {
            warnings.push(`Proyek ditentukan dari akhiran ULOK: ${projectFromUlok}`);
        }
        if (!spk.kode_toko) warnings.push("Kode toko kosong di Excel, akan memakai data toko DB bila ada");
        if (spk.status === SPK_STATUS.SPK_APPROVED && !spk.approver_email) warnings.push("SPK approved tanpa email approver");
        if (!spk.created_at) warnings.push("Timestamp kosong/tidak valid, created_at akan memakai waktu commit");

        candidates.push({
            source_spk_id: sourceSpkId,
            spk,
            issues,
            warnings
        });
    }

    const duplicatesByKey = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
        const key = naturalKey(candidate.spk.nomor_ulok, candidate.spk.lingkup_pekerjaan);
        if (!key.trim()) continue;
        duplicatesByKey.set(key, [...(duplicatesByKey.get(key) ?? []), candidate]);
    }

    const statusRank = (status: SpkStatus): number => {
        if (status === SPK_STATUS.SPK_APPROVED) return 3;
        if (status === SPK_STATUS.WAITING_FOR_BM_APPROVAL) return 2;
        return 1;
    };
    const completenessScore = (spk: SourceSpk): number => [
        spk.nomor_spk,
        spk.nomor_ulok,
        spk.lingkup_pekerjaan,
        spk.email_pembuat,
        spk.nama_kontraktor,
        spk.proyek && spk.proyek !== UNKNOWN_PROJECT ? spk.proyek : "",
        spk.waktu_mulai,
        spk.waktu_selesai,
        spk.grand_total > 0 ? spk.grand_total : 0,
        spk.link_pdf,
        spk.approver_email,
        spk.waktu_persetujuan
    ].filter(Boolean).length;
    const timeScore = (spk: SourceSpk): number => {
        const raw = spk.waktu_persetujuan ?? spk.created_at;
        if (!raw) return 0;
        const parsed = new Date(raw).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    };

    for (const duplicateRows of duplicatesByKey.values()) {
        if (duplicateRows.length <= 1) continue;
        const ranked = [...duplicateRows].sort((left, right) =>
            statusRank(right.spk.status) - statusRank(left.spk.status)
            || completenessScore(right.spk) - completenessScore(left.spk)
            || timeScore(right.spk) - timeScore(left.spk)
            || right.source_spk_id - left.source_spk_id
        );
        const winner = ranked[0];
        winner.warnings.push(
            `Dipilih otomatis dari ${duplicateRows.length} duplicate karena status/kelengkapan/tanggal paling kuat`
        );
        for (const loser of ranked.slice(1)) {
            loser.issues.push(
                `Duplicate tidak terpilih. Kandidat utama: source SPK #${winner.source_spk_id} (${winner.spk.status})`
            );
        }
    }

    return candidates;
};

const findExistingSpks = async (candidates: Candidate[]): Promise<Map<string, ExistingSpk>> => {
    const resultMap = new Map<string, ExistingSpk>();
    if (candidates.length === 0) return resultMap;

    const uniqueKeys = new Set<string>();
    const values: string[] = [];
    const placeholders: string[] = [];
    for (const candidate of candidates) {
        const key = existingKey(candidate.spk.nomor_ulok, candidate.spk.lingkup_pekerjaan);
        if (uniqueKeys.has(key)) continue;
        uniqueKeys.add(key);
        const base = values.length;
        placeholders.push(`($${base + 1}, $${base + 2})`);
        values.push(candidate.spk.nomor_ulok, candidate.spk.lingkup_pekerjaan);
    }
    if (placeholders.length === 0) return resultMap;

    const rows = await pool.query<{
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        toko_id: number | null;
        toko_proyek: string | null;
        toko_match_count: string | number | null;
        spk_id: number | null;
        spk_status: string | null;
        spk_created_at: string | null;
        spk_match_count: string | number | null;
    }>(
        `
        WITH wanted(nomor_ulok, lingkup_pekerjaan) AS (
            VALUES ${placeholders.join(", ")}
        )
        SELECT
            w.nomor_ulok,
            w.lingkup_pekerjaan,
            t.id AS toko_id,
            t.proyek AS toko_proyek,
            t.match_count AS toko_match_count,
            p.id AS spk_id,
            p.status AS spk_status,
            p.created_at AS spk_created_at,
            p.match_count AS spk_match_count
        FROM wanted w
        LEFT JOIN LATERAL (
            SELECT id, proyek, COUNT(*) OVER () AS match_count
            FROM toko
            WHERE nomor_ulok = w.nomor_ulok
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE(w.lingkup_pekerjaan, ''))
            ORDER BY id DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT id, status, created_at, COUNT(*) OVER () AS match_count
            FROM pengajuan_spk
            WHERE nomor_ulok = w.nomor_ulok
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE(w.lingkup_pekerjaan, ''))
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        ) p ON TRUE
        `,
        values
    );

    for (const row of rows.rows) {
        resultMap.set(existingKey(row.nomor_ulok, row.lingkup_pekerjaan), {
            existing_toko_id: row.toko_id,
            existing_toko_proyek: row.toko_proyek,
            existing_toko_match_count: Number(row.toko_match_count ?? 0),
            existing_spk_id: row.spk_id,
            existing_spk_status: row.spk_status,
            existing_spk_created_at: row.spk_created_at,
            existing_spk_match_count: Number(row.spk_match_count ?? 0)
        });
    }

    return resultMap;
};

const findExistingSpk = async (candidate: Candidate, client: PoolClient): Promise<ExistingSpk> => {
    const result = await client.query<{
        toko_id: number | null;
        toko_proyek: string | null;
        toko_match_count: string | number | null;
        spk_id: number | null;
        spk_status: string | null;
        spk_created_at: string | null;
        spk_match_count: string | number | null;
    }>(
        `
        SELECT
            t.id AS toko_id,
            t.proyek AS toko_proyek,
            t.match_count AS toko_match_count,
            p.id AS spk_id,
            p.status AS spk_status,
            p.created_at AS spk_created_at,
            p.match_count AS spk_match_count
        FROM (SELECT 1) seed
        LEFT JOIN LATERAL (
            SELECT id, proyek, COUNT(*) OVER () AS match_count
            FROM toko
            WHERE nomor_ulok = $1
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE($2, ''))
            ORDER BY id DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT id, status, created_at, COUNT(*) OVER () AS match_count
            FROM pengajuan_spk
            WHERE nomor_ulok = $1
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE($2, ''))
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        ) p ON TRUE
        `,
        [candidate.spk.nomor_ulok, candidate.spk.lingkup_pekerjaan]
    );

    const row = result.rows[0];
    return {
        existing_toko_id: row?.toko_id ?? null,
        existing_toko_proyek: row?.toko_proyek ?? null,
        existing_toko_match_count: Number(row?.toko_match_count ?? 0),
        existing_spk_id: row?.spk_id ?? null,
        existing_spk_status: row?.spk_status ?? null,
        existing_spk_created_at: row?.spk_created_at ?? null,
        existing_spk_match_count: Number(row?.spk_match_count ?? 0)
    };
};

const insertOrUpdateTokoFromSpk = async (
    client: PoolClient,
    spk: SourceSpk,
    tokoId: number,
    replaceToko: boolean
): Promise<void> => {
    if (!replaceToko) return;
    const projectForToko = spk.proyek === UNKNOWN_PROJECT ? null : spk.proyek;
    await client.query(
        `
        UPDATE toko
        SET kode_toko = COALESCE($1, kode_toko),
            nama_toko = COALESCE($2, nama_toko),
            proyek = COALESCE($3, proyek),
            cabang = COALESCE($4, cabang),
            alamat = COALESCE($5, alamat),
            nama_kontraktor = COALESCE($6, nama_kontraktor)
        WHERE id = $7
        `,
        [spk.kode_toko, spk.nama_toko, projectForToko, spk.cabang, spk.alamat, spk.nama_kontraktor, tokoId]
    );
};

const insertApprovalLogFromSpk = async (client: PoolClient, spkId: number, spk: SourceSpk): Promise<void> => {
    await client.query(`DELETE FROM spk_approval_log WHERE pengajuan_spk_id = $1`, [spkId]);
    if (spk.status === SPK_STATUS.WAITING_FOR_BM_APPROVAL) return;

    const tindakan = spk.status === SPK_STATUS.SPK_APPROVED ? "APPROVE" : "REJECT";
    const approver = spk.approver_email ?? spk.email_pembuat;
    await client.query(
        `
        INSERT INTO spk_approval_log (
            pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, catatan_approval, waktu_tindakan
        ) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, timezone('Asia/Jakarta', now())))
        `,
        [
            spkId,
            approver,
            tindakan,
            spk.status === SPK_STATUS.SPK_REJECTED ? spk.alasan_penolakan : null,
            "Migrasi SPK dari DATA FORM",
            spk.waktu_persetujuan ?? spk.created_at
        ]
    );
};

const insertSpk = async (client: PoolClient, tokoId: number, spk: SourceSpk): Promise<number> => {
    const result = await client.query<{ id: number }>(
        `
        INSERT INTO pengajuan_spk (
            id_toko, nomor_ulok, email_pembuat, lingkup_pekerjaan, nama_kontraktor, proyek,
            waktu_mulai, durasi, waktu_selesai, grand_total, terbilang, nomor_spk,
            par, spk_manual_1, spk_manual_2, status, link_pdf, approver_email,
            waktu_persetujuan, alasan_penolakan, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7::date, $8, $9::date, $10, $11, $12,
            $13, $14, $15, $16, $17, $18,
            $19::timestamp, $20, COALESCE($21::timestamp, timezone('Asia/Jakarta', now()))
        )
        RETURNING id
        `,
        [
            tokoId,
            spk.nomor_ulok,
            spk.email_pembuat,
            spk.lingkup_pekerjaan,
            spk.nama_kontraktor,
            spk.proyek,
            spk.waktu_mulai,
            spk.durasi,
            spk.waktu_selesai,
            spk.grand_total,
            spk.terbilang,
            spk.nomor_spk,
            spk.par,
            spk.spk_manual_1,
            spk.spk_manual_2,
            spk.status,
            spk.link_pdf,
            spk.approver_email,
            spk.waktu_persetujuan,
            spk.alasan_penolakan,
            spk.created_at
        ]
    );
    const spkId = result.rows[0].id;
    await insertApprovalLogFromSpk(client, spkId, spk);
    return spkId;
};

const updateSpk = async (client: PoolClient, spkId: number, tokoId: number, spk: SourceSpk): Promise<void> => {
    await client.query(
        `
        UPDATE pengajuan_spk
        SET id_toko = $1,
            nomor_ulok = $2,
            email_pembuat = $3,
            lingkup_pekerjaan = $4,
            nama_kontraktor = $5,
            proyek = $6,
            waktu_mulai = $7::date,
            durasi = $8,
            waktu_selesai = $9::date,
            grand_total = $10,
            terbilang = $11,
            nomor_spk = $12,
            par = $13,
            spk_manual_1 = $14,
            spk_manual_2 = $15,
            status = $16,
            link_pdf = $17,
            approver_email = $18,
            waktu_persetujuan = $19::timestamp,
            alasan_penolakan = $20,
            created_at = COALESCE($21::timestamp, created_at)
        WHERE id = $22
        `,
        [
            tokoId,
            spk.nomor_ulok,
            spk.email_pembuat,
            spk.lingkup_pekerjaan,
            spk.nama_kontraktor,
            spk.proyek,
            spk.waktu_mulai,
            spk.durasi,
            spk.waktu_selesai,
            spk.grand_total,
            spk.terbilang,
            spk.nomor_spk,
            spk.par,
            spk.spk_manual_1,
            spk.spk_manual_2,
            spk.status,
            spk.link_pdf,
            spk.approver_email,
            spk.waktu_persetujuan,
            spk.alasan_penolakan,
            spk.created_at,
            spkId
        ]
    );
    await insertApprovalLogFromSpk(client, spkId, spk);
};

const updateStatusPdf = async (client: PoolClient, spkId: number, spk: SourceSpk): Promise<void> => {
    await client.query(
        `
        UPDATE pengajuan_spk
        SET status = $1,
            link_pdf = COALESCE($2, link_pdf),
            approver_email = $3,
            waktu_persetujuan = $4::timestamp,
            alasan_penolakan = $5,
            created_at = COALESCE($6::timestamp, created_at)
        WHERE id = $7
        `,
        [
            spk.status,
            spk.link_pdf,
            spk.approver_email,
            spk.waktu_persetujuan,
            spk.alasan_penolakan,
            spk.created_at,
            spkId
        ]
    );
    await insertApprovalLogFromSpk(client, spkId, spk);
};

const applyCandidate = async (
    client: PoolClient,
    candidate: Candidate,
    action: SpkMigrationAction
): Promise<{ action: SpkMigrationAction; source_spk_id: number; target_spk_id: number | null; status: string }> => {
    if (action === "skip") {
        return { action, source_spk_id: candidate.source_spk_id, target_spk_id: null, status: "skipped" };
    }

    if (candidate.issues.length > 0) {
        throw new AppError(`SPK source ${candidate.source_spk_id} tidak valid: ${candidate.issues.join(", ")}`, 422);
    }

    const existing = await findExistingSpk(candidate, client);
    if (candidate.spk.proyek === UNKNOWN_PROJECT && existing.existing_toko_proyek) {
        candidate.spk.proyek = existing.existing_toko_proyek;
    }
    if (!existing.existing_toko_id) {
        throw new AppError(`Toko untuk SPK ${candidate.spk.nomor_ulok} ${candidate.spk.lingkup_pekerjaan} tidak ditemukan`, 404);
    }
    if (existing.existing_toko_match_count > 1) {
        throw new AppError(`Toko untuk SPK ${candidate.spk.nomor_ulok} ${candidate.spk.lingkup_pekerjaan} ambigu`, 409);
    }
    if (existing.existing_spk_match_count > 1 && action !== "insert") {
        throw new AppError(`SPK existing untuk ${candidate.spk.nomor_ulok} ${candidate.spk.lingkup_pekerjaan} ambigu`, 409);
    }
    if (action === "insert" && existing.existing_spk_id) {
        throw new AppError(`SPK ${candidate.spk.nomor_ulok} ${candidate.spk.lingkup_pekerjaan} sudah ada. Pilih replace atau skip.`, 409);
    }
    if (action !== "insert" && !existing.existing_spk_id) {
        throw new AppError(`SPK existing untuk source ${candidate.source_spk_id} tidak ditemukan. Gunakan insert.`, 404);
    }

    if (action === "insert") {
        await insertOrUpdateTokoFromSpk(client, candidate.spk, existing.existing_toko_id, true);
        const spkId = await insertSpk(client, existing.existing_toko_id, candidate.spk);
        return { action, source_spk_id: candidate.source_spk_id, target_spk_id: spkId, status: "inserted" };
    }

    const spkId = existing.existing_spk_id!;
    if (action === "replace_spk") {
        await insertOrUpdateTokoFromSpk(client, candidate.spk, existing.existing_toko_id, true);
        await updateSpk(client, spkId, existing.existing_toko_id, candidate.spk);
        return { action, source_spk_id: candidate.source_spk_id, target_spk_id: spkId, status: "replaced" };
    }

    await updateStatusPdf(client, spkId, candidate.spk);
    return { action, source_spk_id: candidate.source_spk_id, target_spk_id: spkId, status: "updated_status_pdf" };
};

export const spkMigrationService = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi SPK", 403);
        }

        const candidates = parseWorkbook(buffer);
        const existingByKey = await findExistingSpks(candidates);
        const details = [];
        let readyCount = 0;
        let conflictCount = 0;
        let invalidCount = 0;
        let missingTokoCount = 0;

        for (const candidate of candidates) {
            const existing = existingByKey.get(existingKey(candidate.spk.nomor_ulok, candidate.spk.lingkup_pekerjaan))
                ?? {
                    existing_toko_id: null,
                    existing_toko_proyek: null,
                    existing_toko_match_count: 0,
                    existing_spk_id: null,
                    existing_spk_status: null,
                    existing_spk_created_at: null,
                    existing_spk_match_count: 0
                };
            if (candidate.spk.proyek === UNKNOWN_PROJECT && existing.existing_toko_proyek) {
                candidate.spk.proyek = existing.existing_toko_proyek;
                candidate.warnings.push(`Proyek diisi dari toko DB: ${existing.existing_toko_proyek}`);
            }
            const rowIssues = [...candidate.issues];
            if (!existing.existing_toko_id) rowIssues.push("Toko belum ada di DB untuk ULOK + lingkup ini");
            if (existing.existing_toko_match_count > 1) rowIssues.push(`Ambigu di DB: ada ${existing.existing_toko_match_count} toko cocok`);
            if (existing.existing_spk_match_count > 1) rowIssues.push(`Ambigu di DB: ada ${existing.existing_spk_match_count} SPK cocok`);

            const state = rowIssues.length > 0
                ? "invalid"
                : existing.existing_spk_id
                    ? "conflict"
                    : "ready";

            if (!existing.existing_toko_id) missingTokoCount += 1;
            if (state === "ready") readyCount += 1;
            if (state === "conflict") conflictCount += 1;
            if (state === "invalid") invalidCount += 1;

            details.push({
                source_spk_id: candidate.source_spk_id,
                nomor_spk: candidate.spk.nomor_spk,
                par: candidate.spk.par ?? "",
                nomor_ulok: candidate.spk.nomor_ulok,
                lingkup_pekerjaan: candidate.spk.lingkup_pekerjaan,
                nama_toko: candidate.spk.nama_toko ?? "",
                cabang: candidate.spk.cabang ?? "",
                nama_kontraktor: candidate.spk.nama_kontraktor,
                status_spk: candidate.spk.status,
                grand_total: candidate.spk.grand_total,
                waktu_mulai: candidate.spk.waktu_mulai,
                waktu_selesai: candidate.spk.waktu_selesai,
                db_state: state,
                existing_toko_id: existing.existing_toko_id,
                existing_spk_id: existing.existing_spk_id,
                existing_spk_status: existing.existing_spk_status,
                existing_spk_created_at: existing.existing_spk_created_at,
                existing_toko_match_count: existing.existing_toko_match_count,
                existing_spk_match_count: existing.existing_spk_match_count,
                issues: rowIssues,
                warnings: candidate.warnings
            });
        }

        return {
            total_spk: candidates.length,
            ready_count: readyCount,
            conflict_count: conflictCount,
            invalid_count: invalidCount,
            missing_toko_count: missingTokoCount,
            details
        };
    },

    async commit(buffer: Buffer, input: SpkMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi SPK", 403);
        }

        const candidates = parseWorkbook(buffer);
        const candidateBySourceId = new Map(candidates.map((candidate) => [candidate.source_spk_id, candidate]));
        const selected = input.selections.filter((selection) => selection.action !== "skip");

        const results = await withTransaction(async (client) => {
            const rowResults = [];
            for (const selection of input.selections) {
                const candidate = candidateBySourceId.get(selection.source_spk_id);
                if (!candidate) {
                    throw new AppError(`source_spk_id ${selection.source_spk_id} tidak ditemukan di file`, 404);
                }
                rowResults.push(await applyCandidate(client, candidate, selection.action));
            }

            await activityLogRepository.insert({
                entity_type: "SPK",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_before: null,
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi SPK dari DATA FORM sheet SPK_Data",
                metadata: {
                    total_selected: input.selections.length,
                    total_executed: selected.length,
                    source_spk_ids: input.selections.map((selection) => selection.source_spk_id)
                }
            }, client);

            return rowResults;
        });

        return {
            total_selected: input.selections.length,
            inserted: results.filter((row) => row.status === "inserted").length,
            replaced: results.filter((row) => row.status === "replaced").length,
            updated_status_pdf: results.filter((row) => row.status === "updated_status_pdf").length,
            skipped: results.filter((row) => row.status === "skipped").length,
            details: results
        };
    }
};
