import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { ganttRepository } from "../gantt/gantt.repository";
import { opnameFinalService } from "../opname-final/opname-final.service";
import type {
    PertambahanSpkMigrationAction,
    PertambahanSpkMigrationCommitInput
} from "./pertambahan-spk-migration.schema";

type CellRecord = Record<string, unknown>;

type SourceExtension = {
    source_row: number;
    nomor_ulok: string;
    pertambahan_hari: string;
    tanggal_spk_akhir: string;
    tanggal_spk_akhir_setelah_perpanjangan: string;
    alasan_perpanjangan: string;
    dibuat_oleh: string;
    source_status: string;
    status_persetujuan: string;
    disetujui_oleh: string | null;
    waktu_persetujuan: string | null;
    alasan_penolakan: string | null;
    link_pdf: string | null;
    link_lampiran_pendukung: string | null;
    created_at: string | null;
};

type SourceSpkReference = {
    nomor_spk: string;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    waktu_selesai: string;
};

type Candidate = {
    source_candidate_id: number;
    source: SourceExtension;
    reference: SourceSpkReference | null;
    issues: string[];
    warnings: string[];
};

type DbTarget = {
    id_spk: number;
    id_toko: number;
    nomor_spk: string;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
};

type ExistingExtension = {
    id: number;
    id_spk: number;
    link_pdf: string | null;
    tanggal_spk_akhir: string;
    tanggal_spk_akhir_setelah_perpanjangan: string;
    pertambahan_hari: string;
    dibuat_oleh: string;
    created_at: string;
};

type ResolvedCandidate = Candidate & {
    target: DbTarget | null;
    existing: ExistingExtension[];
};

const hasSuperHumanRole = (role: string): boolean =>
    role.toUpperCase().includes("SUPER HUMAN");

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const nullableText = (value: unknown): string | null => {
    const valueText = normalizeCell(value);
    return valueText || null;
};

const normalizeKeyPart = (value: unknown): string =>
    normalizeCell(value).toUpperCase().replace(/\s+/g, " ");

const excelDateToIso = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        const milliseconds = Math.round((value - 25569) * 86400 * 1000);
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime())
            ? null
            : date.toISOString().slice(0, 19).replace("T", " ");
    }

    const raw = normalizeCell(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 19).replace("T", " ");

    const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (slashDate) {
        const [, month, day, year, hour = "0", minute = "0", second = "0"] = slashDate;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}:${second}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /\d/.test(raw)) {
        return parsed.toISOString().slice(0, 19).replace("T", " ");
    }
    return null;
};

const dateOnly = (value: unknown): string | null => {
    const iso = excelDateToIso(value);
    return iso?.slice(0, 10) ?? null;
};

const numberText = (value: unknown): string => {
    const raw = normalizeCell(value).replace(",", ".");
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? String(Math.round(numeric)) : "";
};

const mapStatus = (value: unknown): string => {
    const status = normalizeKeyPart(value);
    if (status.includes("DISETUJUI") || status.includes("APPROVED")) return "Disetujui BM";
    if (status.includes("DITOLAK") || status.includes("REJECT")) return "Ditolak BM";
    return "Menunggu Persetujuan";
};

const buildDriveLink = (link: unknown, fileId: unknown): string | null => {
    const directLink = nullableText(link);
    if (directLink && /^https?:\/\//i.test(directLink) && !/^https?:\/\/pengawasan-tambahspk\.onrender\.com/i.test(directLink)) {
        return directLink;
    }
    const id = nullableText(fileId);
    return id ? `https://drive.google.com/file/d/${id}/view` : null;
};

const sourceMatchKey = (nomorUlok: string, tanggalSpkAkhir: string): string =>
    `${normalizeKeyPart(nomorUlok)}\u0000${tanggalSpkAkhir}`;

const targetExactKey = (nomorUlok: string, lingkup: string, nomorSpk: string): string =>
    `${normalizeKeyPart(nomorUlok)}\u0000${normalizeKeyPart(lingkup)}\u0000${normalizeKeyPart(nomorSpk)}`;

const targetScopeKey = (nomorUlok: string, lingkup: string): string =>
    `${normalizeKeyPart(nomorUlok)}\u0000${normalizeKeyPart(lingkup)}`;

const existingFallbackKey = (
    idSpk: number,
    source: Pick<SourceExtension, "tanggal_spk_akhir" | "tanggal_spk_akhir_setelah_perpanjangan" | "pertambahan_hari" | "dibuat_oleh" | "created_at">
): string => [
    idSpk,
    source.tanggal_spk_akhir,
    source.tanggal_spk_akhir_setelah_perpanjangan,
    source.pertambahan_hari,
    normalizeKeyPart(source.dibuat_oleh),
    source.created_at ?? ""
].join("\u0000");

const readRows = (workbook: xlsx.WorkBook, sheetName: string): CellRecord[] => {
    const sheet = workbook.Sheets[sheetName];
    return sheet
        ? xlsx.utils.sheet_to_json<CellRecord>(sheet, { defval: "", raw: true })
        : [];
};

const parseWorkbook = (buffer: Buffer): Candidate[] => {
    if (!buffer.length) throw new AppError("File Excel wajib diupload", 400);

    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
    if (!workbook.Sheets["Perpanjangan SPK"] || !workbook.Sheets.SPK_Data) {
        throw new AppError(
            "Format file tidak dikenali. Upload DATA FORM yang memiliki sheet Perpanjangan SPK dan SPK_Data.",
            400
        );
    }

    const referencesByKey = new Map<string, SourceSpkReference[]>();
    for (const row of readRows(workbook, "SPK_Data")) {
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        const nomorSpk = nullableText(row["Nomor SPK"]);
        const lingkup = nullableText(row["Lingkup Pekerjaan"]);
        const waktuSelesai = dateOnly(row["Waktu Selesai"]);
        if (!nomorUlok || !nomorSpk || !lingkup || !waktuSelesai) continue;

        const reference: SourceSpkReference = {
            nomor_spk: nomorSpk,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: lingkup,
            waktu_selesai: waktuSelesai
        };
        const key = sourceMatchKey(nomorUlok, waktuSelesai);
        const references = referencesByKey.get(key) ?? [];
        if (!references.some((item) => targetExactKey(item.nomor_ulok, item.lingkup_pekerjaan, item.nomor_spk)
            === targetExactKey(reference.nomor_ulok, reference.lingkup_pekerjaan, reference.nomor_spk))) {
            references.push(reference);
        }
        referencesByKey.set(key, references);
    }

    const candidates: Candidate[] = [];
    const rows = readRows(workbook, "Perpanjangan SPK");
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        if (!nomorUlok) continue;

        const sourceRow = index + 2;
        const sourceStatus = normalizeCell(row["Status Persetujuan"]);
        const status = mapStatus(sourceStatus);
        const source: SourceExtension = {
            source_row: sourceRow,
            nomor_ulok: nomorUlok,
            pertambahan_hari: numberText(row["Pertambahan Hari"]),
            tanggal_spk_akhir: dateOnly(row["Tanggal SPK Akhir"]) ?? "",
            tanggal_spk_akhir_setelah_perpanjangan: dateOnly(row["Tanggal SPK Akhir Setelah Perpanjangan"]) ?? "",
            alasan_perpanjangan: normalizeCell(row.Alasan),
            dibuat_oleh: normalizeCell(row["Dibuat Oleh"]),
            source_status: sourceStatus,
            status_persetujuan: status,
            disetujui_oleh: status === "Disetujui BM" ? nullableText(row["Disetujui Oleh"]) : null,
            waktu_persetujuan: status === "Disetujui BM" ? excelDateToIso(row["Waktu Persetujuan"]) : null,
            alasan_penolakan: status === "Ditolak BM" ? nullableText(row["Alasan Penolakan"]) : null,
            link_pdf: buildDriveLink(row["Link PDF"], row["ID PDF"]),
            link_lampiran_pendukung: nullableText(row["Link Lampiran Pendukung"]),
            created_at: excelDateToIso(row.Timestamp)
        };

        const baseIssues: string[] = [];
        const baseWarnings: string[] = [];
        if (!source.pertambahan_hari) baseIssues.push("Pertambahan hari kosong/tidak valid");
        if (!source.tanggal_spk_akhir) baseIssues.push("Tanggal SPK akhir kosong/tidak valid");
        if (!source.tanggal_spk_akhir_setelah_perpanjangan) {
            baseIssues.push("Tanggal SPK akhir setelah perpanjangan kosong/tidak valid");
        }
        if (!source.alasan_perpanjangan) baseIssues.push("Alasan perpanjangan kosong");
        if (!source.dibuat_oleh) baseIssues.push("Dibuat oleh kosong");
        if (!source.link_pdf) baseWarnings.push("Link PDF kosong");
        if (!source.link_lampiran_pendukung) baseWarnings.push("Lampiran pendukung kosong");
        if (!source.created_at) baseWarnings.push("Timestamp kosong/tidak valid, created_at akan memakai waktu commit");
        if (source.source_status.toUpperCase().includes("ERROR PDF")) {
            baseWarnings.push("Status sumber mencatat Error PDF; link PDF lama tetap dipertahankan");
        }

        const references = source.tanggal_spk_akhir
            ? referencesByKey.get(sourceMatchKey(source.nomor_ulok, source.tanggal_spk_akhir)) ?? []
            : [];

        if (references.length === 0) {
            candidates.push({
                source_candidate_id: 600000 + (sourceRow * 100),
                source,
                reference: null,
                issues: [...baseIssues, "SPK_Data untuk ULOK + tanggal akhir ini tidak ditemukan"],
                warnings: baseWarnings
            });
            continue;
        }

        references.forEach((reference, referenceIndex) => {
            candidates.push({
                source_candidate_id: 600000 + (sourceRow * 100) + referenceIndex + 1,
                source,
                reference,
                issues: [...baseIssues],
                warnings: references.length > 1
                    ? [...baseWarnings, `Satu baris sumber diterapkan ke ${references.length} lingkup SPK`]
                    : [...baseWarnings]
            });
        });
    }

    return candidates;
};

const resolveCandidates = async (candidates: Candidate[]): Promise<ResolvedCandidate[]> => {
    const uloks = [...new Set(candidates.map((candidate) => candidate.source.nomor_ulok))];
    if (uloks.length === 0) return [];

    const targetsResult = await pool.query<DbTarget>(
        `
        SELECT
            p.id AS id_spk,
            p.id_toko,
            p.nomor_spk,
            p.nomor_ulok,
            p.lingkup_pekerjaan
        FROM pengajuan_spk p
        WHERE p.nomor_ulok = ANY($1::text[])
        `,
        [uloks]
    );

    const targetsByExact = new Map<string, DbTarget[]>();
    const targetsByScope = new Map<string, DbTarget[]>();
    for (const target of targetsResult.rows) {
        const exactKey = targetExactKey(target.nomor_ulok, target.lingkup_pekerjaan, target.nomor_spk);
        targetsByExact.set(exactKey, [...(targetsByExact.get(exactKey) ?? []), target]);
        const scopeKey = targetScopeKey(target.nomor_ulok, target.lingkup_pekerjaan);
        targetsByScope.set(scopeKey, [...(targetsByScope.get(scopeKey) ?? []), target]);
    }

    const targetIds = targetsResult.rows.map((target) => target.id_spk);
    const existingResult = targetIds.length > 0
        ? await pool.query<ExistingExtension>(
            `
            SELECT
                id,
                id_spk,
                link_pdf,
                tanggal_spk_akhir,
                tanggal_spk_akhir_setelah_perpanjangan,
                pertambahan_hari,
                dibuat_oleh,
                created_at
            FROM pertambahan_spk
            WHERE id_spk = ANY($1::int[])
            `,
            [targetIds]
        )
        : { rows: [] as ExistingExtension[] };

    const existingByLink = new Map<string, ExistingExtension[]>();
    const existingByFallback = new Map<string, ExistingExtension[]>();
    for (const existing of existingResult.rows) {
        const link = normalizeCell(existing.link_pdf);
        if (link) {
            const key = `${existing.id_spk}\u0000${link}`;
            existingByLink.set(key, [...(existingByLink.get(key) ?? []), existing]);
        }
        const key = existingFallbackKey(existing.id_spk, existing);
        existingByFallback.set(key, [...(existingByFallback.get(key) ?? []), existing]);
    }

    return candidates.map((candidate) => {
        const issues = [...candidate.issues];
        let target: DbTarget | null = null;

        if (candidate.reference) {
            const exactTargets = targetsByExact.get(targetExactKey(
                candidate.reference.nomor_ulok,
                candidate.reference.lingkup_pekerjaan,
                candidate.reference.nomor_spk
            )) ?? [];
            const scopeTargets = targetsByScope.get(targetScopeKey(
                candidate.reference.nomor_ulok,
                candidate.reference.lingkup_pekerjaan
            )) ?? [];
            const possibleTargets = exactTargets.length > 0 ? exactTargets : scopeTargets;
            if (possibleTargets.length === 1) {
                target = possibleTargets[0];
            } else if (possibleTargets.length === 0) {
                issues.push("SPK target belum ada di database");
            } else {
                issues.push(`SPK target ambigu di database: ${possibleTargets.length} data cocok`);
            }
        }

        let existing: ExistingExtension[] = [];
        if (target) {
            const link = normalizeCell(candidate.source.link_pdf);
            existing = link
                ? existingByLink.get(`${target.id_spk}\u0000${link}`) ?? []
                : existingByFallback.get(existingFallbackKey(target.id_spk, candidate.source)) ?? [];
            if (existing.length > 1) issues.push(`Data existing ambigu: ${existing.length} riwayat cocok`);
        }

        return { ...candidate, target, existing, issues };
    });
};

const findCandidateAtCommit = async (
    client: PoolClient,
    candidate: Candidate
): Promise<{ target: DbTarget; existing: ExistingExtension[] }> => {
    if (!candidate.reference) throw new AppError("Referensi SPK source tidak tersedia", 422);

    const result = await client.query<DbTarget>(
        `
        SELECT
            id AS id_spk,
            id_toko,
            nomor_spk,
            nomor_ulok,
            lingkup_pekerjaan
        FROM pengajuan_spk
        WHERE nomor_ulok = $1
          AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER($2)
        ORDER BY CASE WHEN nomor_spk = $3 THEN 0 ELSE 1 END, created_at DESC, id DESC
        `,
        [
            candidate.reference.nomor_ulok,
            candidate.reference.lingkup_pekerjaan,
            candidate.reference.nomor_spk
        ]
    );
    const exact = result.rows.filter((row) => normalizeKeyPart(row.nomor_spk)
        === normalizeKeyPart(candidate.reference?.nomor_spk));
    const possibleTargets = exact.length > 0 ? exact : result.rows;
    if (possibleTargets.length !== 1) {
        throw new AppError(
            possibleTargets.length === 0
                ? `SPK target ${candidate.source.nomor_ulok} ${candidate.reference.lingkup_pekerjaan} tidak ditemukan`
                : `SPK target ${candidate.source.nomor_ulok} ${candidate.reference.lingkup_pekerjaan} ambigu`,
            possibleTargets.length === 0 ? 404 : 409
        );
    }
    const target = possibleTargets[0];

    const existingResult = candidate.source.link_pdf
        ? await client.query<ExistingExtension>(
            `
            SELECT id, id_spk, link_pdf, tanggal_spk_akhir,
                   tanggal_spk_akhir_setelah_perpanjangan, pertambahan_hari,
                   dibuat_oleh, created_at
            FROM pertambahan_spk
            WHERE id_spk = $1 AND link_pdf = $2
            `,
            [target.id_spk, candidate.source.link_pdf]
        )
        : await client.query<ExistingExtension>(
            `
            SELECT id, id_spk, link_pdf, tanggal_spk_akhir,
                   tanggal_spk_akhir_setelah_perpanjangan, pertambahan_hari,
                   dibuat_oleh, created_at
            FROM pertambahan_spk
            WHERE id_spk = $1
              AND tanggal_spk_akhir::date = $2::date
              AND tanggal_spk_akhir_setelah_perpanjangan::date = $3::date
              AND pertambahan_hari = $4
              AND UPPER(TRIM(dibuat_oleh)) = UPPER(TRIM($5))
              AND ($6::timestamp IS NULL OR created_at = $6::timestamp)
            `,
            [
                target.id_spk,
                candidate.source.tanggal_spk_akhir,
                candidate.source.tanggal_spk_akhir_setelah_perpanjangan,
                candidate.source.pertambahan_hari,
                candidate.source.dibuat_oleh,
                candidate.source.created_at
            ]
        );

    return { target, existing: existingResult.rows };
};

const writeCandidate = async (
    client: PoolClient,
    candidate: Candidate,
    action: PertambahanSpkMigrationAction
): Promise<{ status: string; target_id: number | null; id_spk: number | null; nomor_ulok: string }> => {
    if (action === "skip") {
        return { status: "skipped", target_id: null, id_spk: null, nomor_ulok: candidate.source.nomor_ulok };
    }
    if (candidate.issues.length > 0) {
        throw new AppError(
            `Source row ${candidate.source.source_row} tidak valid: ${candidate.issues.join(", ")}`,
            422
        );
    }

    const { target, existing } = await findCandidateAtCommit(client, candidate);
    if (existing.length > 1) throw new AppError(`Riwayat existing source row ${candidate.source.source_row} ambigu`, 409);
    if (action === "insert" && existing.length > 0) {
        throw new AppError(`Pertambahan SPK source row ${candidate.source.source_row} sudah ada`, 409);
    }
    if (action === "replace" && existing.length === 0) {
        throw new AppError(`Data existing source row ${candidate.source.source_row} tidak ditemukan`, 404);
    }

    const values = [
        target.id_spk,
        candidate.source.pertambahan_hari,
        candidate.source.tanggal_spk_akhir,
        candidate.source.tanggal_spk_akhir_setelah_perpanjangan,
        candidate.source.alasan_perpanjangan,
        candidate.source.dibuat_oleh,
        candidate.source.status_persetujuan,
        candidate.source.disetujui_oleh,
        candidate.source.waktu_persetujuan,
        candidate.source.alasan_penolakan,
        candidate.source.link_pdf,
        candidate.source.link_lampiran_pendukung,
        candidate.source.created_at
    ];

    if (action === "insert") {
        const inserted = await client.query<{ id: number }>(
            `
            INSERT INTO pertambahan_spk (
                id_spk, pertambahan_hari, tanggal_spk_akhir,
                tanggal_spk_akhir_setelah_perpanjangan, alasan_perpanjangan,
                dibuat_oleh, status_persetujuan, disetujui_oleh,
                waktu_persetujuan, alasan_penolakan, link_pdf,
                link_lampiran_pendukung, created_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9::timestamp, $10, $11,
                $12, COALESCE($13::timestamp, timezone('Asia/Jakarta', now()))
            )
            RETURNING id
            `,
            values
        );
        return {
            status: "inserted",
            target_id: inserted.rows[0].id,
            id_spk: target.id_spk,
            nomor_ulok: target.nomor_ulok
        };
    }

    const existingId = existing[0].id;
    await client.query(
        `
        UPDATE pertambahan_spk
        SET id_spk = $1,
            pertambahan_hari = $2,
            tanggal_spk_akhir = $3,
            tanggal_spk_akhir_setelah_perpanjangan = $4,
            alasan_perpanjangan = $5,
            dibuat_oleh = $6,
            status_persetujuan = $7,
            disetujui_oleh = $8,
            waktu_persetujuan = $9::timestamp,
            alasan_penolakan = $10,
            link_pdf = $11,
            link_lampiran_pendukung = $12,
            created_at = COALESCE($13::timestamp, created_at)
        WHERE id = $14
        `,
        [...values, existingId]
    );
    return {
        status: "replaced",
        target_id: existingId,
        id_spk: target.id_spk,
        nomor_ulok: target.nomor_ulok
    };
};

export const pertambahanSpkMigrationService = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Pertambahan SPK", 403);
        }

        const candidates = parseWorkbook(buffer);
        const resolved = await resolveCandidates(candidates);
        const sourceRows = new Set(resolved.map((candidate) => candidate.source.source_row));
        let readyCount = 0;
        let conflictCount = 0;
        let invalidCount = 0;

        const details = resolved.map((candidate) => {
            const state = candidate.issues.length > 0
                ? "invalid"
                : candidate.existing.length === 1
                    ? "conflict"
                    : "ready";
            if (state === "ready") readyCount += 1;
            if (state === "conflict") conflictCount += 1;
            if (state === "invalid") invalidCount += 1;

            return {
                source_candidate_id: candidate.source_candidate_id,
                source_row: candidate.source.source_row,
                nomor_ulok: candidate.source.nomor_ulok,
                nomor_spk: candidate.reference?.nomor_spk ?? "",
                lingkup_pekerjaan: candidate.reference?.lingkup_pekerjaan ?? "",
                pertambahan_hari: candidate.source.pertambahan_hari,
                tanggal_spk_akhir: candidate.source.tanggal_spk_akhir,
                tanggal_spk_akhir_setelah_perpanjangan: candidate.source.tanggal_spk_akhir_setelah_perpanjangan,
                alasan_perpanjangan: candidate.source.alasan_perpanjangan,
                dibuat_oleh: candidate.source.dibuat_oleh,
                source_status: candidate.source.source_status,
                status_persetujuan: candidate.source.status_persetujuan,
                disetujui_oleh: candidate.source.disetujui_oleh,
                waktu_persetujuan: candidate.source.waktu_persetujuan,
                alasan_penolakan: candidate.source.alasan_penolakan,
                link_pdf: candidate.source.link_pdf,
                link_lampiran_pendukung: candidate.source.link_lampiran_pendukung,
                created_at: candidate.source.created_at,
                db_state: state,
                existing_id: candidate.existing[0]?.id ?? null,
                target_spk_id: candidate.target?.id_spk ?? null,
                issues: candidate.issues,
                warnings: candidate.warnings
            };
        });

        return {
            total_source_rows: sourceRows.size,
            total_targets: resolved.length,
            ready_count: readyCount,
            conflict_count: conflictCount,
            invalid_count: invalidCount,
            details
        };
    },

    async commit(buffer: Buffer, input: PertambahanSpkMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Pertambahan SPK", 403);
        }

        const candidates = parseWorkbook(buffer);
        const candidateById = new Map(candidates.map((candidate) => [candidate.source_candidate_id, candidate]));
        const results = await withTransaction(async (client) => {
            const rowResults = [];
            for (const selection of input.selections) {
                const candidate = candidateById.get(selection.source_candidate_id);
                if (!candidate) {
                    throw new AppError(
                        `source_candidate_id ${selection.source_candidate_id} tidak ditemukan di file`,
                        404
                    );
                }
                rowResults.push(await writeCandidate(client, candidate, selection.action));
            }

            await activityLogRepository.insert({
                entity_type: "PERTAMBAHAN_SPK",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_before: null,
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi Pertambahan SPK dari DATA FORM sheet Perpanjangan SPK",
                metadata: {
                    total_selected: input.selections.length,
                    source_candidate_ids: input.selections.map((selection) => selection.source_candidate_id)
                }
            }, client);

            return rowResults;
        });

        const affectedUloks = [...new Set(
            results.filter((result) => result.status !== "skipped").map((result) => result.nomor_ulok)
        )];
        const syncWarnings: string[] = [];
        for (const nomorUlok of affectedUloks) {
            try {
                await ganttRepository.ensureLastPengawasanMatchesEffectiveSpkEnd(nomorUlok);
                const spkResult = await pool.query<{ id_toko: number }>(
                    `SELECT id_toko FROM pengajuan_spk WHERE nomor_ulok = $1 ORDER BY id DESC LIMIT 1`,
                    [nomorUlok]
                );
                if (spkResult.rows[0]?.id_toko) {
                    await opnameFinalService.refreshDendaByTokoId(spkResult.rows[0].id_toko);
                }
            } catch (error) {
                syncWarnings.push(
                    `${nomorUlok}: ${error instanceof Error ? error.message : "sinkronisasi turunan gagal"}`
                );
            }
        }

        return {
            total_selected: input.selections.length,
            inserted: results.filter((result) => result.status === "inserted").length,
            replaced: results.filter((result) => result.status === "replaced").length,
            skipped: results.filter((result) => result.status === "skipped").length,
            sync_warnings: syncWarnings,
            details: results
        };
    }
};
