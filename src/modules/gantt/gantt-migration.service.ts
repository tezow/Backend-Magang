import { createHash } from "node:crypto";
import * as xlsx from "xlsx";
import { AppError } from "../../common/app-error";
import { normalizeProjectByUlok } from "../../common/project-type";
import { pool } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { GANTT_STATUS } from "./gantt.constants";
import type { DayGanttItemInput, DependencyItemInput, PengawasanItemInput } from "./gantt.schema";
import type {
    GanttMigrationAction,
    GanttMigrationCommitInput,
} from "./gantt-migration.schema";
import { ganttRepository } from "./gantt.repository";

type SheetRow = Record<string, unknown>;

type MigrationCandidate = {
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
    email_pembuat: string | null;
    gantt_timestamp: string | null;
    status: string;
    kategori_pekerjaan: string[];
    day_items: DayGanttItemInput[];
    pengawasan: PengawasanItemInput[];
    dependencies: DependencyItemInput[];
    source_max_h: number;
    header_count: number;
    issues: string[];
    warnings: string[];
};

type ExistingContext = {
    toko_id: number | null;
    gantt_id: number | null;
    gantt_status: string | null;
    spk_duration: number | null;
    pengawasan_count: number;
    day_items: DayGanttItemInput[];
    dependencies: DependencyItemInput[];
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();
const normalizeKeyPart = (value: unknown): string => normalizeText(value).toUpperCase();
const candidateKey = (nomorUlok: string, lingkup: string): string =>
    `${normalizeKeyPart(nomorUlok)}\u0000${normalizeKeyPart(lingkup)}`;
const normalizeUlok = (value: unknown, lingkup: unknown): string => {
    const raw = normalizeText(value);
    const scope = normalizeKeyPart(lingkup);
    if (scope === "SIPIL") return raw.replace(/[-_\s]+SIPIL$/i, "");
    if (scope === "ME") return raw.replace(/[-_\s]+ME$/i, "");
    return raw;
};

const normalizeCategory = (value: unknown): string =>
    normalizeText(value)
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, " ")
        .toUpperCase();

const parseDate = (value: unknown): string | null => {
    const raw = normalizeText(value);
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
        const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
        return `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    }

    const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dash) {
        const year = dash[3].length === 2 ? `20${dash[3]}` : dash[3];
        return `${year}-${dash[2].padStart(2, "0")}-${dash[1].padStart(2, "0")}`;
    }

    return null;
};

const dayDifference = (start: string, end: string): number =>
    Math.floor(
        (
            Date.parse(`${end}T00:00:00Z`)
            - Date.parse(`${start}T00:00:00Z`)
        ) / 86_400_000
    );

const appendCategory = (categories: string[], value: unknown): void => {
    const clean = normalizeText(value);
    const key = normalizeCategory(clean);
    if (!key) return;
    if (!categories.some((category) => normalizeCategory(category) === key)) {
        categories.push(clean);
    }
};

const daySignature = (items: DayGanttItemInput[]): string[] =>
    items
        .map((item) => [
            normalizeCategory(item.kategori_pekerjaan),
            Number(item.h_awal),
            Number(item.h_akhir),
            normalizeText(item.keterlambatan),
            normalizeText(item.kecepatan),
        ].join("|"))
        .sort();

const dependencySignature = (items: DependencyItemInput[]): string[] =>
    items
        .map((item) => [
            normalizeCategory(item.kategori_pekerjaan),
            normalizeCategory(item.kategori_pekerjaan_terikat),
        ].join("|"))
        .sort();

const equalStringArrays = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const parseWorkbook = (buffer: Buffer): MigrationCandidate[] => {
    if (!buffer.length) throw new AppError("File Excel wajib diupload", 400);

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetGantt = workbook.Sheets.gantt_chart ?? workbook.Sheets[workbook.SheetNames[0]];
    const sheetDay = workbook.Sheets.day_gantt_chart;
    const sheetDependency = workbook.Sheets.dependency_gantt;
    if (!sheetGantt) throw new AppError("Sheet gantt_chart tidak ditemukan", 400);

    const ganttRows = xlsx.utils.sheet_to_json<SheetRow>(sheetGantt, { defval: "", raw: false });
    const dayRows = sheetDay
        ? xlsx.utils.sheet_to_json<SheetRow>(sheetDay, { defval: "", raw: false })
        : [];
    const dependencyRows = sheetDependency
        ? xlsx.utils.sheet_to_json<SheetRow>(sheetDependency, { defval: "", raw: false })
        : [];

    const headersByKey = new Map<string, SheetRow[]>();
    for (const row of ganttRows) {
        const lingkup = normalizeText(row.Lingkup_Pekerjaan);
        const nomorUlok = normalizeUlok(row["Nomor Ulok"], lingkup);
        if (!nomorUlok) continue;
        const key = candidateKey(nomorUlok, lingkup);
        const rows = headersByKey.get(key) ?? [];
        rows.push(row);
        headersByKey.set(key, rows);
    }

    const daysByKey = new Map<string, SheetRow[]>();
    for (const row of dayRows) {
        const key = candidateKey(
            normalizeUlok(row["Nomor Ulok"], row.Lingkup_Pekerjaan),
            normalizeText(row.Lingkup_Pekerjaan)
        );
        const rows = daysByKey.get(key) ?? [];
        rows.push(row);
        daysByKey.set(key, rows);
    }

    const dependenciesByKey = new Map<string, SheetRow[]>();
    for (const row of dependencyRows) {
        const key = candidateKey(
            normalizeUlok(row["Nomor Ulok"], row.Lingkup_Pekerjaan),
            normalizeText(row.Lingkup_Pekerjaan)
        );
        const rows = dependenciesByKey.get(key) ?? [];
        rows.push(row);
        dependenciesByKey.set(key, rows);
    }

    const candidates: MigrationCandidate[] = [];
    for (const [key, headers] of headersByKey) {
        const rankedHeaders = [...headers].sort((left, right) => {
            const statusLeft = normalizeText(left.Status).toLowerCase() === GANTT_STATUS.TERKUNCI ? 1 : 0;
            const statusRight = normalizeText(right.Status).toLowerCase() === GANTT_STATUS.TERKUNCI ? 1 : 0;
            return statusRight - statusLeft
                || normalizeText(right.Timestamp).localeCompare(normalizeText(left.Timestamp));
        });
        const header = rankedHeaders[0];
        const lingkup = normalizeText(header.Lingkup_Pekerjaan);
        const nomorUlok = normalizeUlok(header["Nomor Ulok"], lingkup);
        const issues: string[] = [];
        const warnings: string[] = [];
        if (headers.length > 1) {
            const headerSignatures = new Set(headers.map((row) => {
                const categories: string[] = [];
                for (let index = 1; index <= 30; index += 1) {
                    appendCategory(categories, row[`Kategori_${index}`]);
                }
                return categories.map(normalizeCategory).sort().join("|");
            }));
            if (headerSignatures.size > 1) {
                issues.push(`Header duplikat berbeda isi di Excel: ${headers.length} baris`);
            } else {
                warnings.push(`Header duplikat identik ${headers.length} baris; memakai status Terkunci/terbaru`);
            }
        }

        const rawDayItemsAll = (daysByKey.get(key) ?? []).flatMap((row) => {
            const category = normalizeText(row.Kategori);
            const start = parseDate(row.h_awal);
            const end = parseDate(row.h_akhir);
            if (!category || !start || !end) return [];
            return [{
                category,
                start,
                end,
                keterlambatan: normalizeText(row.keterlambatan) || null,
                kecepatan: normalizeText(row.kecepatan) || null,
            }];
        });
        const rawDayItems = Array.from(new Map(rawDayItemsAll.map((item) => [
            [
                normalizeCategory(item.category),
                item.start,
                item.end,
                normalizeText(item.keterlambatan),
                normalizeText(item.kecepatan)
            ].join("|"),
            item
        ])).values());
        if (rawDayItems.length < rawDayItemsAll.length) {
            warnings.push(`${rawDayItemsAll.length - rawDayItems.length} periode day_gantt_chart identik dideduplikasi`);
        }

        if (rawDayItems.length === 0) {
            issues.push("Tidak memiliki baris day_gantt_chart yang valid");
        }

        let dayItems: DayGanttItemInput[] = [];
        let minDateStr: string | null = null;
        if (rawDayItems.length > 0) {
            minDateStr = rawDayItems.reduce(
                (min, item) => item.start < min ? item.start : min,
                rawDayItems[0].start
            );
            dayItems = rawDayItems.map((item) => ({
                kategori_pekerjaan: item.category,
                h_awal: String(dayDifference(minDateStr!, item.start) + 1),
                h_akhir: String(dayDifference(minDateStr!, item.end) + 1),
                keterlambatan: item.keterlambatan,
                kecepatan: item.kecepatan,
            }));
        }

        // Parse Pengawasan_1 ... Pengawasan_20
        const pengawasan: PengawasanItemInput[] = [];
        const minDate = minDateStr ? new Date(`${minDateStr}T00:00:00Z`) : null;
        for (let index = 1; index <= 20; index += 1) {
            const pVal = normalizeText(header[`Pengawasan_${index}`]);
            if (pVal) {
                const parsed = parseDate(pVal);
                if (parsed) {
                    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed);
                    if (match) {
                        pengawasan.push({ tanggal_pengawasan: `${match[3]}/${match[2]}/${match[1]}` });
                    } else {
                        pengawasan.push({ tanggal_pengawasan: parsed });
                    }
                } else if (!isNaN(Number(pVal)) && minDate) {
                    // Konversi dari day index ke tanggal riil
                    const pDate = new Date(minDate.getTime());
                    pDate.setUTCDate(pDate.getUTCDate() + (Number(pVal) - 1));
                    const yyyy = pDate.getUTCFullYear();
                    const mm = String(pDate.getUTCMonth() + 1).padStart(2, "0");
                    const dd = String(pDate.getUTCDate()).padStart(2, "0");
                    pengawasan.push({ tanggal_pengawasan: `${dd}/${mm}/${yyyy}` });
                }
            }
        }

        const rawDependencies: DependencyItemInput[] = (dependenciesByKey.get(key) ?? [])
            .flatMap((row) => {
                const category = normalizeText(row.Kategori);
                const boundCategory = normalizeText(row.Kategori_Terikat);
                if (!category || !boundCategory) return [];
                return [{
                    kategori_pekerjaan: category,
                    kategori_pekerjaan_terikat: boundCategory,
                }];
            });
        const dependencies = Array.from(new Map(rawDependencies.map((item) => [
            `${normalizeCategory(item.kategori_pekerjaan)}|${normalizeCategory(item.kategori_pekerjaan_terikat)}`,
            item
        ])).values());
        if (dependencies.length < rawDependencies.length) {
            warnings.push(`${rawDependencies.length - dependencies.length} dependency identik dideduplikasi`);
        }

        const categories: string[] = [];
        for (let index = 1; index <= 30; index += 1) {
            appendCategory(categories, header[`Kategori_${index}`]);
        }
        dayItems.forEach((item) => appendCategory(categories, item.kategori_pekerjaan));
        dependencies.forEach((item) => {
            appendCategory(categories, item.kategori_pekerjaan);
            appendCategory(categories, item.kategori_pekerjaan_terikat);
        });

        const sourceMaxH = dayItems.reduce(
            (max, item) => Math.max(max, Number(item.h_akhir) || 0),
            0
        );

        const rawStatus = normalizeText(header.Status).toLowerCase();
        const timestampMatch = normalizeText(header.Timestamp).match(/^(\d{4}-\d{2}-\d{2})/);
        candidates.push({
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: lingkup,
            nama_toko: normalizeText(header.Nama_Toko) || null,
            kode_toko: normalizeText(header.Kode_Toko) || null,
            proyek: normalizeProjectByUlok(nomorUlok, normalizeText(header.Proyek)),
            cabang: normalizeText(header.Cabang) || null,
            alamat: normalizeText(header.Alamat) || null,
            nama_kontraktor: normalizeText(header.Nama_Kontraktor) || null,
            email_pembuat: normalizeText(header.Email_Pembuat) || null,
            gantt_timestamp: timestampMatch?.[1] ?? null,
            status: rawStatus === GANTT_STATUS.TERKUNCI
                ? GANTT_STATUS.TERKUNCI
                : GANTT_STATUS.ACTIVE,
            kategori_pekerjaan: categories,
            day_items: dayItems,
            pengawasan,
            dependencies,
            source_max_h: sourceMaxH,
            header_count: headers.length,
            issues,
            warnings,
        });
    }

    return candidates;
};

const loadExistingContexts = async (
    candidates: MigrationCandidate[]
): Promise<Map<string, ExistingContext>> => {
    const contexts = new Map<string, ExistingContext>();
    if (candidates.length === 0) return contexts;

    const uniqueCandidates = Array.from(
        new Map(candidates.map((candidate) => [
            candidateKey(candidate.nomor_ulok, candidate.lingkup_pekerjaan),
            candidate,
        ])).values()
    );
    const values: string[] = [];
    const placeholders = uniqueCandidates.map((candidate) => {
        const base = values.length;
        values.push(candidate.nomor_ulok, candidate.lingkup_pekerjaan);
        return `($${base + 1}, $${base + 2})`;
    });

    const tokoResult = await pool.query<{
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        toko_id: number | null;
    }>(
        `
        WITH wanted(nomor_ulok, lingkup_pekerjaan) AS (
            VALUES ${placeholders.join(", ")}
        )
        SELECT
            wanted.nomor_ulok,
            wanted.lingkup_pekerjaan,
            toko.id AS toko_id
        FROM wanted
        LEFT JOIN LATERAL (
            SELECT id
            FROM toko
            WHERE nomor_ulok = wanted.nomor_ulok
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) =
                  LOWER(COALESCE(wanted.lingkup_pekerjaan, ''))
            ORDER BY id DESC
            LIMIT 1
        ) toko ON TRUE
        `,
        values
    );

    const tokoIds = tokoResult.rows.flatMap((row) => row.toko_id ? [row.toko_id] : []);
    const latestByToko = new Map<number, {
        gantt_id: number | null;
        gantt_status: string | null;
        spk_duration: number | null;
    }>();
    if (tokoIds.length > 0) {
        const latestResult = await pool.query<{
            toko_id: number;
            gantt_id: number | null;
            gantt_status: string | null;
            spk_duration: number | null;
        }>(
            `
            SELECT
                toko.id AS toko_id,
                gantt.id AS gantt_id,
                gantt.status AS gantt_status,
                spk.durasi AS spk_duration
            FROM UNNEST($1::int[]) AS toko(id)
            LEFT JOIN LATERAL (
                SELECT id, status
                FROM gantt_chart
                WHERE id_toko = toko.id
                ORDER BY id DESC
                LIMIT 1
            ) gantt ON TRUE
            LEFT JOIN LATERAL (
                SELECT durasi
                FROM pengajuan_spk
                WHERE id_toko = toko.id
                  AND UPPER(COALESCE(status, '')) NOT IN ('REJECTED', 'REJECT', 'CANCELLED', 'CANCEL')
                ORDER BY id DESC
                LIMIT 1
            ) spk ON TRUE
            `,
            [tokoIds]
        );
        latestResult.rows.forEach((row) => latestByToko.set(row.toko_id, {
            gantt_id: row.gantt_id,
            gantt_status: row.gantt_status,
            spk_duration: row.spk_duration ? Number(row.spk_duration) : null,
        }));
    }

    const ganttIds = Array.from(new Set(
        Array.from(latestByToko.values()).flatMap((row) => row.gantt_id ? [row.gantt_id] : [])
    ));
    const daysByGantt = new Map<number, DayGanttItemInput[]>();
    const dependenciesByGantt = new Map<number, DependencyItemInput[]>();
    const pengawasanByGantt = new Map<number, number>();

    if (ganttIds.length > 0) {
        const dayResult = await pool.query<DayGanttItemInput & { id_gantt: number }>(
                `
                SELECT
                    day_item.id_gantt,
                    kategori.kategori_pekerjaan,
                    day_item.h_awal,
                    day_item.h_akhir,
                    day_item.keterlambatan,
                    day_item.kecepatan
                FROM day_gantt_chart day_item
                JOIN kategori_pekerjaan_gantt kategori
                  ON kategori.id = day_item.id_kategori_pekerjaan_gantt
                WHERE day_item.id_gantt = ANY($1::int[])
                ORDER BY day_item.id
                `,
                [ganttIds]
            );
        const dependencyResult = await pool.query<DependencyItemInput & { id_gantt: number }>(
                `
                SELECT
                    dependency.id_gantt,
                    source_category.kategori_pekerjaan,
                    target_category.kategori_pekerjaan AS kategori_pekerjaan_terikat
                FROM dependency_gantt dependency
                JOIN kategori_pekerjaan_gantt source_category
                  ON source_category.id = dependency.id_kategori
                JOIN kategori_pekerjaan_gantt target_category
                  ON target_category.id = dependency.id_kategori_terikat
                WHERE dependency.id_gantt = ANY($1::int[])
                ORDER BY dependency.id
                `,
                [ganttIds]
            );
        const pengawasanResult = await pool.query<{ id_gantt: number; jumlah: string | number }>(
                `
                SELECT id_gantt, COUNT(*) AS jumlah
                FROM pengawasan_gantt
                WHERE id_gantt = ANY($1::int[])
                GROUP BY id_gantt
                `,
                [ganttIds]
            );

        dayResult.rows.forEach((row) => {
            const items = daysByGantt.get(row.id_gantt) ?? [];
            items.push({
                kategori_pekerjaan: row.kategori_pekerjaan,
                h_awal: row.h_awal,
                h_akhir: row.h_akhir,
                keterlambatan: row.keterlambatan,
                kecepatan: row.kecepatan,
            });
            daysByGantt.set(row.id_gantt, items);
        });
        dependencyResult.rows.forEach((row) => {
            const items = dependenciesByGantt.get(row.id_gantt) ?? [];
            items.push({
                kategori_pekerjaan: row.kategori_pekerjaan,
                kategori_pekerjaan_terikat: row.kategori_pekerjaan_terikat,
            });
            dependenciesByGantt.set(row.id_gantt, items);
        });
        pengawasanResult.rows.forEach((row) => {
            pengawasanByGantt.set(row.id_gantt, Number(row.jumlah));
        });
    }

    for (const row of tokoResult.rows) {
        const latest = row.toko_id ? latestByToko.get(row.toko_id) : undefined;
        const ganttId = latest?.gantt_id ?? null;
        contexts.set(candidateKey(row.nomor_ulok, row.lingkup_pekerjaan), {
            toko_id: row.toko_id,
            gantt_id: ganttId,
            gantt_status: latest?.gantt_status ?? null,
            spk_duration: latest?.spk_duration ?? null,
            pengawasan_count: ganttId ? (pengawasanByGantt.get(ganttId) ?? 0) : 0,
            day_items: ganttId ? (daysByGantt.get(ganttId) ?? []) : [],
            dependencies: ganttId ? (dependenciesByGantt.get(ganttId) ?? []) : [],
        });
    }
    return contexts;
};

const analyzeCandidate = (
    candidate: MigrationCandidate,
    existing: ExistingContext
) => {
    const issues = [...candidate.issues];
    if (!existing.toko_id) issues.push("Toko ULOK + lingkup tidak ditemukan di DB");

    const existingMatchesSource = Boolean(existing.gantt_id)
        && equalStringArrays(daySignature(candidate.day_items), daySignature(existing.day_items))
        && equalStringArrays(
            dependencySignature(candidate.dependencies),
            dependencySignature(existing.dependencies)
        );

    const durationStatus = !existing.spk_duration
        ? "spk_missing"
        : candidate.source_max_h < existing.spk_duration
            ? "short"
            : candidate.source_max_h > existing.spk_duration
                ? "exceeds"
                : "exact";

    const dbState = issues.length > 0
        ? "invalid"
        : !existing.gantt_id
            ? "ready_insert"
            : existingMatchesSource
                ? "existing_source_match"
                : existing.pengawasan_count === 0
                    ? "ready_reconcile"
                    : "protected_changed";

    const allowedActions: GanttMigrationAction[] = ["skip"];
    if (dbState === "ready_insert") allowedActions.unshift("insert_source");
    if (dbState === "ready_reconcile") allowedActions.unshift("replace_source");
    return {
        nomor_ulok: candidate.nomor_ulok,
        lingkup_pekerjaan: candidate.lingkup_pekerjaan,
        nama_toko: candidate.nama_toko ?? "",
        cabang: candidate.cabang ?? "",
        sheet_count: candidate.day_items.length,
        source_max_h: candidate.source_max_h,
        spk_duration: existing.spk_duration,
        duration_status: durationStatus,
        db_state: dbState,
        existing_gantt_id: existing.gantt_id,
        existing_gantt_status: existing.gantt_status,
        existing_matches_source: existingMatchesSource,
        pengawasan_count: existing.pengawasan_count,
        issues,
        warnings: candidate.warnings,
        allowed_actions: allowedActions,
    };
};

const hasSuperHumanRole = (role: string): boolean =>
    role.toUpperCase().includes("SUPER HUMAN");

export const ganttMigrationService = {
    async preview(buffer: Buffer) {
        const candidates = parseWorkbook(buffer);
        const existingByKey = await loadExistingContexts(candidates);
        const details = candidates.map((candidate) => analyzeCandidate(
            candidate,
            existingByKey.get(candidateKey(
                candidate.nomor_ulok,
                candidate.lingkup_pekerjaan
            )) ?? {
                toko_id: null,
                gantt_id: null,
                gantt_status: null,
                spk_duration: null,
                pengawasan_count: 0,
                day_items: [],
                dependencies: [],
            }
        ));

        return {
            total_groups: candidates.length,
            total_rows: candidates.reduce((total, candidate) => total + candidate.day_items.length, 0),
            ready_insert_count: details.filter((detail) => detail.db_state === "ready_insert").length,
            existing_source_match_count: details.filter((detail) => detail.db_state === "existing_source_match").length,
            ready_reconcile_count: details.filter((detail) => detail.db_state === "ready_reconcile").length,
            protected_changed_count: details.filter((detail) => detail.db_state === "protected_changed").length,
            existing_changed_count: details.filter(
                (detail) => detail.db_state === "ready_reconcile" || detail.db_state === "protected_changed"
            ).length,
            invalid_count: details.filter((detail) => detail.db_state === "invalid").length,
            short_count: details.filter((detail) => detail.duration_status === "short").length,
            details,
        };
    },

    async commit(buffer: Buffer, input: GanttMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Gantt", 403);
        }

        const candidates = parseWorkbook(buffer);
        const candidateByKey = new Map(candidates.map((candidate) => [
            candidateKey(candidate.nomor_ulok, candidate.lingkup_pekerjaan),
            candidate,
        ]));
        const existingByKey = await loadExistingContexts(candidates);
        const fileHash = createHash("sha256").update(buffer).digest("hex");
        const results: Array<{
            nomor_ulok: string;
            lingkup_pekerjaan: string;
            action: GanttMigrationAction;
            gantt_id: number | null;
            status: string;
        }> = [];

        for (const selection of input.selections) {
            const key = candidateKey(selection.nomor_ulok, selection.lingkup_pekerjaan);
            const candidate = candidateByKey.get(key);
            if (!candidate) {
                throw new AppError(
                    `Gantt ${selection.nomor_ulok} ${selection.lingkup_pekerjaan} tidak ditemukan di file`,
                    404
                );
            }

            if (selection.action === "skip") {
                results.push({
                    nomor_ulok: candidate.nomor_ulok,
                    lingkup_pekerjaan: candidate.lingkup_pekerjaan,
                    action: selection.action,
                    gantt_id: null,
                    status: "skipped",
                });
                continue;
            }

            const existing = existingByKey.get(key) ?? {
                toko_id: null,
                gantt_id: null,
                gantt_status: null,
                spk_duration: null,
                pengawasan_count: 0,
                day_items: [],
                dependencies: [],
            };
            const analysis = analyzeCandidate(candidate, existing);
            if (analysis.db_state === "invalid") {
                throw new AppError(
                    `Gantt ${candidate.nomor_ulok} tidak valid: ${analysis.issues.join(", ")}`,
                    422
                );
            }
            if (!analysis.allowed_actions.includes(selection.action)) {
                throw new AppError(
                    `Aksi ${selection.action} tidak diizinkan untuk Gantt ${candidate.nomor_ulok}`,
                    422
                );
            }

            if (selection.action === "insert_source" && existing.gantt_id) {
                throw new AppError(
                    `Gantt ${candidate.nomor_ulok} sudah ada. Pilih replace atau skip.`,
                    409
                );
            }
            if (
                selection.action === "replace_source"
                && !existing.gantt_id
                && !existing.toko_id
            ) {
                throw new AppError(`Toko ${candidate.nomor_ulok} tidak ditemukan`, 404);
            }
            const dayItems = candidate.day_items;
            let ganttId = existing.gantt_id;
            let resultStatus = "updated";

            if (!existing.gantt_id) {
                const created = await ganttRepository.createWithDetails({
                    nomor_ulok: candidate.nomor_ulok,
                    lingkup_pekerjaan: candidate.lingkup_pekerjaan,
                    nama_toko: candidate.nama_toko,
                    kode_toko: candidate.kode_toko,
                    proyek: candidate.proyek,
                    cabang: candidate.cabang,
                    alamat: candidate.alamat,
                    nama_kontraktor: candidate.nama_kontraktor,
                    email_pembuat: candidate.email_pembuat ?? input.actor_email,
                    status: candidate.status === GANTT_STATUS.TERKUNCI
                        ? GANTT_STATUS.TERKUNCI
                        : GANTT_STATUS.ACTIVE,
                    gantt_timestamp: candidate.gantt_timestamp,
                    kategori_pekerjaan: candidate.kategori_pekerjaan,
                    day_items: dayItems,
                    pengawasan: candidate.pengawasan,
                    dependencies: candidate.dependencies,
                });
                ganttId = created.id;
                resultStatus = "inserted";
            } else {
                await ganttRepository.updateWithDetails(String(existing.gantt_id), {
                    kategori_pekerjaan: candidate.kategori_pekerjaan,
                    day_items: dayItems,
                    pengawasan: candidate.pengawasan,
                    dependencies: candidate.dependencies,
                });
                resultStatus = "replaced";
            }

            await activityLogRepository.insert({
                entity_type: "GANTT",
                entity_id: ganttId!,
                actor_email: input.actor_email,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_before: existing.gantt_id ? existing.gantt_status : null,
                status_after: resultStatus,
                reason: "Migrasi Gantt dari Gantt Chart DB.xlsx",
                metadata: {
                    nomor_ulok: candidate.nomor_ulok,
                    lingkup_pekerjaan: candidate.lingkup_pekerjaan,
                    migration_action: selection.action,
                    source_file_sha256: fileHash,
                    source_max_h: candidate.source_max_h,
                    spk_duration: existing.spk_duration,
                    existing_matches_source: analysis.existing_matches_source,
                    preserved_pengawasan_count: existing.pengawasan_count,
                },
            });

            results.push({
                nomor_ulok: candidate.nomor_ulok,
                lingkup_pekerjaan: candidate.lingkup_pekerjaan,
                action: selection.action,
                gantt_id: ganttId!,
                status: resultStatus,
            });
        }

        return {
            total_selected: input.selections.length,
            inserted: results.filter((result) => result.status === "inserted").length,
            inserted_scaled: results.filter((result) => result.status === "inserted_scaled").length,
            replaced: results.filter((result) => result.status === "replaced").length,
            scaled: results.filter((result) => result.status === "scaled").length,
            skipped: results.filter((result) => result.status === "skipped").length,
            details: results,
        };
    },
};
