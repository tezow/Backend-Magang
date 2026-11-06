import type { sheets_v4 } from "googleapis";
import { AppError } from "../../common/app-error";
import { getRabPriceBranch } from "../../common/branch-scope";
import { GoogleProvider } from "../../common/google";
import { BRANCH_TO_ULOK_MAP, SBO_SPREADSHEET_ID, SPREADSHEET_IDS } from "./price-rab.constants";

type PriceValue = number | "Kondisional" | "SBO";

type PriceItem = {
    "Jenis Pekerjaan": string;
    "Satuan": string;
    "Harga Material": PriceValue;
    "Harga Upah": PriceValue;
    "Input Material Manual"?: boolean;
    "Input Upah Manual"?: boolean;
};

export type PriceResult = Record<string, PriceItem[]>;

function safeToFloat(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "-") return 0;
        const parsed = Number(trimmed.replaceAll(",", ""));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function hasNumericPrice(value: unknown): boolean {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "string") return false;

    const trimmed = value.trim();
    if (!trimmed || trimmed === "-") return false;

    const parsed = Number(trimmed.replaceAll(",", ""));
    return Number.isFinite(parsed);
}

function isBebanKontraktor(value: unknown): boolean {
    if (typeof value !== "string") return false;
    return value.trim().toLowerCase().includes("kontraktor");
}

function isTextPriceDirective(value: unknown): boolean {
    if (typeof value !== "string") return false;

    const trimmed = value.trim();
    return Boolean(trimmed && trimmed !== "-" && !hasNumericPrice(trimmed) && !isBebanKontraktor(trimmed));
}

function processPriceValue(rawValue: unknown): PriceValue {
    const valueStr = String(rawValue ?? "").trim().toLowerCase();
    if (valueStr === "kondisional") return "Kondisional";
    if (valueStr === "sbo") return "SBO";
    if (valueStr.includes("kontraktor")) return 0;
    return safeToFloat(rawValue);
}

function processMaterialUpahValues(
    materialRaw: unknown,
    upahRaw: unknown,
    hasMaterialTextDirective = isTextPriceDirective(materialRaw)
): Pick<PriceItem, "Harga Material" | "Harga Upah" | "Input Material Manual" | "Input Upah Manual"> {
    if (hasMaterialTextDirective) {
        return {
            "Harga Material": 0,
            "Harga Upah": 0,
            "Input Material Manual": false,
            "Input Upah Manual": true
        };
    }

    const upahManual = isTextPriceDirective(upahRaw);

    return {
        "Harga Material": processPriceValue(materialRaw),
        "Harga Upah": upahManual ? 0 : processPriceValue(upahRaw),
        "Input Material Manual": false,
        "Input Upah Manual": upahManual
    };
}

function normalizeSheetText(value: unknown): string {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function isRomanCategoryCode(value: unknown): boolean {
    const normalized = normalizeSheetText(value).replace(/\./g, "").toUpperCase();
    return /^[IVXLCDM]+$/.test(normalized);
}

const ME_CATEGORY_NAMES = new Set(["INSTALASI", "FIXTURE", "PEKERJAAN TAMBAHAN", "PEKERJAAN SBO"]);

function isKnownMeCategoryName(value: unknown): boolean {
    return ME_CATEGORY_NAMES.has(normalizeCategoryName(value));
}

function findCategoryName(row: string[][][number], fallbackIndex: number): string {
    const fallback = normalizeSheetText(row[fallbackIndex]);
    if (fallback) return fallback;

    const categoryCell = row
        .map((cell) => normalizeSheetText(cell))
        .find((cell) => /^PEKERJAAN\b/i.test(cell) || isKnownMeCategoryName(cell));

    return categoryCell ?? "";
}

function normalizeCategoryName(value: unknown): string {
    return normalizeSheetText(value).toUpperCase();
}

function isValidCategoryName(value: unknown, lingkup: "ME" | "SIPIL"): boolean {
    const normalized = normalizeCategoryName(value);
    if (/^PEKERJAAN\b/i.test(normalized)) return true;
    return lingkup === "ME" && isKnownMeCategoryName(normalized);
}

function isCategoryRow(
    row: string[][][number],
    lingkup: "ME" | "SIPIL",
    noColIndex: number,
    jenisPekerjaanColIndex: number,
    satColIndex: number
): boolean {
    const noVal = normalizeSheetText(row[noColIndex]);
    const satuanVal = normalizeSheetText(row[satColIndex]);
    const categoryName = findCategoryName(row, jenisPekerjaanColIndex);
    const hasRomanCategoryMarker = row.slice(0, Math.max(jenisPekerjaanColIndex, 1)).some(isRomanCategoryCode);

    if (!categoryName || !isValidCategoryName(categoryName, lingkup)) return false;
    if (isRomanCategoryCode(noVal) || hasRomanCategoryMarker) return true;

    // Some ME sheets put section headers like "INSTALASI" without roman markers.
    return lingkup === "ME" && !satuanVal && isKnownMeCategoryName(categoryName);
}

function findHeaderColumn(
    allValues: string[][],
    targetHeaderRowIndex: number,
    matcher: (value: string) => boolean,
    fallbackIndex: number,
    startIndex = 0
): number {
    const startRow = Math.max(0, targetHeaderRowIndex - 2);
    const endRow = targetHeaderRowIndex;
    const maxColumns = Math.max(...allValues.slice(startRow, endRow + 1).map((row) => row.length), 0);

    for (let col = startIndex; col < maxColumns; col++) {
        const headerText = allValues
            .slice(startRow, endRow + 1)
            .map((row) => normalizeSheetText(row[col]).toLowerCase())
            .filter(Boolean)
            .join(" ");

        if (matcher(headerText)) return col;
    }

    return fallbackIndex;
}

function normalizeCabangInput(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/_+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^CAB(?:ANG)?\.?\s+/, "")
        .replace(/^CABANG\s+/, "")
        .trim();
}

function normalizeLingkupInput(value: string): "ME" | "SIPIL" {
    const normalized = value.trim().toUpperCase();
    if (normalized.includes("SIPIL")) return "SIPIL";
    if (normalized.includes("ME")) return "ME";
    return normalized as "ME" | "SIPIL";
}

async function getFirstSheetName(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<string> {
    const meta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(title))"
    });

    const sheetName = meta.data.sheets?.[0]?.properties?.title;
    if (!sheetName) {
        throw new AppError("Sheet pertama tidak ditemukan", 500);
    }

    return sheetName;
}

function processSheet(allValues: string[][], lingkup: "ME" | "SIPIL"): PriceResult {
    const categorizedPrices: PriceResult = {};
    let currentCategory = "";

    const defaultNoColIndex = 1;
    const defaultJenisPekerjaanColIndex = 3;
    const defaultSatColIndex = 4;

    const targetHeaderRowIndex = lingkup === "SIPIL" ? 16 : 13;
    if (allValues.length <= targetHeaderRowIndex) {
        throw new AppError(`Baris header tidak ditemukan di sheet untuk lingkup ${lingkup}.`, 500);
    }

    const noColIndex = findHeaderColumn(
        allValues,
        targetHeaderRowIndex,
        (text) => /\bno\.?\b/.test(text),
        defaultNoColIndex
    );
    const jenisPekerjaanColIndex = findHeaderColumn(
        allValues,
        targetHeaderRowIndex,
        (text) => text.includes("jenis pekerjaan"),
        defaultJenisPekerjaanColIndex
    );
    const satColIndex = findHeaderColumn(
        allValues,
        targetHeaderRowIndex,
        (text) => /\bsatuan\b/.test(text),
        defaultSatColIndex
    );
    const materialColIndex = findHeaderColumn(
        allValues,
        targetHeaderRowIndex,
        (text) => text.includes("material"),
        -1,
        satColIndex + 1
    );
    const upahColIndex = findHeaderColumn(
        allValues,
        targetHeaderRowIndex,
        (text) => text.includes("upah"),
        -1,
        satColIndex + 1
    );

    if (materialColIndex === -1 || upahColIndex === -1) {
        throw new AppError(`Error pada header untuk lingkup ${lingkup}: Header 'Material' atau 'Upah' tidak ditemukan.`, 500);
    }

    for (const row of allValues) {
        const noVal = normalizeSheetText(row[noColIndex]);
        const jenisPekerjaan = normalizeSheetText(row[jenisPekerjaanColIndex]);

        if (isCategoryRow(row, lingkup, noColIndex, jenisPekerjaanColIndex, satColIndex)) {
            const categoryName = findCategoryName(row, jenisPekerjaanColIndex);
            currentCategory = normalizeCategoryName(categoryName);
            if (!categorizedPrices[currentCategory]) categorizedPrices[currentCategory] = [];
            continue;
        }

        if (!jenisPekerjaan) {
            continue;
        }

        if (!noVal || jenisPekerjaan.toUpperCase() === "JENIS PEKERJAAN") {
            continue;
        }

        const satuanVal = normalizeSheetText(row[satColIndex]);
        if (!satuanVal) continue;
        if (!currentCategory) continue;

        const hargaMaterialRaw = row[materialColIndex] ?? "0";
        const hargaUpahRaw = row[upahColIndex] ?? "0";
        const priceAreaStart = Math.min(materialColIndex, upahColIndex, satColIndex + 1);
        const priceAreaEnd = Math.max(materialColIndex, upahColIndex, row.length - 1);
        const hasMaterialTextDirective = row
            .slice(priceAreaStart, priceAreaEnd + 1)
            .some((cell) => isTextPriceDirective(cell));
        const priceValues = processMaterialUpahValues(hargaMaterialRaw, hargaUpahRaw, hasMaterialTextDirective);

        const itemData: PriceItem = {
            "Jenis Pekerjaan": jenisPekerjaan,
            "Satuan": satuanVal,
            ...priceValues
        };

        if (!categorizedPrices[currentCategory]) categorizedPrices[currentCategory] = [];
        categorizedPrices[currentCategory].push(itemData);
    }

    return categorizedPrices;
}

function processSboSheet(records: Record<string, string>[], cabangKode: string, lingkup: "ME" | "SIPIL"): PriceResult {
    const sboItems: PriceItem[] = [];

    for (const record of records) {
        if (String(record["Lingkup_Pekerjaan"] ?? "").toUpperCase() !== lingkup) {
            continue;
        }

        const kodeCabangRaw = String(record["Kode Cabang"] ?? "");
        if (!kodeCabangRaw.split(",").map((v) => v.trim()).includes(cabangKode)) {
            continue;
        }

        sboItems.push({
            "Jenis Pekerjaan": String(record["Item Pekerjaan"] ?? ""),
            "Satuan": String(record["Satuan"] ?? ""),
            "Harga Material": processPriceValue(record["Harga Material"]),
            "Harga Upah": 0
        });
    }

    return sboItems.length ? { "PEKERJAAN SBO": sboItems } : {};
}

export const priceRabService = {
    async getData(cabangRaw: string, lingkupRaw: string): Promise<PriceResult> {
        const requestedCabang = normalizeCabangInput(cabangRaw);
        const cabang = getRabPriceBranch(requestedCabang);
        const lingkup = normalizeLingkupInput(lingkupRaw);

        if (!SPREADSHEET_IDS[cabang] || !SPREADSHEET_IDS[cabang][lingkup]) {
            throw new AppError("Invalid 'cabang' or 'lingkup' parameter", 404);
        }

        const spreadsheetId = SPREADSHEET_IDS[cabang][lingkup];

        const gp = GoogleProvider.instance;
        const sheets = gp.spartaSheets;

        if (!sheets) {
            throw new AppError("Google Sheets (Sparta) belum terkonfigurasi", 500);
        }

        const sourceSheetName = await getFirstSheetName(sheets, spreadsheetId);
        const allValues = await gp.getAllValues(sheets, spreadsheetId, sourceSheetName);

        const processedData = processSheet(allValues, lingkup);

        const cabangKode = BRANCH_TO_ULOK_MAP[cabang];
        if (cabangKode) {
            try {
                const sboSheetName = await getFirstSheetName(sheets, SBO_SPREADSHEET_ID);
                const sboRecords = await gp.getAllRecords(sheets, SBO_SPREADSHEET_ID, sboSheetName);
                const sboData = processSboSheet(sboRecords, cabangKode, lingkup);
                Object.assign(processedData, sboData);
            } catch (err) {
                console.warn("Warning: Could not fetch or process SBO data:", err);
            }
        }

        return processedData;
    }
};
