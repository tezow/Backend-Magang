import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import type { PengawasanMigrationAction, PengawasanMigrationCommitInput } from "./pengawasan-migration.schema";
import { assertPengawasanItemsBelongToGanttScope } from "./pengawasan-scope-guard";

type CellRecord = Record<string, unknown>;

type PicSource = {
    nomor_ulok: string;
    nama_toko: string | null;
    lingkup_pekerjaan: string | null;
    kategori_lokasi: string | null;
    tanggal_mulai_spk: string | null;
    plc_building_support: string | null;
    spk_url: string | null;
    rab_url: string | null;
};

type HRowSource = {
    sheet_name: string;
    h_day: number;
    row_number: number;
    nomor_ulok: string;
    status_lokasi: string | null;
    progress: Array<{ status: string | null; catatan: string | null; ordinal: number }>;
    link_pdf: string | null;
};

type TargetContext = {
    toko_id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    nama_toko: string | null;
    cabang: string | null;
    gantt_id: number | null;
    rab_id: number | null;
    spk_id: number | null;
    kategori_lokasi: string | null;
    durasi: string | null;
    tanggal_mulai_spk: string | null;
    existing_pic_id: number | null;
    pengawasan_gantt_id: number | null;
    existing_pengawasan_count: number;
    existing_pdf_link: string | null;
};

type WorkItem = {
    source_pengawasan_id: number;
    source: HRowSource;
    pic: PicSource | null;
    target: TargetContext | null;
    tanggal_pengawasan: string | null;
    pekerjaan: Array<{ kategori_pekerjaan: string; jenis_pekerjaan: string; catatan: string | null; status: "progress" | "selesai" | "terlambat" }>;
    mapping_mode: "scheduled" | "reconstructed";
    carried_from_h: number | null;
    reconstructed_delay_days: number;
    delay_updates: Array<{ kategori_pekerjaan: string; keterlambatan: number }>;
    existing_pending_pdf_id: number | null;
    existing_pending_pdf_link: string | null;
    issues: string[];
    warnings: string[];
};

type GanttCategorySchedule = {
    kategori_pekerjaan: string;
    h_awal: number;
    h_akhir: number;
    day_id: number;
};

type RabWorkItem = {
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
};

type ReconstructionState = {
    slots: Array<{
        kategori_pekerjaan: string;
        status: "progress" | "selesai" | "terlambat";
    }>;
    delays: Record<string, number>;
    last_h_day: number | null;
};

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; keywords: string[] }> = [
    { pattern: /BOBOK|BONGKAR|PUING/, keywords: ["BOBOK", "BONGKAR", "PUING"] },
    { pattern: /PERSIAPAN/, keywords: ["PERSIAPAN", "PEMBERSIHAN", "PAGAR PROYEK", "BEDENG", "DIREKSI KEET"] },
    { pattern: /TANAH/, keywords: ["TANAH", "GALIAN", "URUGAN"] },
    { pattern: /PONDASI|BETON/, keywords: ["PONDASI", "BETON", "COR"] },
    { pattern: /PASANGAN/, keywords: ["PASANGAN", "DINDING", "BATA", "PLESTER", "ACI"] },
    { pattern: /BESI/, keywords: ["BESI", "TULANGAN"] },
    { pattern: /KERAMIK/, keywords: ["KERAMIK"] },
    { pattern: /PLUMBING/, keywords: ["PLUMBING", "PIPA", "SALURAN AIR"] },
    { pattern: /SANITARY|SANITER/, keywords: ["SANITARY", "SANITER", "TOILET", "KLOSET", "WASTAFEL"] },
    { pattern: /ATAP/, keywords: ["ATAP", "GENTENG"] },
    { pattern: /KUSEN|PINTU|KACA/, keywords: ["KUSEN", "PINTU", "KACA"] },
    { pattern: /FINISHING/, keywords: ["FINISHING", "PLAFOND", "PLAFON", "GYPSUM", "CAT "] },
    { pattern: /BEANSPOT/, keywords: ["BEANSPOT"] },
    { pattern: /AREA TERBUKA/, keywords: ["AREA TERBUKA", "PARKIR"] },
    { pattern: /INSTALASI/, keywords: ["INSTALASI", "KABEL", "PANEL", "LISTRIK"] },
    { pattern: /FIXTURE/, keywords: ["FIXTURE", "LAMPU", "STOP KONTAK", "SAKLAR", "EXHAUST"] },
    { pattern: /TAMBAHAN/, keywords: ["PEKERJAAN TAMBAHAN", "TAMBAHAN"] }
];

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const nullableText = (value: unknown): string | null => {
    const text = normalizeCell(value);
    return text ? text : null;
};

const normalizeKey = (value: unknown): string => normalizeCell(value).toUpperCase();
const normalizeWorkCategory = (value: unknown): string =>
    normalizeKey(value)
        .replace(/[^A-Z0-9]+/g, " ")
        .replace(/\bPEKERJAAN\b/g, "")
        .replace(/ACECORIES|ACCESSORIES|AKSESORIS/g, "ACCESORIES")
        .replace(/\bSANITER\b/g, "SANITARY")
        .replace(/\bPLAFON\b/g, "PLAFOND")
        .replace(/\s+/g, " ")
        .trim();

const inferWorkCategory = (jenisPekerjaan: string): string | null => {
    const normalized = normalizeKey(jenisPekerjaan);
    for (const rule of CATEGORY_KEYWORDS) {
        if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
            const representative = rule.keywords[0];
            if (representative === "BOBOK") return normalizeWorkCategory("BOBOKAN / BONGKARAN");
            return normalizeWorkCategory(representative);
        }
    }
    return null;
};

const targetKey = (target: TargetContext): string =>
    `${target.gantt_id ?? target.toko_id}\u0000${normalizeKey(target.lingkup_pekerjaan)}`;

const parseDurationDays = (value: string | null | undefined): number | null => {
    const match = normalizeCell(value).match(/\d+/);
    if (!match) return null;
    const days = Number(match[0]);
    return Number.isFinite(days) && days > 0 ? days : null;
};

const pendingPdfKey = (
    nomorUlok: string,
    lingkupPekerjaan: string,
    hDay: number,
    sourceSheet: string,
    sourceRow: number
): string => [
    normalizeKey(nomorUlok),
    normalizeKey(lingkupPekerjaan),
    hDay,
    normalizeKey(sourceSheet),
    sourceRow
].join("\u0000");

const readRows = (workbook: xlsx.WorkBook, sheetName: string): CellRecord[] => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json<CellRecord>(sheet, { defval: "", raw: true });
};

const excelDateToDateOnly = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }

    const raw = normalizeCell(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (raw.includes("/")) {
        const parts = raw.split("/").map((part) => part.trim());
        if (parts.length === 3) {
            const dayFirst = Number(parts[0]) > 12;
            const day = dayFirst ? parts[0] : parts[1];
            const month = dayFirst ? parts[1] : parts[0];
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /\d/.test(raw)) return parsed.toISOString().slice(0, 10);
    return null;
};

const formatDdMmYyyy = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const addDaysToDate = (dateOnly: string, days: number): string | null => {
    const date = new Date(`${dateOnly}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + days);
    return formatDdMmYyyy(date);
};

const normalizeLingkup = (value: string | null | undefined): string[] => {
    const text = normalizeKey(value);
    if (!text || text === "TERISI") return [];
    const scopes = new Set<string>();
    if (text.includes("SIPIL")) scopes.add("SIPIL");
    if (text === "ME" || text.includes("& ME") || text.includes(" ME") || text.includes("M&E")) scopes.add("ME");
    if (scopes.size === 0) scopes.add(text);
    return [...scopes];
};

const mapPengawasanStatus = (value: string | null): "progress" | "selesai" | "terlambat" => {
    const status = normalizeKey(value);
    if (status.includes("TERLAMBAT")) return "terlambat";
    if (status.includes("TEPAT") || status.includes("SELESAI")) return "selesai";
    return "progress";
};

const parsePicSources = (workbook: xlsx.WorkBook): Map<string, PicSource> => {
    const map = new Map<string, PicSource>();
    for (const row of readRows(workbook, "InputPIC")) {
        const nomorUlok = normalizeKey(row.Kode_Ulok);
        if (!nomorUlok) continue;
        map.set(nomorUlok, {
            nomor_ulok: nomorUlok,
            nama_toko: nullableText(row.Nama_Toko),
            lingkup_pekerjaan: nullableText(row["Lingkup Pekerjaan"]),
            kategori_lokasi: nullableText(row.Kategori_Lokasi),
            tanggal_mulai_spk: excelDateToDateOnly(row.Tanggal_Mulai_SPK),
            plc_building_support: nullableText(row.PIC_Building_Support),
            spk_url: nullableText(row.SPK_URL),
            rab_url: nullableText(row.RAB_URL)
        });
    }
    return map;
};

const parseHRows = (workbook: xlsx.WorkBook): HRowSource[] => {
    const rows: HRowSource[] = [];
    for (const sheetName of workbook.SheetNames) {
        const match = sheetName.match(/^DataH(\d+)$/i);
        if (!match) continue;
        const hDay = Number(match[1]);
        if (!Number.isFinite(hDay)) continue;

        readRows(workbook, sheetName).forEach((row, index) => {
            const nomorUlok = normalizeKey(row.Kode_Ulok);
            if (!nomorUlok) return;

            const progress: HRowSource["progress"] = [];
            for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
                const status = nullableText(row[`Status_Progress${ordinal}`]);
                const catatan = nullableText(row[`Catatan${ordinal}`]);
                if (!status && !catatan) continue;
                progress.push({ status, catatan, ordinal });
            }

            rows.push({
                sheet_name: sheetName,
                h_day: hDay,
                row_number: index + 2,
                nomor_ulok: nomorUlok,
                status_lokasi: nullableText(row.Status_Lokasi),
                progress,
                link_pdf: nullableText(row.Link_PDF)
            });
        });
    }
    return rows;
};

const parseWorkbook = (buffer: Buffer): { pics: Map<string, PicSource>; hRows: HRowSource[] } => {
    if (!buffer.length) throw new AppError("File Excel wajib diupload", 400);
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
    if (!workbook.Sheets.InputPIC) {
        throw new AppError("Format file tidak dikenali. Sheet InputPIC tidak ditemukan.", 400);
    }
    if (!workbook.SheetNames.some((sheet) => /^DataH\d+$/i.test(sheet))) {
        throw new AppError("Format file tidak dikenali. Sheet DataH tidak ditemukan.", 400);
    }
    return { pics: parsePicSources(workbook), hRows: parseHRows(workbook) };
};

const findTargetsByUlok = async (nomorUloks: string[]): Promise<Map<string, TargetContext[]>> => {
    const map = new Map<string, TargetContext[]>();
    if (nomorUloks.length === 0) return map;

    const result = await pool.query<TargetContext>(
        `
        SELECT
            t.id AS toko_id,
            t.nomor_ulok,
            COALESCE(t.lingkup_pekerjaan, '') AS lingkup_pekerjaan,
            t.nama_toko,
            t.cabang,
            g.id AS gantt_id,
            r.id AS rab_id,
            s.id AS spk_id,
            COALESCE(r.kategori_lokasi, '') AS kategori_lokasi,
            CASE
                WHEN s.durasi IS NOT NULL THEN concat(s.durasi::text, ' Hari')
                WHEN r.durasi_pekerjaan IS NOT NULL THEN concat(r.durasi_pekerjaan::text, ' Hari')
                ELSE NULL
            END AS durasi,
            COALESCE(s.waktu_mulai::date::text, NULL) AS tanggal_mulai_spk,
            pic.id AS existing_pic_id,
            NULL::int AS pengawasan_gantt_id,
            0::int AS existing_pengawasan_count,
            NULL::text AS existing_pdf_link
        FROM toko t
        LEFT JOIN LATERAL (
            SELECT id
            FROM gantt_chart
            WHERE id_toko = t.id
            ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC
            LIMIT 1
        ) g ON TRUE
        LEFT JOIN LATERAL (
            SELECT id, kategori_lokasi, durasi_pekerjaan
            FROM rab
            WHERE id_toko = t.id
            ORDER BY id DESC
            LIMIT 1
        ) r ON TRUE
        LEFT JOIN LATERAL (
            SELECT id, durasi, waktu_mulai
            FROM pengajuan_spk
            WHERE id_toko = t.id
            ORDER BY CASE WHEN status = 'SPK_APPROVED' THEN 0 ELSE 1 END, id DESC
            LIMIT 1
        ) s ON TRUE
        LEFT JOIN LATERAL (
            SELECT id
            FROM pic_pengawasan
            WHERE id_toko = t.id
               OR id_rab = r.id
               OR id_spk = s.id
            ORDER BY CASE WHEN id_toko = t.id THEN 0 ELSE 1 END, id DESC
            LIMIT 1
        ) pic ON TRUE
        WHERE UPPER(t.nomor_ulok) = ANY($1::text[])
        ORDER BY t.nomor_ulok ASC, t.id ASC
        `,
        [nomorUloks]
    );

    for (const row of result.rows) {
        const key = normalizeKey(row.nomor_ulok);
        const rows = map.get(key) ?? [];
        rows.push(row);
        map.set(key, rows);
    }
    return map;
};

const hydrateExistingForDate = async (target: TargetContext, tanggalPengawasan: string): Promise<TargetContext> => {
    if (!target.gantt_id) return target;
    const result = await pool.query<{
        pengawasan_gantt_id: number | null;
        existing_pengawasan_count: string | number | null;
        existing_pdf_link: string | null;
    }>(
        `
        SELECT
            pg.id AS pengawasan_gantt_id,
            COUNT(p.id) AS existing_pengawasan_count,
            MAX(bp.link_pdf_pengawasan) AS existing_pdf_link
        FROM pengawasan_gantt pg
        LEFT JOIN pengawasan p ON p.id_pengawasan_gantt = pg.id
        LEFT JOIN berkas_pengawasan bp ON bp.id_pengawasan_gantt = pg.id
        WHERE pg.id_gantt = $1
          AND pg.tanggal_pengawasan = $2
        GROUP BY pg.id
        ORDER BY pg.id ASC
        LIMIT 1
        `,
        [target.gantt_id, tanggalPengawasan]
    );

    const row = result.rows[0];
    if (!row) return target;
    return {
        ...target,
        pengawasan_gantt_id: row.pengawasan_gantt_id,
        existing_pengawasan_count: Number(row.existing_pengawasan_count ?? 0),
        existing_pdf_link: row.existing_pdf_link
    };
};

const loadGanttCategorySchedules = async (
    target: TargetContext
): Promise<GanttCategorySchedule[]> => {
    if (!target.gantt_id) return [];
    const result = await pool.query<{
        kategori_pekerjaan: string;
        h_awal: number;
        h_akhir: number;
        day_id: number;
    }>(
        `
        SELECT
            k.kategori_pekerjaan,
            MIN(NULLIF(regexp_replace(COALESCE(d.h_awal, ''), '[^0-9]', '', 'g'), '')::int) AS h_awal,
            MAX(NULLIF(regexp_replace(COALESCE(d.h_akhir, ''), '[^0-9]', '', 'g'), '')::int) AS h_akhir,
            MIN(d.id)::int AS day_id
        FROM day_gantt_chart d
        JOIN kategori_pekerjaan_gantt k ON k.id = d.id_kategori_pekerjaan_gantt
        WHERE d.id_gantt = $1
        GROUP BY k.kategori_pekerjaan
        HAVING
            MIN(NULLIF(regexp_replace(COALESCE(d.h_awal, ''), '[^0-9]', '', 'g'), '')::int) IS NOT NULL
            AND MAX(NULLIF(regexp_replace(COALESCE(d.h_akhir, ''), '[^0-9]', '', 'g'), '')::int) IS NOT NULL
        ORDER BY MIN(d.id), k.kategori_pekerjaan
        `,
        [target.gantt_id]
    );
    return result.rows.map((row) => ({
        kategori_pekerjaan: row.kategori_pekerjaan,
        h_awal: Number(row.h_awal),
        h_akhir: Number(row.h_akhir),
        day_id: Number(row.day_id)
    }));
};

const loadRabItemsByCategory = async (
    target: TargetContext
): Promise<Map<string, RabWorkItem[]>> => {
    const itemsByCategory = new Map<string, RabWorkItem[]>();
    if (!target.rab_id) return itemsByCategory;
    const result = await pool.query<RabWorkItem>(
        `
        SELECT kategori_pekerjaan, jenis_pekerjaan
        FROM rab_item
        WHERE id_rab = $1
        ORDER BY id
        `,
        [target.rab_id]
    );
    for (const row of result.rows) {
        const rawKey = normalizeWorkCategory(row.kategori_pekerjaan);
        const key = rawKey === normalizeWorkCategory("LAINNYA")
            ? inferWorkCategory(row.jenis_pekerjaan) ?? rawKey
            : rawKey;
        const items = itemsByCategory.get(key) ?? [];
        items.push(row);
        itemsByCategory.set(key, items);
    }
    return itemsByCategory;
};

const mapPekerjaanForCategories = (
    rabItemsByCategory: Map<string, RabWorkItem[]>,
    categories: string[],
    progress: HRowSource["progress"]
): WorkItem["pekerjaan"] => {
    return categories.flatMap((category, index) => {
        const sourceProgress = progress[index];
        return (rabItemsByCategory.get(normalizeWorkCategory(category)) ?? []).map((item) => ({
            kategori_pekerjaan: item.kategori_pekerjaan,
            jenis_pekerjaan: item.jenis_pekerjaan,
            catatan: sourceProgress?.catatan ?? null,
            status: mapPengawasanStatus(sourceProgress?.status ?? null)
        }));
    });
};

const selectCategoriesForCheckpoint = (
    schedules: GanttCategorySchedule[],
    hDay: number,
    progress: HRowSource["progress"],
    state: ReconstructionState
): { categories: GanttCategorySchedule[]; mappingMode: WorkItem["mapping_mode"] } => {
    if (progress.length <= 0) return { categories: [], mappingMode: "scheduled" };

    const selected: GanttCategorySchedule[] = [];
    const selectedKeys = new Set<string>();
    let reconstructed = false;
    const findSemanticCategory = (catatan: string | null): GanttCategorySchedule | undefined => {
        const note = normalizeKey(catatan);
        if (!note) return undefined;
        let best: { schedule: GanttCategorySchedule; score: number } | undefined;
        for (const schedule of schedules) {
            const category = normalizeKey(schedule.kategori_pekerjaan);
            const config = CATEGORY_KEYWORDS.find((entry) => entry.pattern.test(category));
            if (!config) continue;
            const score = config.keywords.reduce(
                (total, keyword) => total + (note.includes(keyword) ? keyword.length : 0),
                0
            );
            if (score > 0 && (!best || score > best.score)) best = { schedule, score };
        }
        return best?.schedule;
    };

    const findNextCategory = (afterCategory?: string): GanttCategorySchedule | undefined => {
        const startIndex = afterCategory
            ? schedules.findIndex(
                (schedule) => normalizeKey(schedule.kategori_pekerjaan) === normalizeKey(afterCategory)
            ) + 1
            : 0;
        for (let index = Math.max(0, startIndex); index < schedules.length; index += 1) {
            const schedule = schedules[index];
            if (!selectedKeys.has(normalizeKey(schedule.kategori_pekerjaan))) return schedule;
        }
        return undefined;
    };

    progress.forEach((progressItem, index) => {
        const previousSlot = state.slots[index];
        let category = findSemanticCategory(progressItem.catatan);
        if (category) {
            reconstructed ||= !(category.h_awal <= hDay && category.h_akhir >= hDay);
        } else if (previousSlot && previousSlot.status !== "selesai") {
            category = schedules.find(
                (schedule) =>
                    normalizeKey(schedule.kategori_pekerjaan)
                    === normalizeKey(previousSlot.kategori_pekerjaan)
            );
            reconstructed = true;
        } else if (previousSlot) {
            category = findNextCategory(previousSlot.kategori_pekerjaan);
            reconstructed = true;
        } else {
            category = schedules.find(
                (schedule) =>
                    schedule.h_awal <= hDay
                    && schedule.h_akhir >= hDay
                    && !selectedKeys.has(normalizeKey(schedule.kategori_pekerjaan))
            ) ?? findNextCategory(selected[selected.length - 1]?.kategori_pekerjaan);
        }

        if (category && selectedKeys.has(normalizeKey(category.kategori_pekerjaan))) {
            category = findNextCategory(category.kategori_pekerjaan);
            reconstructed = true;
        }
        if (!category) return;
        selected.push(category);
        selectedKeys.add(normalizeKey(category.kategori_pekerjaan));
    });

    return { categories: selected, mappingMode: reconstructed ? "reconstructed" : "scheduled" };
};

const calculateDelayState = (
    schedules: GanttCategorySchedule[],
    selectedCategories: GanttCategorySchedule[],
    progress: HRowSource["progress"],
    nextHDay: number,
    currentDelays: Record<string, number>
): Record<string, number> => {
    const nextDelays = { ...currentDelays };
    const selectedByKey = new Map(
        selectedCategories.map((category, index) => [normalizeKey(category.kategori_pekerjaan), index])
    );

    for (const schedule of schedules) {
        const key = normalizeKey(schedule.kategori_pekerjaan);
        const progressIndex = selectedByKey.get(key);
        if (progressIndex === undefined) continue;
        const status = mapPengawasanStatus(progress[progressIndex]?.status ?? null);
        if (status !== "terlambat") {
            nextDelays[key] = 0;
            continue;
        }

        const categoryIndex = schedules.findIndex(
            (item) => normalizeKey(item.kategori_pekerjaan) === key
        );
        const inheritedShift = schedules
            .slice(0, Math.max(0, categoryIndex))
            .reduce(
                (total, item) => total + (nextDelays[normalizeKey(item.kategori_pekerjaan)] ?? 0),
                0
            );
        nextDelays[key] = Math.max(0, nextHDay - schedule.h_akhir - inheritedShift);
    }

    return nextDelays;
};

const fitDelaysWithinDuration = (
    schedules: GanttCategorySchedule[],
    delays: Record<string, number>,
    duration: number
): Record<string, number> => {
    const fitted = { ...delays };
    const calculateEnds = () => {
        let shift = 0;
        return schedules.map((schedule) => {
            const key = normalizeKey(schedule.kategori_pekerjaan);
            const delay = fitted[key] ?? 0;
            const end = schedule.h_akhir + shift + delay;
            shift += delay;
            return { key, end };
        });
    };

    for (;;) {
        const ends = calculateEnds();
        const overflowItem = ends.reduce(
            (max, item) => item.end > max.end ? item : max,
            { key: "", end: 0 }
        );
        const overflow = overflowItem.end - duration;
        if (overflow <= 0) break;

        const overflowIndex = schedules.findIndex(
            (schedule) => normalizeKey(schedule.kategori_pekerjaan) === overflowItem.key
        );
        let reduced = false;
        for (let index = overflowIndex; index >= 0; index -= 1) {
            const key = normalizeKey(schedules[index].kategori_pekerjaan);
            const current = fitted[key] ?? 0;
            if (current <= 0) continue;
            fitted[key] = Math.max(0, current - overflow);
            reduced = true;
            break;
        }
        if (!reduced) break;
    }

    return fitted;
};

const buildWorkItems = async (buffer: Buffer): Promise<WorkItem[]> => {
    const { pics, hRows } = parseWorkbook(buffer);
    const targetsByUlok = await findTargetsByUlok([...new Set(hRows.map((row) => row.nomor_ulok))]);
    const items: WorkItem[] = [];
    const sortedRows = [...hRows].sort((left, right) =>
        left.nomor_ulok.localeCompare(right.nomor_ulok)
        || left.h_day - right.h_day
        || left.row_number - right.row_number
    );
    const checkpointDaysByUlok = new Map<string, number[]>();
    for (const source of sortedRows) {
        const days = checkpointDaysByUlok.get(source.nomor_ulok) ?? [];
        if (!days.includes(source.h_day)) days.push(source.h_day);
        checkpointDaysByUlok.set(source.nomor_ulok, days);
    }
    const schedulesByGantt = new Map<number, GanttCategorySchedule[]>();
    const rabItemsByRab = new Map<number, Map<string, RabWorkItem[]>>();
    const reconstructionByTarget = new Map<string, ReconstructionState>();

    let expandedIndex = 0;
    for (const source of sortedRows) {
        const pic = pics.get(source.nomor_ulok) ?? null;
        const allowedScopes = normalizeLingkup(pic?.lingkup_pekerjaan);
        const baseTargets = targetsByUlok.get(source.nomor_ulok) ?? [];
        const filteredTargets = allowedScopes.length === 0
            ? baseTargets
            : baseTargets.filter((target) => allowedScopes.includes(normalizeKey(target.lingkup_pekerjaan)));

        const targetList = filteredTargets.length > 0 ? filteredTargets : [null];
        for (const rawTarget of targetList) {
            expandedIndex += 1;
            const issues: string[] = [];
            const warnings: string[] = [];
            let target = rawTarget;

            const startDate = pic?.tanggal_mulai_spk ?? target?.tanggal_mulai_spk ?? null;
            const tanggalPengawasan = startDate ? addDaysToDate(startDate, source.h_day - 1) : null;
            if (!pic) warnings.push("InputPIC tidak ditemukan untuk ULOK ini");
            if (!source.link_pdf) warnings.push("Link PDF pengawasan kosong");
            if (source.progress.length === 0) issues.push("Status/Catatan progress kosong");
            if (!startDate) issues.push("Tanggal mulai SPK tidak ditemukan");
            if (!tanggalPengawasan) issues.push("Tanggal pengawasan tidak bisa dihitung");
            if (!target) issues.push("Toko target tidak ditemukan di DB untuk ULOK ini");

            if (target && tanggalPengawasan) {
                target = await hydrateExistingForDate(target, tanggalPengawasan);
                if (!target.gantt_id) issues.push("Gantt target tidak ditemukan");
                if (!target.rab_id) issues.push("RAB target tidak ditemukan");
                if (!target.spk_id) issues.push("SPK target tidak ditemukan");
            }

            let pekerjaan: WorkItem["pekerjaan"] = [];
            let mappingMode: WorkItem["mapping_mode"] = "scheduled";
            let carriedFromH: number | null = null;
            let reconstructedDelayDays = 0;
            let delayUpdates: WorkItem["delay_updates"] = [];

            if (target?.gantt_id && target.rab_id) {
                let schedules = schedulesByGantt.get(target.gantt_id);
                if (!schedules) {
                    schedules = await loadGanttCategorySchedules(target);
                    schedulesByGantt.set(target.gantt_id, schedules);
                }
                let rabItems = rabItemsByRab.get(target.rab_id);
                if (!rabItems) {
                    rabItems = await loadRabItemsByCategory(target);
                    rabItemsByRab.set(target.rab_id, rabItems);
                }

                const key = targetKey(target);
                const state = reconstructionByTarget.get(key) ?? {
                    slots: [],
                    delays: {},
                    last_h_day: null
                };
                carriedFromH = state.slots.some((slot) => slot.status !== "selesai")
                    ? state.last_h_day
                    : null;
                const selected = selectCategoriesForCheckpoint(
                    schedules,
                    source.h_day,
                    source.progress,
                    state
                );
                mappingMode = selected.mappingMode;
                const selectedNames = selected.categories.map((category) => category.kategori_pekerjaan);
                pekerjaan = mapPekerjaanForCategories(rabItems, selectedNames, source.progress);

                const checkpointDays = checkpointDaysByUlok.get(source.nomor_ulok) ?? [];
                const nextCheckpoint = checkpointDays.find((day) => day > source.h_day);
                const durationDays = parseDurationDays(target.durasi);
                const nextHDay = nextCheckpoint ?? durationDays ?? source.h_day;
                let nextDelays = calculateDelayState(
                    schedules,
                    selected.categories,
                    source.progress,
                    nextHDay,
                    state.delays
                );
                if (!nextCheckpoint && durationDays) {
                    nextDelays = fitDelaysWithinDuration(schedules, nextDelays, durationDays);
                }
                delayUpdates = schedules.map((category) => ({
                    kategori_pekerjaan: category.kategori_pekerjaan,
                    keterlambatan: nextDelays[normalizeKey(category.kategori_pekerjaan)] ?? 0
                }));
                reconstructedDelayDays = delayUpdates.reduce(
                    (max, update) => Math.max(max, update.keterlambatan),
                    0
                );

                reconstructionByTarget.set(key, {
                    slots: selected.categories.map((category, index) => ({
                        kategori_pekerjaan: category.kategori_pekerjaan,
                        status: mapPengawasanStatus(source.progress[index]?.status ?? null)
                    })),
                    delays: nextDelays,
                    last_h_day: source.h_day
                });
            }
            if (target?.gantt_id && target.rab_id && source.progress.length > 0 && pekerjaan.length === 0) {
                const scheduledCategories = target?.gantt_id
                    ? (schedulesByGantt.get(target.gantt_id) ?? [])
                        .filter((schedule) => source.h_day >= schedule.h_awal && source.h_day <= schedule.h_akhir)
                        .map((schedule) => schedule.kategori_pekerjaan)
                    : [];
                const availableRabCategories = target?.rab_id
                    ? [...(rabItemsByRab.get(target.rab_id)?.keys() ?? [])]
                    : [];
                issues.push(
                    `Item pekerjaan Gantt/RAB untuk H${source.h_day} tidak ditemukan`
                    + ` (kategori Gantt aktif: ${scheduledCategories.join(", ") || "-"};`
                    + ` kategori RAB tersedia: ${availableRabCategories.join(", ") || "-"})`
                );
            }
            const mappedCategoryCount = new Set(
                pekerjaan.map((item) => normalizeKey(item.kategori_pekerjaan))
            ).size;
            if (target && pekerjaan.length > 0 && mappedCategoryCount < source.progress.length) {
                warnings.push(`Progress Excel ${source.progress.length}, kategori Gantt termapping ${mappedCategoryCount}`);
            }
            if (mappingMode === "reconstructed") {
                warnings.push(
                    carriedFromH
                        ? `Pekerjaan belum selesai dibawa dari H${carriedFromH}`
                        : "Kategori direkonstruksi berdasarkan urutan Gantt"
                );
            }
            if (reconstructedDelayDays > 0) {
                warnings.push(
                    `Keterlambatan direkonstruksi sampai checkpoint berikutnya: maksimal ${reconstructedDelayDays} hari`
                );
            }

            items.push({
                source_pengawasan_id: 400000 + expandedIndex,
                source,
                pic,
                target,
                tanggal_pengawasan: tanggalPengawasan,
                pekerjaan,
                mapping_mode: mappingMode,
                carried_from_h: carriedFromH,
                reconstructed_delay_days: reconstructedDelayDays,
                delay_updates: delayUpdates,
                existing_pending_pdf_id: null,
                existing_pending_pdf_link: null,
                issues,
                warnings
            });
        }
    }

    const pendingResult = await pool.query<{
        id: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        h_day: number;
        source_sheet: string;
        source_row: number;
        link_pdf_pengawasan: string;
    }>(
        `
        SELECT id, nomor_ulok, lingkup_pekerjaan, h_day, source_sheet, source_row, link_pdf_pengawasan
        FROM pengawasan_pdf_migration_pending
        WHERE status = 'PENDING'
          AND UPPER(nomor_ulok) = ANY($1::text[])
        `,
        [[...new Set(hRows.map((row) => row.nomor_ulok))]]
    );
    const pendingByKey = new Map(
        pendingResult.rows.map((row) => [
            pendingPdfKey(row.nomor_ulok, row.lingkup_pekerjaan, row.h_day, row.source_sheet, row.source_row),
            row
        ])
    );
    for (const item of items) {
        const lingkup = item.target?.lingkup_pekerjaan ?? item.pic?.lingkup_pekerjaan ?? "";
        const existing = pendingByKey.get(
            pendingPdfKey(
                item.source.nomor_ulok,
                lingkup,
                item.source.h_day,
                item.source.sheet_name,
                item.source.row_number
            )
        );
        if (existing) {
            item.existing_pending_pdf_id = existing.id;
            item.existing_pending_pdf_link = existing.link_pdf_pengawasan;
        }
    }

    return items;
};

const ensurePicPengawasan = async (client: PoolClient, item: WorkItem): Promise<number | null> => {
    const target = item.target;
    if (!target || !item.pic || !target.rab_id || !target.spk_id) return target?.existing_pic_id ?? null;
    if (target.existing_pic_id) return target.existing_pic_id;

    const existing = await client.query<{ id: number }>(
        `
        SELECT id
        FROM pic_pengawasan
        WHERE id_toko = $1
           OR id_rab = $3
           OR id_spk = $4
        ORDER BY CASE WHEN id_toko = $1 THEN 0 ELSE 1 END, id ASC
        LIMIT 1
        FOR UPDATE
        `,
        [
            target.toko_id,
            target.nomor_ulok,
            target.rab_id,
            target.spk_id
        ]
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const result = await client.query<{ id: number }>(
        `
        INSERT INTO pic_pengawasan (
            id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi, durasi, tanggal_mulai_spk, plc_building_support
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
        ON CONFLICT DO NOTHING
        RETURNING id
        `,
        [
            target.toko_id,
            target.nomor_ulok,
            target.rab_id,
            target.spk_id,
            item.pic.kategori_lokasi ?? target.kategori_lokasi ?? "-",
            target.durasi ?? "-",
            item.pic.tanggal_mulai_spk ?? target.tanggal_mulai_spk,
            item.pic.plc_building_support ?? "-"
        ]
    );
    if (result.rows[0]) return result.rows[0].id;

    const conflicted = await client.query<{ id: number }>(
        `
        SELECT id
        FROM pic_pengawasan
        WHERE id_toko = $1
           OR id_rab = $3
           OR id_spk = $4
        ORDER BY
            CASE
                WHEN id_rab = $3 AND id_spk = $4 THEN 0
                WHEN id_rab = $3 THEN 1
                WHEN id_spk = $4 THEN 2
                WHEN id_toko = $1 THEN 3
                ELSE 4
            END,
            id ASC
        LIMIT 1
        FOR UPDATE
        `,
        [
            target.toko_id,
            target.nomor_ulok,
            target.rab_id,
            target.spk_id
        ]
    );
    if (conflicted.rows[0]) return conflicted.rows[0].id;

    throw new AppError(
        `PIC Pengawasan ${target.nomor_ulok} gagal dibuat atau ditemukan setelah konflik database`,
        409
    );
};

const ensurePengawasanGantt = async (
    client: PoolClient,
    item: WorkItem,
    idPicPengawasan: number | null
): Promise<number> => {
    if (!item.target?.gantt_id || !item.tanggal_pengawasan) {
        throw new AppError(`Target/tanggal source ${item.source_pengawasan_id} tidak valid`, 422);
    }

    const existing = await client.query<{ id: number }>(
        `
        SELECT id
        FROM pengawasan_gantt
        WHERE id_gantt = $1 AND tanggal_pengawasan = $2
        ORDER BY id ASC
        LIMIT 1
        `,
        [item.target.gantt_id, item.tanggal_pengawasan]
    );
    if (existing.rows[0]) {
        await client.query(
            `
            UPDATE pengawasan_gantt
            SET id_pic_pengawasan = COALESCE($1, id_pic_pengawasan)
            WHERE id = $2
            `,
            [idPicPengawasan, existing.rows[0].id]
        );
        return existing.rows[0].id;
    }

    const inserted = await client.query<{ id: number }>(
        `
        INSERT INTO pengawasan_gantt (id_gantt, tanggal_pengawasan, id_pic_pengawasan)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [item.target.gantt_id, item.tanggal_pengawasan, idPicPengawasan]
    );
    return inserted.rows[0].id;
};

const upsertBerkasPengawasan = async (client: PoolClient, idPengawasanGantt: number, linkPdf: string | null): Promise<void> => {
    if (!linkPdf) return;
    await client.query(
        `
        INSERT INTO berkas_pengawasan (id_pengawasan_gantt, link_pdf_pengawasan)
        VALUES ($1, $2)
        ON CONFLICT (id_pengawasan_gantt)
        DO UPDATE SET link_pdf_pengawasan = EXCLUDED.link_pdf_pengawasan
        `,
        [idPengawasanGantt, linkPdf]
    );
};

const savePendingPdf = async (client: PoolClient, item: WorkItem): Promise<number> => {
    if (!item.source.link_pdf) {
        throw new AppError(`Link PDF source ${item.source_pengawasan_id} kosong`, 422);
    }

    const result = await client.query<{ id: number }>(
        `
        INSERT INTO pengawasan_pdf_migration_pending (
            nomor_ulok,
            lingkup_pekerjaan,
            h_day,
            tanggal_pengawasan,
            link_pdf_pengawasan,
            source_sheet,
            source_row,
            status,
            id_pengawasan_gantt,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NULL, timezone('Asia/Jakarta', now()))
        ON CONFLICT (nomor_ulok, lingkup_pekerjaan, h_day, source_sheet, source_row)
        DO UPDATE SET
            tanggal_pengawasan = EXCLUDED.tanggal_pengawasan,
            link_pdf_pengawasan = EXCLUDED.link_pdf_pengawasan,
            status = 'PENDING',
            id_pengawasan_gantt = NULL,
            updated_at = timezone('Asia/Jakarta', now())
        RETURNING id
        `,
        [
            item.source.nomor_ulok,
            item.target?.lingkup_pekerjaan ?? item.pic?.lingkup_pekerjaan ?? "",
            item.source.h_day,
            item.tanggal_pengawasan,
            item.source.link_pdf,
            item.source.sheet_name,
            item.source.row_number
        ]
    );
    return result.rows[0].id;
};

const insertPengawasanItems = async (client: PoolClient, item: WorkItem, idPengawasanGantt: number): Promise<number> => {
    if (!item.target?.gantt_id) return 0;
    await assertPengawasanItemsBelongToGanttScope(
        item.pekerjaan.map((pekerjaan, index) => ({
            id_gantt: item.target!.gantt_id!,
            kategori_pekerjaan: pekerjaan.kategori_pekerjaan,
            jenis_pekerjaan: pekerjaan.jenis_pekerjaan,
            index
        })),
        client
    );

    const chunkSize = 300;
    let inserted = 0;
    for (let offset = 0; offset < item.pekerjaan.length; offset += chunkSize) {
        const chunk = item.pekerjaan.slice(offset, offset + chunkSize);
        const values: unknown[] = [];
        const placeholders = chunk.map((pekerjaan, index) => {
            const base = index * 6;
            values.push(
                item.target!.gantt_id,
                idPengawasanGantt,
                pekerjaan.kategori_pekerjaan,
                pekerjaan.jenis_pekerjaan,
                pekerjaan.catatan,
                pekerjaan.status
            );
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NULL, $${base + 6})`;
        });
        const result = await client.query(
            `
            INSERT INTO pengawasan (
                id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan, dokumentasi, status
            ) VALUES ${placeholders.join(", ")}
            `,
            values
        );
        inserted += result.rowCount ?? 0;
    }
    return inserted;
};

const applyReconstructedDelays = async (
    client: PoolClient,
    item: WorkItem
): Promise<number> => {
    if (!item.target?.gantt_id || item.delay_updates.length === 0) return 0;
    const values: unknown[] = [item.target.gantt_id];
    const placeholders = item.delay_updates.map((delay, index) => {
        const base = index * 2 + 2;
        values.push(delay.kategori_pekerjaan, delay.keterlambatan);
        return `($${base}::text, $${base + 1}::integer)`;
    });
    const result = await client.query(
        `
        UPDATE day_gantt_chart day_item
        SET keterlambatan = CASE WHEN delay.keterlambatan > 0 THEN delay.keterlambatan::text ELSE NULL END
        FROM kategori_pekerjaan_gantt kategori
        JOIN (VALUES ${placeholders.join(", ")}) AS delay(kategori_pekerjaan, keterlambatan)
          ON UPPER(kategori.kategori_pekerjaan) = UPPER(delay.kategori_pekerjaan)
        WHERE day_item.id_kategori_pekerjaan_gantt = kategori.id
          AND day_item.id_gantt = $1
          AND kategori.id_gantt = $1
        `,
        values
    );
    return result.rowCount ?? 0;
};

const applyWorkItem = async (
    client: PoolClient,
    item: WorkItem,
    action: PengawasanMigrationAction
) => {
    if (action === "skip") {
        return { action, source_pengawasan_id: item.source_pengawasan_id, status: "skipped", inserted_items: 0, target_pengawasan_gantt_id: null };
    }
    if (action === "save_pdf_pending") {
        const pendingId = await savePendingPdf(client, item);
        return {
            action,
            source_pengawasan_id: item.source_pengawasan_id,
            status: "saved_pdf_pending",
            inserted_items: 0,
            target_pengawasan_gantt_id: null,
            pending_pdf_id: pendingId
        };
    }
    if (item.issues.length > 0) {
        throw new AppError(`Pengawasan source ${item.source_pengawasan_id} tidak valid: ${item.issues.join(", ")}`, 422);
    }
    if (!item.target) throw new AppError(`Target source ${item.source_pengawasan_id} tidak ditemukan`, 404);
    if (action === "insert" && (item.target.existing_pengawasan_count > 0 || item.target.existing_pdf_link)) {
        throw new AppError(`Pengawasan ${item.source.nomor_ulok} H${item.source.h_day} sudah ada. Pilih replace/update PDF atau skip.`, 409);
    }
    if ((action === "replace_pengawasan" || action === "update_pdf") && !item.target.pengawasan_gantt_id && action === "update_pdf") {
        throw new AppError(`Berkas pengawasan existing untuk source ${item.source_pengawasan_id} belum ada. Gunakan insert/replace.`, 404);
    }

    const idPic = await ensurePicPengawasan(client, item);
    const idPengawasanGantt = await ensurePengawasanGantt(client, item, idPic);

    if (action === "update_pdf") {
        await upsertBerkasPengawasan(client, idPengawasanGantt, item.source.link_pdf);
        return { action, source_pengawasan_id: item.source_pengawasan_id, status: "updated_pdf", inserted_items: 0, target_pengawasan_gantt_id: idPengawasanGantt };
    }

    if (action === "replace_pengawasan") {
        await client.query(`DELETE FROM pengawasan WHERE id_pengawasan_gantt = $1`, [idPengawasanGantt]);
    }

    const insertedItems = await insertPengawasanItems(client, item, idPengawasanGantt);
    const updatedDelayRows = await applyReconstructedDelays(client, item);
    await upsertBerkasPengawasan(client, idPengawasanGantt, item.source.link_pdf);
    return {
        action,
        source_pengawasan_id: item.source_pengawasan_id,
        status: action === "replace_pengawasan" ? "replaced" : "inserted",
        inserted_items: insertedItems,
        updated_delay_rows: updatedDelayRows,
        target_pengawasan_gantt_id: idPengawasanGantt
    };
};

export const pengawasanMigrationService = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Pengawasan", 403);
        }

        const items = await buildWorkItems(buffer);
        let readyCount = 0;
        let conflictCount = 0;
        let invalidCount = 0;
        let missingTargetCount = 0;
        let missingGanttCount = 0;
        let pdfPendingCount = 0;
        let existingPdfPendingCount = 0;
        let totalPengawasanItems = 0;
        let reconstructedCount = 0;

        const details = items.map((item) => {
            const canSavePdfPending = !item.target?.gantt_id && Boolean(item.source.link_pdf);
            const state = item.existing_pending_pdf_id
                ? "pdf_saved"
                : canSavePdfPending
                    ? "pdf_pending"
                : item.issues.length > 0
                    ? "invalid"
                : item.target && (item.target.existing_pengawasan_count > 0 || item.target.existing_pdf_link)
                    ? "conflict"
                    : "ready";
            if (state === "ready") readyCount += 1;
            if (state === "conflict") conflictCount += 1;
            if (state === "invalid") invalidCount += 1;
            if (state === "pdf_pending") pdfPendingCount += 1;
            if (state === "pdf_saved") existingPdfPendingCount += 1;
            if (!item.target) missingTargetCount += 1;
            if (item.target && !item.target.gantt_id) missingGanttCount += 1;
            totalPengawasanItems += item.pekerjaan.length;
            if (item.mapping_mode === "reconstructed") reconstructedCount += 1;

            return {
                source_pengawasan_id: item.source_pengawasan_id,
                sheet_name: item.source.sheet_name,
                row_number: item.source.row_number,
                h_day: item.source.h_day,
                nomor_ulok: item.source.nomor_ulok,
                lingkup_pekerjaan: item.target?.lingkup_pekerjaan ?? "",
                nama_toko: item.target?.nama_toko ?? item.pic?.nama_toko ?? "",
                cabang: item.target?.cabang ?? "",
                tanggal_mulai_spk: item.pic?.tanggal_mulai_spk ?? item.target?.tanggal_mulai_spk ?? "",
                tanggal_pengawasan: item.tanggal_pengawasan ?? "",
                pic_building_support: item.pic?.plc_building_support ?? "",
                status_lokasi: item.source.status_lokasi ?? "",
                link_pdf: item.source.link_pdf ?? "",
                mapped_item_count: item.pekerjaan.length,
                mapping_mode: item.mapping_mode,
                carried_from_h: item.carried_from_h,
                reconstructed_delay_days: item.reconstructed_delay_days,
                reconstructed_categories: item.delay_updates.filter(
                    (update) => update.keterlambatan > 0
                ),
                gantt_id: item.target?.gantt_id ?? null,
                can_save_pdf_pending: canSavePdfPending,
                existing_pending_pdf_id: item.existing_pending_pdf_id,
                existing_pending_pdf_link: item.existing_pending_pdf_link,
                existing_pic_id: item.target?.existing_pic_id ?? null,
                existing_pengawasan_gantt_id: item.target?.pengawasan_gantt_id ?? null,
                existing_pengawasan_count: item.target?.existing_pengawasan_count ?? 0,
                existing_pdf_link: item.target?.existing_pdf_link ?? null,
                db_state: state,
                issues: item.issues,
                warnings: item.warnings
            };
        });

        return {
            total_pengawasan: items.length,
            total_item_pengawasan: totalPengawasanItems,
            ready_count: readyCount,
            conflict_count: conflictCount,
            invalid_count: invalidCount,
            missing_target_count: missingTargetCount,
            missing_gantt_count: missingGanttCount,
            pdf_pending_count: pdfPendingCount,
            existing_pdf_pending_count: existingPdfPendingCount,
            reconstructed_count: reconstructedCount,
            details
        };
    },

    async commit(buffer: Buffer, input: PengawasanMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Pengawasan", 403);
        }

        const items = await buildWorkItems(buffer);
        const itemById = new Map(items.map((item) => [item.source_pengawasan_id, item]));
        const selected = input.selections.filter((selection) => selection.action !== "skip");

        const results = await withTransaction(async (client) => {
            const rowResults = [];
            for (const selection of input.selections) {
                const item = itemById.get(selection.source_pengawasan_id);
                if (!item) {
                    throw new AppError(`source_pengawasan_id ${selection.source_pengawasan_id} tidak ditemukan di file`, 404);
                }
                rowResults.push(await applyWorkItem(client, item, selection.action));
            }

            await activityLogRepository.insert({
                entity_type: "PENGAWASAN",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_before: null,
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi Pengawasan dari file PENGAWASAN",
                metadata: {
                    total_selected: input.selections.length,
                    total_executed: selected.length,
                    source_pengawasan_ids: input.selections.map((selection) => selection.source_pengawasan_id)
                }
            }, client);

            return rowResults;
        });

        return {
            total_selected: input.selections.length,
            inserted: results.filter((row) => row.status === "inserted").length,
            replaced: results.filter((row) => row.status === "replaced").length,
            updated_pdf: results.filter((row) => row.status === "updated_pdf").length,
            saved_pdf_pending: results.filter((row) => row.status === "saved_pdf_pending").length,
            skipped: results.filter((row) => row.status === "skipped").length,
            inserted_items: results.reduce((sum, row) => sum + row.inserted_items, 0),
            updated_delay_rows: results.reduce(
                (sum, row) => sum + ("updated_delay_rows" in row ? Number(row.updated_delay_rows ?? 0) : 0),
                0
            ),
            details: results
        };
    }
};
