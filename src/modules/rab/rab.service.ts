import { AppError } from "../../common/app-error";
import { emailNotificationService } from "../email-notification/email-notification.service";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import { getBranchScopeCandidates, getRabPriceBranch, isSameBranchScope, normalizeBranchScopeName } from "../../common/branch-scope";
import { GoogleProvider } from "../../common/google";
import { normalizeProjectByUlok } from "../../common/project-type";
import { env } from "../../config/env";
import { tokoRepository } from "../toko/toko.repository";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import type { ApprovalActionInput } from "../approval/approval.schema";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { pool } from "../../db/pool";
import { generateStandardFilename } from "../../common/filename-helper";
import { SUPPORTED_PRICE_BRANCHES } from "../price-rab/price-rab.constants";
import { priceRabService, type PriceResult } from "../price-rab/price-rab.service";
import { projekPlanningRepository } from "../project-planning/project-planning.repository";
import type { ProjekPlanningRow } from "../project-planning/project-planning.repository";
import { PP_STATUS } from "../project-planning/project-planning.constants";
import { RAB_STATUS, REJECTED_RAB_STATUSES, type RabStatus } from "./rab.constants";
import { ganttRepository } from "../gantt/gantt.repository";
import { buildRabPdfBuffer, buildRecapPdfBuffer, extractMateraiCoverPageBuffer, mergePdfBuffers, generateSphPdf } from "./rab.pdf";
import { rabRepository } from "./rab.repository";
import type { RabItemRow } from "./rab.repository";
import type {
    DeleteRabItemsInput,
    DetailItemInput,
    RabListQuery,
    SubmitRabInput,
    UpdateRabItemInput,
    UpdateRabStatusInput
} from "./rab.schema";

interface UploadedFile {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}

interface SubmitUploadedFiles {
    insuranceFile?: UploadedFile;
    revInsuranceFile?: UploadedFile;
    revLogoFile?: UploadedFile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const logRab = (stage: string, message: string, meta?: Record<string, unknown>): void => {
    if (meta) {
        console.log(`[RAB][${stage}] ${message}`, meta);
        return;
    }
    console.log(`[RAB][${stage}] ${message}`);
};

const roundCurrency = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value);
};

const computeTotals = (detailItems: DetailItemInput[], isNoPpn: boolean = false) => {
    let grandTotal = 0;
    let totalNonSbo = 0;

    for (const item of detailItems) {
        const totalItem = roundCurrency(
            item.total_harga ?? (item.volume * (item.harga_material + item.harga_upah))
        );
        grandTotal += totalItem;

        if (item.kategori_pekerjaan.trim().toUpperCase() !== "PEKERJAAN SBO") {
            totalNonSbo += totalItem;
        }
    }

    const roundedDown = Math.floor(grandTotal / 10000) * 10000;
    const finalGrandTotal = isNoPpn ? roundCurrency(roundedDown) : roundCurrency(roundedDown + roundedDown * 0.11);

    return {
        grandTotal,
        totalNonSbo,
        finalGrandTotal
    };
};


const resolveTotals = (
    detailItems: DetailItemInput[],
    manual?: {
        grand_total?: number;
        grand_total_non_sbo?: number;
        grand_total_final?: number;
    },
    isNoPpn: boolean = false
) => {
    const hasAny = manual
        && (manual.grand_total !== undefined
            || manual.grand_total_non_sbo !== undefined
            || manual.grand_total_final !== undefined);

    if (!hasAny) {
        return computeTotals(detailItems, isNoPpn);
    }

    const { grand_total, grand_total_non_sbo, grand_total_final } = manual ?? {};
    const allPresent = grand_total !== undefined
        && grand_total_non_sbo !== undefined
        && grand_total_final !== undefined;

    if (!allPresent) {
        throw new AppError("Grand total manual harus diisi lengkap (grand_total, grand_total_non_sbo, grand_total_final)", 422);
    }

    if (!Number.isFinite(grand_total) || !Number.isFinite(grand_total_non_sbo) || !Number.isFinite(grand_total_final)) {
        throw new AppError("Grand total manual tidak valid", 422);
    }

    return {
        grandTotal: roundCurrency(grand_total),
        totalNonSbo: roundCurrency(grand_total_non_sbo),
        finalGrandTotal: roundCurrency(grand_total_final)
    };
};

const normalizeDetailItems = (items: RabItemRow[]): DetailItemInput[] => {
    return items.map((item) => ({
        kategori_pekerjaan: item.kategori_pekerjaan,
        jenis_pekerjaan: item.jenis_pekerjaan,
        satuan: item.satuan,
        volume: Number(item.volume) || 0,
        harga_material: Number(item.harga_material) || 0,
        harga_upah: Number(item.harga_upah) || 0,
        total_material: Number(item.total_material) || 0,
        total_upah: Number(item.total_upah) || 0,
        total_harga: Number(item.total_harga) || 0,
        catatan: item.catatan ?? undefined
    }));
};

const numericCurrencyValue = (value: number | string | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    const numeric = Number(String(value).trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(numeric) ? numeric : 0;
};

const hasRenderableRabValue = (data: { rab: { grand_total?: string | null; grand_total_non_sbo?: string | null; grand_total_final?: string | null }; items: RabItemRow[] }): boolean => {
    const itemTotal = data.items.reduce((acc, item) => acc + numericCurrencyValue(item.total_harga), 0);
    return itemTotal > 0
        || numericCurrencyValue(data.rab.grand_total) > 0
        || numericCurrencyValue(data.rab.grand_total_non_sbo) > 0
        || numericCurrencyValue(data.rab.grand_total_final) > 0;
};

type NumericPrice = {
    category: string;
    jenisPekerjaan: string;
    satuan: string;
    hargaMaterial: number | null;
    hargaUpah: number | null;
    inputMaterialManual: boolean;
    inputUpahManual: boolean;
};

type PriceLookup = {
    byJob: Map<string, NumericPrice>;
    byCategoryAndJob: Map<string, NumericPrice>;
    candidates: NumericPrice[];
};

const normalizePriceLookupKey = (value: string): string => {
    return value
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .trim();
};

const FUZZY_JOB_MATCH_THRESHOLD = 0.82;
const FUZZY_JOB_MATCH_MARGIN = 0.06;
const JOB_MATCH_STOPWORDS = new Set([
    "pekerjaan", "pasang", "pemasangan", "merk", "ukuran", "warna",
    "dan", "atau", "dengan", "untuk", "unit", "buah", "set", "type",
    "model", "khusus", "lokal", "full", "panel", "menggunakan"
]);

const normalizeJobTokenText = (value?: string | null): string =>
    String(value ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

const tokenizeJobName = (value?: string | null): string[] =>
    normalizeJobTokenText(value)
        .replace(/\baccesories\b/g, "accessories")
        .replace(/\baksesoris\b/g, "accessories")
        .replace(/\binclude\b/g, "include")
        .replace(/\binc\b/g, "include")
        .replace(/\babu abu\b/g, "abuabu")
        .split(" ")
        .filter((token) => token.length > 1 && !JOB_MATCH_STOPWORDS.has(token));

const levenshteinDistance = (left: string, right: string): number => {
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array(right.length + 1).fill(0);

    for (let i = 1; i <= left.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + substitutionCost
            );
        }
        for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
    }

    return previous[right.length];
};

const stringSimilarity = (left: string, right: string): number => {
    const a = normalizePriceLookupKey(left);
    const b = normalizePriceLookupKey(right);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const maxLength = Math.max(a.length, b.length);
    return maxLength === 0 ? 0 : 1 - (levenshteinDistance(a, b) / maxLength);
};

const tokenSimilarity = (left: string, right: string): number => {
    const leftTokens = new Set(tokenizeJobName(left));
    const rightTokens = new Set(tokenizeJobName(right));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    let overlap = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) overlap += 1;
    });

    return (2 * overlap) / (leftTokens.size + rightTokens.size);
};

const fuzzyJobScore = (left?: string | null, right?: string | null): number => {
    const a = normalizePriceLookupKey(left ?? "");
    const b = normalizePriceLookupKey(right ?? "");
    if (!a || !b) return 0;
    if (a === b) return 1;

    const stringScore = stringSimilarity(a, b);
    const tokenScore = tokenSimilarity(a, b);
    const containsBonus = a.includes(b) || b.includes(a) ? 0.08 : 0;
    return Math.min(1, Math.max(stringScore, (tokenScore * 0.78) + (stringScore * 0.22) + containsBonus));
};

const hasAllTokens = (tokens: Set<string>, requiredTokens: string[]): boolean =>
    requiredTokens.every((token) => tokens.has(token));

const semanticJobMatchScore = (left?: string | null, right?: string | null): number => {
    const leftTokens = new Set(tokenizeJobName(left));
    const rightTokens = new Set(tokenizeJobName(right));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    const hasBoth = (requiredTokens: string[]) =>
        hasAllTokens(leftTokens, requiredTokens) && hasAllTokens(rightTokens, requiredTokens);

    if (hasBoth(["paving", "block", "parkir", "press", "mesin"])) return 0.92;
    if (hasBoth(["pintu", "kamar", "mandi", "upvc", "handle", "kunci", "knob"])) return 0.9;
    if (hasBoth(["tempat", "sampah", "liter"])) return 0.88;

    return 0;
};

const priceValueToNumberOrNull = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || /^(kondisional|sbo)$/i.test(trimmed)) return null;
        if (trimmed.toLowerCase().includes('kontraktor')) return 0;
        const parsed = Number(trimmed.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const isManualInputFlag = (value: unknown): boolean =>
    value === true || value === 1 || String(value ?? "").trim().toLowerCase() === "true";

const buildPriceLookup = (priceData: PriceResult): PriceLookup => {
    const byJob = new Map<string, NumericPrice>();
    const byCategoryAndJob = new Map<string, NumericPrice>();
    const candidates: NumericPrice[] = [];

    for (const [category, items] of Object.entries(priceData)) {
        for (const item of items) {
            const jenisPekerjaan = item["Jenis Pekerjaan"] ?? "";
            const key = normalizePriceLookupKey(jenisPekerjaan);
            if (!key) continue;

            const price = {
                category,
                jenisPekerjaan,
                satuan: item["Satuan"] ?? "",
                hargaMaterial: priceValueToNumberOrNull(item["Harga Material"]),
                hargaUpah: priceValueToNumberOrNull(item["Harga Upah"]),
                inputMaterialManual: isManualInputFlag(item["Input Material Manual"]),
                inputUpahManual: isManualInputFlag(item["Input Upah Manual"])
            };

            byCategoryAndJob.set(`${normalizePriceLookupKey(category)}|${key}`, price);
            if (!byJob.has(key)) byJob.set(key, price);
            candidates.push(price);
        }
    }

    return { byJob, byCategoryAndJob, candidates };
};

const findBestPriceMatch = (
    lookup: PriceLookup,
    category: string,
    jenisPekerjaan: string
): NumericPrice | null => {
    const categoryKey = normalizePriceLookupKey(category);
    const jobKey = normalizePriceLookupKey(jenisPekerjaan);
    if (!jobKey) return null;

    const exactCategoryMatch = lookup.byCategoryAndJob.get(`${categoryKey}|${jobKey}`);
    if (exactCategoryMatch) return exactCategoryMatch;

    const exactJobMatch = lookup.byJob.get(jobKey);
    if (exactJobMatch) return exactJobMatch;

    const ranked = lookup.candidates
        .map((candidate) => {
            const sameCategory = normalizePriceLookupKey(candidate.category) === categoryKey;
            const baseScore = fuzzyJobScore(jenisPekerjaan, candidate.jenisPekerjaan);
            const semanticScore = semanticJobMatchScore(jenisPekerjaan, candidate.jenisPekerjaan);
            const score = Math.max(baseScore, semanticScore) + (sameCategory ? 0.04 : 0);
            return { candidate, score, sameCategory, baseScore, semanticScore };
        })
        .filter((item) => item.score >= FUZZY_JOB_MATCH_THRESHOLD)
        .sort((a, b) => (b.score - a.score) || (b.baseScore - a.baseScore));

    if (ranked.length === 0) return null;
    const [best, second] = ranked;
    const bestHasSemanticTieBreaker =
        Boolean(second)
        && best.semanticScore > 0
        && best.sameCategory
        && second.sameCategory
        && best.baseScore - second.baseScore >= 0.01;
    if (
        second
        && best.score - second.score < FUZZY_JOB_MATCH_MARGIN
        && !(best.sameCategory && !second.sameCategory)
        && !bestHasSemanticTieBreaker
    ) return null;

    return best.candidate;
};

const hasSuperHumanRole = (role?: string | null): boolean => {
    return String(role ?? "").trim().toUpperCase().includes("SUPER HUMAN");
};

const normalizeLingkupForPrice = (value?: string | null): "ME" | "SIPIL" | null => {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (normalized.includes("SIPIL")) return "SIPIL";
    if (normalized.includes("ME")) return "ME";
    return null;
};

const normalizeComparableText = (value?: string | null): string => {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\b(PT|CV)\b\.?/g, "") // Remove PT and CV
        .replace(/[^A-Z0-9]/g, "");     // Remove spaces and symbols for robust matching
};

const isPlaceholderText = (value?: string | null): boolean => {
    const normalized = normalizeComparableText(value);
    return !normalized || normalized === "-" || normalized === "N/A" || normalized === "NULL" || normalized === "NAMAPTTIDAKDITEMUKAN";
};

const normalizeCabangForPrice = (value?: string | null): string => {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/^CAB(?:ANG)?\.?\s+/, "")
        .replace(/^CABANG\s+/, "")
        .trim();
};

const usesRabParentPrice = (cabang?: string | null): boolean => {
    const normalized = normalizeBranchScopeName(cabang);
    const priceBranch = getRabPriceBranch(normalized);
    return SUPPORTED_PRICE_BRANCHES.includes(priceBranch);
};

const findUserCabangByEmailAndBranchScope = async (email: string, branch: string) => {
    const branchCandidates = getBranchScopeCandidates(branch);
    const rows = await Promise.all(
        branchCandidates.map(candidate =>
            userCabangRepository.findAll({ email_sat: email, cabang: candidate })
        )
    );

    const seen = new Set<number>();
    return rows.flat().filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
    });
};

const validateSubmitterCompanyMapping = async (payload: SubmitRabInput): Promise<string> => {
    const submittedNamaPt = String(payload.nama_pt ?? "").trim();
    if (isPlaceholderText(submittedNamaPt)) {
        throw new AppError("Nama PT/CV kontraktor wajib terisi sebelum submit RAB.", 422);
    }

    const emailPembuat = String(payload.email_pembuat ?? "").trim();
    const cabang = String(payload.cabang ?? "").trim();
    if (!emailPembuat || !cabang) return submittedNamaPt;

    const mappedUsers = await findUserCabangByEmailAndBranchScope(emailPembuat, cabang);
    const mappedCompanies = Array.from(new Set(
        mappedUsers
            .map(user => user.nama_pt)
            .filter((namaPt): namaPt is string => !isPlaceholderText(namaPt))
            .map(normalizeComparableText)
    ));

    if (mappedCompanies.length > 0 && !mappedCompanies.includes(normalizeComparableText(submittedNamaPt))) {
        throw new AppError(
            `Nama PT/CV "${submittedNamaPt}" tidak sesuai dengan mapping user cabang ${cabang}. Silakan periksa data user cabang sebelum submit RAB.`,
            422
        );
    }

    return submittedNamaPt;
};

const getRabContractorCompany = (data: { rab: { nama_pt?: string | null }; toko: { nama_kontraktor?: string | null } }): string => {
    const rabCompany = String(data.rab.nama_pt ?? "").trim();
    if (!isPlaceholderText(rabCompany)) return rabCompany;

    const tokoCompany = String(data.toko.nama_kontraktor ?? "").trim();
    if (!isPlaceholderText(tokoCompany)) return tokoCompany;

    throw new AppError("Nama PT/CV RAB belum valid. Perbaiki data RAB sebelum approval Direktur Kontraktor.", 422);
};

const validateDirectorContractorApprovalCompany = async (
    data: { rab: { nama_pt?: string | null }; toko: { cabang?: string | null; nama_kontraktor?: string | null } },
    action: ApprovalActionInput
): Promise<void> => {
    if (action.jabatan !== "DIREKTUR" || action.tindakan !== "APPROVE") return;

    const targetCompany = getRabContractorCompany(data);
    const cabang = String(data.toko.cabang ?? "").trim();
    const approverEmail = String(action.approver_email ?? "").trim();
    if (!cabang || !approverEmail) {
        throw new AppError("Data cabang atau email approver tidak valid untuk approval Direktur Kontraktor.", 422);
    }

    const approverRows = await findUserCabangByEmailAndBranchScope(approverEmail, cabang);
    const approverCompanies = Array.from(new Set(
        approverRows
            .map(user => user.nama_pt)
            .filter((namaPt): namaPt is string => !isPlaceholderText(namaPt))
            .map(normalizeComparableText)
    ));

    if (approverCompanies.length === 0) {
        throw new AppError(
            `Approver ${approverEmail} belum punya mapping PT/CV untuk cabang ${cabang} atau cabang satu grupnya.`,
            422
        );
    }

    if (!approverCompanies.includes(normalizeComparableText(targetCompany))) {
        throw new AppError(
            `Approver ${approverEmail} tidak sesuai dengan PT/CV RAB ${targetCompany}.`,
            403
        );
    }
};

const isBranchSupportRole = (jabatan?: string | null): boolean =>
    String(jabatan ?? "").trim().toUpperCase().includes("BRANCH BUILDING SUPPORT");

const matchesInternalApprovalRole = (userJabatan: string | null | undefined, actionJabatan: ApprovalActionInput["jabatan"]): boolean => {
    const role = String(userJabatan ?? "").trim().toUpperCase();
    if (actionJabatan === "KOORDINATOR") return role.includes("BRANCH BUILDING COORDINATOR") || role === "BBC";
    if (actionJabatan === "MANAGER") return role.includes("BRANCH BUILDING & MAINTENANCE MANAGER") || role.includes("MAINTENANCE MANAGER") || role === "BBMM";
    return false;
};

const canInternalUserAccessBranch = (user: { cabang?: string | null; jabatan?: string | null; coverage?: string[] }, targetCabang: string): boolean => {
    const normalizedTarget = normalizeCabangForPrice(targetCabang);
    if (!normalizedTarget) return false;

    if (isBranchSupportRole(user.jabatan)) {
        const scopeCandidates = getBranchScopeCandidates(user.cabang);
        return scopeCandidates.includes(normalizedTarget);
    }

    const coverage = (user.coverage ?? []).map(normalizeCabangForPrice).filter(Boolean);
    if (coverage.length > 0) return coverage.includes(normalizedTarget);
    
    // FIX: Use branch group scope instead of exact match
    // User with cabang "SIDOARJO" should be able to approve "SIDOARJO BPN SMD"
    const userBranchScope = getBranchScopeCandidates(user.cabang);
    return userBranchScope.map(normalizeCabangForPrice).includes(normalizedTarget);
};

const validateInternalApprovalBranchAccess = async (
    data: { toko: { cabang?: string | null } },
    action: ApprovalActionInput
): Promise<void> => {
    if (!["KOORDINATOR", "MANAGER"].includes(action.jabatan)) return;

    const cabang = String(data.toko.cabang ?? "").trim();
    const approverEmail = String(action.approver_email ?? "").trim();
    if (!cabang || !approverEmail) {
        throw new AppError("Data cabang atau email approver tidak valid untuk approval.", 422);
    }

    console.log('[RAB APPROVAL] Internal branch access validation:', {
        approverEmail,
        actionJabatan: action.jabatan,
        documentCabang: cabang
    });

    const approverRows = await userCabangRepository.findAll({ email_sat: approverEmail });
    console.log('[RAB APPROVAL] Found approver rows:', approverRows.length);
    
    const matchingRoleRows = approverRows.filter(user => matchesInternalApprovalRole(user.jabatan, action.jabatan));
    console.log('[RAB APPROVAL] Matching role rows:', matchingRoleRows.length, matchingRoleRows.map(r => ({ cabang: r.cabang, jabatan: r.jabatan })));
    
    const canAccess = matchingRoleRows.some(user => canInternalUserAccessBranch(user, cabang));
    console.log('[RAB APPROVAL] Internal access result:', { canAccess });

    if (!canAccess) {
        throw new AppError(`Approver ${approverEmail} tidak memiliki akses approval untuk cabang ${cabang}.`, 403);
    }
};

const validateRabCoordinatorAdditionalInfo = (action: ApprovalActionInput): void => {
    if (action.tindakan !== "APPROVE" || action.jabatan !== "KOORDINATOR") return;

    if (!action.beanspot_type) {
        throw new AppError("Beanspot wajib dipilih saat coordinator approve RAB.", 422);
    }
    if (typeof action.is_hth !== "boolean") {
        throw new AppError("HTH wajib dipilih saat coordinator approve RAB.", 422);
    }
    if (action.is_hth === true && !action.hth_meter) {
        throw new AppError("Meter HTH wajib diisi saat HTH dipilih Ya.", 422);
    }
    if (typeof action.is_fasade !== "boolean") {
        throw new AppError("Fasade wajib dipilih saat coordinator approve RAB.", 422);
    }
};

const splitProjectPlanningSelections = (value?: string | null): string[] =>
    String(value ?? "")
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

const normalizeRabBeanspotType = (value?: string | null): "TIDAK" | "ADVANCE" | "MEDIUM" | "RTD_ONLY" | null => {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (!normalized) return null;
    if (normalized === "BASIC" || normalized === "RTD" || normalized === "RTD_ONLY") return "RTD_ONLY";
    if (normalized === "ADVANCE") return "ADVANCE";
    if (normalized === "MEDIUM") return "MEDIUM";
    if (normalized === "TIDAK") return "TIDAK";
    return null;
};

const buildRabCoordinatorInfoPrefill = (
    rab: {
        beanspot_type?: string | null;
        is_hth?: boolean | null;
        hth_meter?: string | null;
        is_fasade?: boolean | null;
    },
    projek?: ProjekPlanningRow | null
) => {
    const rabHasSnapshot = Boolean(rab.beanspot_type) || rab.is_hth !== null || rab.is_fasade !== null;
    if (rabHasSnapshot) {
        return {
            source: "RAB",
            beanspot_type: normalizeRabBeanspotType(rab.beanspot_type),
            is_hth: rab.is_hth ?? null,
            hth_meter: rab.hth_meter ?? null,
            is_fasade: rab.is_fasade ?? null,
        };
    }

    if (!projek) {
        return {
            source: "NONE",
            beanspot_type: null,
            is_hth: null,
            hth_meter: null,
            is_fasade: null,
        };
    }

    const selections = splitProjectPlanningSelections(projek.jenis_pengajuan);
    const isBeanSpot = selections.includes("BEAN SPOT");

    return {
        source: "FPD",
        beanspot_type: isBeanSpot ? normalizeRabBeanspotType(projek.beanspot_tipe) : "TIDAK",
        is_hth: projek.is_head_to_head ?? null,
        hth_meter: projek.is_head_to_head ? projek.jarak_head_to_head ?? null : null,
        is_fasade: selections.includes("FASADE"),
    };
};

export const syncDetailItemsWithBranchPrices = async (
    detailItems: DetailItemInput[],
    cabang?: string | null,
    lingkupPekerjaan?: string | null,
    requirePriceSync = false,
    requireEveryItemMatch = false
): Promise<DetailItemInput[]> => {
    const requestedCabangKey = normalizeCabangForPrice(cabang);
    const cabangKey = getRabPriceBranch(requestedCabangKey);
    const lingkup = normalizeLingkupForPrice(lingkupPekerjaan);

    if (!cabangKey || !lingkup) {
        if (requirePriceSync) {
            throw new AppError("Cabang dan lingkup pekerjaan wajib valid untuk sinkron harga RAB.", 422);
        }

        return detailItems;
    }

    try {
        const priceData = await priceRabService.getData(cabangKey, lingkup);
        const lookup = buildPriceLookup(priceData);
        let matchedCount = 0;
        const unmatchedItems: string[] = [];

        const syncedItems = detailItems.map((item) => {
            const price = findBestPriceMatch(lookup, item.kategori_pekerjaan, item.jenis_pekerjaan);
            if (!price) {
                unmatchedItems.push(`${item.kategori_pekerjaan} - ${item.jenis_pekerjaan}`);
                return item;
            }

            const hargaMaterial = price.inputMaterialManual
                ? item.harga_material
                : price.hargaMaterial ?? item.harga_material;
            const hargaUpah = price.inputUpahManual
                ? item.harga_upah
                : price.hargaUpah ?? item.harga_upah;
            const totalMaterial = roundCurrency(item.volume * hargaMaterial);
            const totalUpah = roundCurrency(item.volume * hargaUpah);
            matchedCount += 1;

            return {
                ...item,
                kategori_pekerjaan: price.category || item.kategori_pekerjaan,
                jenis_pekerjaan: price.jenisPekerjaan || item.jenis_pekerjaan,
                satuan: price.satuan || item.satuan,
                harga_material: hargaMaterial,
                harga_upah: hargaUpah,
                total_material: totalMaterial,
                total_upah: totalUpah,
                total_harga: totalMaterial + totalUpah
            };
        });

        logRab("PRICE_SYNC", "Harga item diselaraskan dengan cabang", {
            requested_cabang: requestedCabangKey,
            cabang: cabangKey,
            lingkup,
            total_items: detailItems.length,
            matched_items: matchedCount
        });

        if (requireEveryItemMatch && unmatchedItems.length > 0) {
            throw new AppError(
                `Beberapa item RAB revisi tidak ditemukan di master harga cabang ${cabangKey} (${lingkup}): ${unmatchedItems.slice(0, 5).join("; ")}${unmatchedItems.length > 5 ? "; ..." : ""}. ` +
                "Submit revisi dibatalkan agar harga tidak tersimpan memakai snapshot lama.",
                422
            );
        }

        return syncedItems;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (requirePriceSync) {
            throw new AppError(
                `Gagal mengambil harga satuan cabang ${cabangKey} untuk lingkup ${lingkup}. Perubahan cabang belum bisa disimpan agar harga tidak salah.`,
                502
            );
        }

        console.warn("[RAB][PRICE_SYNC] Gagal sinkron harga cabang, memakai harga dari payload:", error);
        return detailItems;
    }
};

// ---------------------------------------------------------------------------
// Branch detection helpers
// ---------------------------------------------------------------------------

/** BOGOR: tidak ada koordinator, langsung Direktur -> Manajer */
const isBogorBranch = (cabang?: string | null): boolean => {
    const normalized = String(cabang ?? "").trim().toUpperCase();
    return normalized === "BOGOR";
};

/** BATAM/BINTAN: tidak ada manajer, langsung Direktur → Koordinator */
const isBatamBranch = (cabang?: string | null): boolean => {
    const normalized = String(cabang ?? "").trim().toUpperCase();
    return normalized === "BATAM" || normalized === "BINTAN";
};

const resolveStatusTransition = (
    currentStatus: RabStatus,
    action: ApprovalActionInput,
    cabang?: string | null
): RabStatus => {
    const bogor = isBogorBranch(cabang);
    const batam = isBatamBranch(cabang);

    if (action.tindakan === "APPROVE") {
        if (action.jabatan === "DIREKTUR") {
            if (currentStatus !== RAB_STATUS.WAITING_FOR_DIREKTUR) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval direktur`, 409);
            }
            // BOGOR: skip koordinator -> langsung ke manajer
            if (bogor) return RAB_STATUS.WAITING_FOR_MANAGER;
            // Default & BATAM: ke koordinator
            return RAB_STATUS.WAITING_FOR_COORDINATOR;
        }

        if (action.jabatan === "KOORDINATOR") {
            if (currentStatus !== RAB_STATUS.WAITING_FOR_COORDINATOR) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval koordinator`, 409);
            }
            // BATAM: tidak ada manajer → langsung approved
            if (batam) return RAB_STATUS.APPROVED;
            // Default: ke manajer
            return RAB_STATUS.WAITING_FOR_MANAGER;
        }

        if (action.jabatan === "MANAGER") {
            if (currentStatus !== RAB_STATUS.WAITING_FOR_MANAGER) {
                throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk approval manager`, 409);
            }
            return RAB_STATUS.APPROVED;
        }

        throw new AppError(`Jabatan "${action.jabatan}" tidak dikenali`, 400);
    }

    // REJECT
    if (action.jabatan === "DIREKTUR") {
        if (currentStatus !== RAB_STATUS.WAITING_FOR_DIREKTUR) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject direktur`, 409);
        }
        return RAB_STATUS.REJECTED_BY_DIREKTUR;
    }

    if (action.jabatan === "KOORDINATOR") {
        if (currentStatus !== RAB_STATUS.WAITING_FOR_COORDINATOR) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject koordinator`, 409);
        }
        return RAB_STATUS.REJECTED_BY_COORDINATOR;
    }

    if (action.jabatan === "MANAGER") {
        if (currentStatus !== RAB_STATUS.WAITING_FOR_MANAGER) {
            throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject manager`, 409);
        }
        return RAB_STATUS.REJECTED_BY_MANAGER;
    }

    throw new AppError(`Status saat ini "${currentStatus}" tidak valid untuk reject direktur`, 409);
};

const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const byIdParam = /[?&]id=([^&]+)/.exec(trimmed);
    if (byIdParam?.[1]) return byIdParam[1];

    const byPath = /\/d\/([^/]+)/.exec(trimmed);
    if (byPath?.[1]) return byPath[1];

    return null;
};

const normalizeBase64Image = (value: string): { mimeType: string; buffer: Buffer } | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dataUriMatch = /^data:([\w/+.-]+);base64,(.+)$/i.exec(trimmed);
    if (dataUriMatch) {
        const [, mimeType, base64Data] = dataUriMatch;
        return { mimeType, buffer: Buffer.from(base64Data, "base64") };
    }

    const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 100;
    if (!looksLikeBase64) return null;

    return { mimeType: "image/png", buffer: Buffer.from(trimmed, "base64") };
};

const normalizeBase64Binary = (value: string): { mimeType: string; buffer: Buffer } | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dataUriMatch = /^data:([\w/+.-]+);base64,(.+)$/i.exec(trimmed);
    if (dataUriMatch) {
        const [, mimeType, base64Data] = dataUriMatch;
        return { mimeType, buffer: Buffer.from(base64Data, "base64") };
    }

    const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 100;
    if (!looksLikeBase64) return null;

    return { mimeType: "application/octet-stream", buffer: Buffer.from(trimmed, "base64") };
};

const driveDownloadLink = (fileId: string): string => {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

const normalizeDriveDownloadLink = (value?: string | null): string | undefined => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return undefined;

    const fileId = extractDriveFileId(trimmed);
    if (!fileId) return trimmed;

    return driveDownloadLink(fileId);
};

const isPdfBuffer = (buffer: Buffer): boolean => {
    if (!buffer || buffer.length < 4) return false;
    return buffer.subarray(0, 4).toString() === "%PDF";
};

const bufferLooksLikeSuratPeringatanPdf = (buffer: Buffer): boolean => {
    const sample = buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("latin1").toUpperCase();
    return sample.includes("SURAT PERINGATAN") || sample.includes("ISI PERINGATAN");
};

const pdfLooksLikeSuratPeringatan = async (buffer: Buffer): Promise<boolean> => {
    if (bufferLooksLikeSuratPeringatanPdf(buffer)) return true;

    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText({ partial: [1] });
        const text = (result.text ?? "").toUpperCase().replace(/\s+/g, " ");
        return text.includes("SURAT PERINGATAN") || text.includes("ISI PERINGATAN");
    } catch {
        return false;
    } finally {
        await parser.destroy();
    }
};

const isKnownSuratPeringatanPdfLink = async (rawLink: string): Promise<boolean> => {
    const trimmed = rawLink.trim();
    if (!trimmed) return false;

    const fileId = extractDriveFileId(trimmed);
    const result = await pool.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM denda_keterlambatan_action
            WHERE action_type = 'SP'
              AND link_pdf IS NOT NULL
              AND TRIM(link_pdf) <> ''
              AND (
                    TRIM(link_pdf) = $1
                    OR ($2::text IS NOT NULL AND link_pdf ILIKE '%' || $2 || '%')
              )
        ) AS exists
        `,
        [trimmed, fileId ?? null]
    );

    return Boolean(result.rows[0]?.exists);
};

const fetchFileBufferByLink = async (
    rawLink: string,
): Promise<{ buffer: Buffer; mimeType?: string } | null> => {
    const trimmed = rawLink.trim();
    if (!trimmed) return null;

    const fileId = extractDriveFileId(trimmed);
    const gp = GoogleProvider.instance;

    if (fileId && gp.spartaDrive) {
        const buffer = await gp.getFileBufferById(gp.spartaDrive, fileId);
        if (buffer && buffer.length) {
            let mimeType: string | undefined;
            try {
                const meta = await gp.spartaDrive.files.get({ fileId, fields: "mimeType" });
                mimeType = meta.data.mimeType ?? undefined;
            } catch {
                // Best-effort metadata only.
            }

            return { buffer, mimeType };
        }
    }

    const downloadUrl = fileId
        ? driveDownloadLink(fileId)
        : normalizeDriveDownloadLink(trimmed) ?? trimmed;
    const response = await fetch(downloadUrl);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;

    return {
        buffer,
        mimeType: response.headers.get("content-type") ?? undefined,
    };
};

const isRabAssetProxyPath = (value?: string | null): boolean => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return false;

    try {
        const parsed = new URL(trimmed, "http://local");
        return /^\/api\/rab\/\d+\/(logo|file-asuransi)$/i.test(parsed.pathname);
    } catch {
        return /^\/api\/rab\/\d+\/(logo|file-asuransi)$/i.test(trimmed);
    }
};

const normalizeIncomingAssetLink = (value?: string | null): string | undefined => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return undefined;
    if (isRabAssetProxyPath(trimmed)) return undefined;

    return normalizeDriveDownloadLink(trimmed);
};

const buildRabAssetDownloadPath = (
    rabId: number | string,
    assetField: "logo" | "file_asuransi",
    rawLink?: string | null,
): string | null => {
    const trimmed = (rawLink ?? "").trim();
    if (!trimmed) return null;

    if (assetField === "logo") {
        return `/api/rab/${rabId}/logo`;
    }

    return `/api/rab/${rabId}/file-asuransi`;
};

const getExternalUploadErrorContext = (error: unknown) => {
    const candidate = error as { message?: unknown; code?: unknown; response?: { status?: unknown; data?: { error?: { message?: unknown }; message?: unknown } } } | null;
    return {
        status: candidate?.code ?? candidate?.response?.status,
        message: typeof candidate?.message === "string"
            ? candidate.message
            : typeof candidate?.response?.data?.error?.message === "string"
                ? candidate.response.data.error.message
                : typeof candidate?.response?.data?.message === "string"
                    ? candidate.response.data.message
                    : undefined,
    };
};

const throwRabUploadAppError = (label: string, error: unknown): never => {
    if (error instanceof AppError) throw error;

    const context = getExternalUploadErrorContext(error);
    console.error(`[RAB SUBMIT] Gagal upload ${label} ke Google Drive sebelum simpan DB`, context);
    throw new AppError(
        `Upload ${label} ke Google Drive gagal. Pastikan file valid, tidak rusak, dan coba submit ulang.`,
        502
    );
};
const normalizeRabFileLinks = <T extends { id: number | string; logo: string | null; file_asuransi: string | null }>(
    rab: T,
): T => {
    return {
        ...rab,
        logo: buildRabAssetDownloadPath(rab.id, "logo", rab.logo),
        file_asuransi: buildRabAssetDownloadPath(rab.id, "file_asuransi", rab.file_asuransi),
    };
};

const inferFileExtension = (mimeType?: string | null): string => {
    const value = (mimeType ?? "").toLowerCase();
    if (value === "application/pdf") return ".pdf";
    if (value === "image/png") return ".png";
    if (value === "image/jpeg") return ".jpg";
    if (value === "image/webp") return ".webp";
    if (value === "image/svg+xml") return ".svg";
    if (value === "application/zip") return ".zip";
    return "";
};

const uploadLogoToDrive = async (logoValue: string, filename: string, nomorUlok: string, namaToko?: string, kodeToko?: string, cabang?: string): Promise<string | null> => {
    const normalized = normalizeBase64Image(logoValue);
    if (!normalized) return null;

    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const folderId = await gp.getOrCreateProcessFolder("RAB", nomorUlok, namaToko, kodeToko, cabang);
    const result = await gp.uploadFile(
        folderId,
        filename,
        normalized.mimeType,
        normalized.buffer,
        2,
        drive,
    );

    if (!result.id) return normalizeDriveDownloadLink(result.webViewLink) ?? null;
    return driveDownloadLink(result.id);
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedFile): string => {
    const fromName = (() => {
        const rawName = file.originalname ?? "";
        const lastDot = rawName.lastIndexOf(".");
        if (lastDot <= 0 || lastDot === rawName.length - 1) return "";
        return rawName.slice(lastDot).toLowerCase();
    })();
    if (/^\.[a-z0-9]{1,10}$/.test(fromName)) {
        return fromName;
    }

    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    return ".bin";
};

const uploadInsuranceFileToDrive = async (
    file: UploadedFile,
    nomorUlok: string,
    proyek?: string,
    namaToko?: string,
    kodeToko?: string,
    cabang?: string,
): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const safeProyek = sanitizeFilenamePart(proyek, "PROYEK");
    const safeUlok = sanitizeFilenamePart(nomorUlok, "ULOK");
    const ext = resolveFileExtension(file);
    const filename = `RAB_ASURANSI_${safeProyek}_${safeUlok}_${Date.now()}${ext}`;

    const folderId = await gp.getOrCreateProcessFolder("RAB", nomorUlok, namaToko, kodeToko, cabang);
    const result = await gp.uploadFile(
        folderId,
        filename,
        file.mimetype || "application/octet-stream",
        file.buffer,
        2,
        drive,
    );

    if (!result.id) {
        if (result.webViewLink) return normalizeDriveDownloadLink(result.webViewLink) ?? result.webViewLink;
        throw new AppError("Upload file asuransi ke Google Drive gagal", 500);
    }

    return driveDownloadLink(result.id);
};

const uploadLogoFileToDrive = async (
    file: UploadedFile,
    nomorUlok: string,
    proyek?: string,
    namaToko?: string,
    kodeToko?: string,
    cabang?: string,
): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const safeProyek = sanitizeFilenamePart(proyek, "PROYEK");
    const safeUlok = sanitizeFilenamePart(nomorUlok, "ULOK");
    const ext = resolveFileExtension(file);
    const filename = `RAB_LOGO_${safeProyek}_${safeUlok}_${Date.now()}${ext}`;

    const folderId = await gp.getOrCreateProcessFolder("RAB", nomorUlok, namaToko, kodeToko, cabang);
    const result = await gp.uploadFile(
        folderId,
        filename,
        file.mimetype || "application/octet-stream",
        file.buffer,
        2,
        drive,
    );

    if (!result.id) {
        if (result.webViewLink) return normalizeDriveDownloadLink(result.webViewLink) ?? result.webViewLink;
        throw new AppError("Upload logo ke Google Drive gagal", 500);
    }

    return driveDownloadLink(result.id);
};

const uploadInsuranceStringToDrive = async (
    fileValue: string,
    nomorUlok: string,
    proyek?: string,
    namaToko?: string,
    kodeToko?: string,
    cabang?: string,
): Promise<string> => {
    const normalized = normalizeBase64Binary(fileValue);
    if (!normalized) {
        return normalizeDriveDownloadLink(fileValue) ?? fileValue;
    }

    const ext = inferFileExtension(normalized.mimeType) || ".bin";
    const safeProyek = sanitizeFilenamePart(proyek, "PROYEK");
    const safeUlok = sanitizeFilenamePart(nomorUlok, "ULOK");
    const filename = `RAB_ASURANSI_${safeProyek}_${safeUlok}_${Date.now()}${ext}`;

    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const folderId = await gp.getOrCreateProcessFolder("RAB", nomorUlok, namaToko, kodeToko, cabang);
    const result = await gp.uploadFile(
        folderId,
        filename,
        normalized.mimeType,
        normalized.buffer,
        2,
        drive,
    );

    if (!result.id) {
        if (result.webViewLink) return normalizeDriveDownloadLink(result.webViewLink) ?? result.webViewLink;
        throw new AppError("Upload file asuransi ke Google Drive gagal", 500);
    }

    return driveDownloadLink(result.id);
};

const resolveLogoForPdf = async (logoValue?: string | null): Promise<string | undefined> => {
    const trimmed = (logoValue ?? "").trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith("data:")) {
        return trimmed;
    }

    const fileId = extractDriveFileId(trimmed);
    if (!fileId) return trimmed;

    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) return trimmed;

    const buffer = await gp.getFileBufferById(drive, fileId);
    if (!buffer) return trimmed;

    let mimeType = "image/png";
    try {
        const meta = await drive.files.get({ fileId, fields: "mimeType" });
        if (meta.data.mimeType) {
            mimeType = meta.data.mimeType;
        }
    } catch {
        // Best-effort: fallback to PNG when metadata fetch fails.
    }

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

/** Upload buffer ke Google Drive, return web view link */
async function uploadPdfToDrive(buffer: Buffer, filename: string, nomorUlok: string): Promise<string> {
    const gp = GoogleProvider.instance;
    // Python server pakai drive_service (Sparta / token.json) utk upload RAB PDF
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const folderId = await gp.getOrCreateProcessFolder("RAB", nomorUlok);
    const result = await gp.uploadFile(
        folderId,
        filename,
        "application/pdf",
        buffer,
        2,
        drive,
    );

    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
}

async function resolveMateraiCoverPageForMerge(input: {
    rabId: number;
    nomorUlok: string;
    currentLingkup?: string | null;
    currentMateraiLink?: string | null;
}): Promise<Buffer | null> {
    const candidates: Array<{ rabId: number; lingkup?: string | null; link: string; source: "current" | "sibling" }> = [];
    const seenLinks = new Set<string>();
    const addCandidate = (candidate: { rabId: number; lingkup?: string | null; link?: string | null; source: "current" | "sibling" }) => {
        const link = candidate.link?.trim();
        if (!link || seenLinks.has(link)) return;
        seenLinks.add(link);
        candidates.push({ ...candidate, link });
    };

    addCandidate({
        rabId: input.rabId,
        lingkup: input.currentLingkup,
        link: input.currentMateraiLink,
        source: "current"
    });

    const siblingMateraiLinks = await rabRepository.findMateraiLinksByNomorUlok(input.nomorUlok);
    for (const sibling of siblingMateraiLinks) {
        if (Number(sibling.id) === Number(input.rabId)) continue;
        addCandidate({
            rabId: sibling.id,
            lingkup: sibling.lingkup_pekerjaan,
            link: sibling.link_pdf_materai,
            source: "sibling"
        });
    }

    for (const candidate of candidates) {
        try {
            const materaiFile = await fetchFileBufferByLink(candidate.link);
            if (!materaiFile?.buffer?.length) {
                logRab("PDF", "PDF materai tidak bisa diambil, coba kandidat berikutnya", {
                    rabId: input.rabId,
                    candidateRabId: candidate.rabId,
                    source: candidate.source,
                    lingkup: candidate.lingkup ?? "-"
                });
                continue;
            }

            const isPdf = (materaiFile.mimeType ?? "").toLowerCase() === "application/pdf"
                || isPdfBuffer(materaiFile.buffer);
            if (!isPdf) {
                logRab("PDF", "Link materai bukan PDF, coba kandidat berikutnya", {
                    rabId: input.rabId,
                    candidateRabId: candidate.rabId,
                    source: candidate.source,
                    mimeType: materaiFile.mimeType ?? "-"
                });
                continue;
            }

            const isSuratPeringatanPdf = await isKnownSuratPeringatanPdfLink(candidate.link)
                || await pdfLooksLikeSuratPeringatan(materaiFile.buffer);
            if (isSuratPeringatanPdf) {
                logRab("PDF", "PDF materai dilewati karena terdeteksi Surat Peringatan", {
                    rabId: input.rabId,
                    candidateRabId: candidate.rabId,
                    source: candidate.source,
                    lingkup: candidate.lingkup ?? "-"
                });
                continue;
            }

            const materaiPage = await extractMateraiCoverPageBuffer(materaiFile.buffer);
            if (!materaiPage) {
                logRab("PDF", "PDF materai tidak punya halaman untuk merge, coba kandidat berikutnya", {
                    rabId: input.rabId,
                    candidateRabId: candidate.rabId,
                    source: candidate.source
                });
                continue;
            }

            logRab("PDF", "Halaman materai ditambahkan sebagai halaman awal merge", {
                rabId: input.rabId,
                candidateRabId: candidate.rabId,
                source: candidate.source,
                lingkup: candidate.lingkup ?? "-"
            });
            return materaiPage;
        } catch (err) {
            console.error("Warning: Gagal mengambil PDF materai untuk merge, coba kandidat berikutnya:", {
                rabId: input.rabId,
                candidateRabId: candidate.rabId,
                source: candidate.source,
                lingkup: candidate.lingkup ?? "-",
                error: err instanceof Error ? err.message : err
            });
        }
    }

    logRab("PDF", "Tidak ada PDF materai yang bisa dipakai untuk halaman awal merge", { rabId: input.rabId });
    return null;
}

export async function regenerateRabPdfs(
    rabId: string,
    filenameParts: { proyek?: string | null; nomorUlok?: string | null },
    approvalNameOverrides?: {
        koordinator?: string;
        manager?: string;
        direktur?: string;
    } | null,
    hideCoordinatorInfo?: boolean,
    alamatCabangOverride?: string | null
): Promise<{
    link_pdf_gabungan: string;
    link_pdf_non_sbo: string;
    link_pdf_rekapitulasi: string;
    link_pdf_sph?: string;
} | null> {
    logRab("PDF", `Mulai regenerate PDF${hideCoordinatorInfo ? ' (hide coordinator info)' : ''}`, { rabId });
    // Pastikan nomor SPH tersedia sejak awal submit dan tetap konsisten untuk regenerate berikutnya.
    const noSph = await rabRepository.ensureSphNumber(rabId);

    const fullData = await rabRepository.findById(rabId);
    if (!fullData) {
        logRab("PDF", "Data RAB tidak ditemukan saat regenerate", { rabId });
        return null;
    }
    fullData.rab.no_sph = noSph;

    const rabForPdf = approvalNameOverrides
        ? { ...fullData.rab }
        : fullData.rab;

    if (approvalNameOverrides) {
        const koordinatorName = (approvalNameOverrides.koordinator ?? "").trim();
        const managerName = (approvalNameOverrides.manager ?? "").trim();
        const direkturName = (approvalNameOverrides.direktur ?? "").trim();

        if (koordinatorName) {
            rabForPdf.nama_persetujuan_koordinator = koordinatorName;
        }
        if (managerName) {
            rabForPdf.nama_persetujuan_manager = managerName;
        }
        if (direkturName) {
            rabForPdf.nama_persetujuan_direktur = direkturName;
            rabForPdf.nama_lengkap_persetujuan_direktur = direkturName;
        }
    }

    const cabangKey = fullData.toko.cabang ?? "";
    const alamatCabangRow = alamatCabangOverride
        ? { alamat: alamatCabangOverride, cabang: cabangKey }
        : await tokoRepository.findAlamatCabangByCabang(cabangKey);
    const alamatCabang = alamatCabangRow?.alamat ?? null;

    const proyek = filenameParts.proyek ?? fullData.toko.proyek ?? "N/A";
    const nomorUlok = filenameParts.nomorUlok ?? fullData.toko.nomor_ulok ?? "UNKNOWN";

    const pdfNonSbo = await buildRabPdfBuffer({
        rab: rabForPdf,
        items: fullData.items,
        toko: fullData.toko,
        hideCoordinatorInfo
    });
    logRab("PDF", "PDF non SBO selesai dibuat", { rabId });

    const pdfRecap = await buildRecapPdfBuffer({
        rab: rabForPdf,
        items: fullData.items,
        toko: fullData.toko
    });
    logRab("PDF", "PDF rekap selesai dibuat", { rabId });

    const pdfBuffersToMerge: Buffer[] = [];
    let linkSph: string | undefined;
    const logoDataUri = await resolveLogoForPdf(fullData.rab.logo);

    const materaiPage = await resolveMateraiCoverPageForMerge({
        rabId: fullData.rab.id,
        nomorUlok,
        currentLingkup: fullData.toko.lingkup_pekerjaan,
        currentMateraiLink: fullData.rab.link_pdf_materai
    });
    if (materaiPage) {
        pdfBuffersToMerge.push(materaiPage);
    }

    const pdfSph = await generateSphPdf({
        rab: rabForPdf,
        items: fullData.items,
        toko: fullData.toko,
        logoOverride: logoDataUri,
        alamat_cabang: alamatCabang
    });
    pdfBuffersToMerge.push(pdfSph);
    logRab("PDF", "PDF SPH selesai dibuat", { rabId });

    linkSph = await uploadPdfToDrive(
        pdfSph,
        `SPH_${proyek}_${nomorUlok}.pdf`,
        nomorUlok
    );
    logRab("PDF", "PDF SPH diupload", { rabId, linkSph });

    pdfBuffersToMerge.push(pdfRecap, pdfNonSbo);

    const insuranceLink = fullData.rab.file_asuransi?.trim();
    if (insuranceLink) {
        try {
            const insuranceFile = await fetchFileBufferByLink(insuranceLink);
            if (insuranceFile?.buffer?.length) {
                const isPdf = (insuranceFile.mimeType ?? "").toLowerCase() === "application/pdf"
                    || isPdfBuffer(insuranceFile.buffer);
                if (isPdf) {
                    const isSuratPeringatanPdf = await isKnownSuratPeringatanPdfLink(insuranceLink)
                        || await pdfLooksLikeSuratPeringatan(insuranceFile.buffer);
                    if (isSuratPeringatanPdf) {
                        logRab("PDF", "File asuransi PDF dilewati karena terdeteksi Surat Peringatan", { rabId });
                    } else {
                        pdfBuffersToMerge.push(insuranceFile.buffer);
                        logRab("PDF", "File asuransi PDF ditambahkan ke merge", { rabId });
                    }
                }
            }
        } catch (err) {
            console.error("Warning: Gagal mengambil file asuransi untuk merge PDF:", err);
        }
    }

    const pdfMerged = await mergePdfBuffers(pdfBuffersToMerge);

    const linkNonSbo = await uploadPdfToDrive(
        pdfNonSbo,
        `RAB_NON-SBO_${proyek}_${nomorUlok}.pdf`,
        nomorUlok
    );
    const linkRecap = await uploadPdfToDrive(
        pdfRecap,
        `REKAP_RAB_${proyek}_${nomorUlok}.pdf`,
        nomorUlok
    );
    const linkMerged = await uploadPdfToDrive(
        pdfMerged,
        `RAB_GABUNGAN_${proyek}_${nomorUlok}.pdf`,
        nomorUlok
    );
    logRab("PDF", "PDF hasil generate selesai diupload", {
        rabId,
        linkMerged,
        linkNonSbo,
        linkRecap
    });

    return {
        link_pdf_gabungan: linkMerged,
        link_pdf_non_sbo: linkNonSbo,
        link_pdf_rekapitulasi: linkRecap,
        link_pdf_sph: linkSph
    };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const rabService = {
    async submit(payload: SubmitRabInput, uploadedFiles: SubmitUploadedFiles = {}) {
        const normalizedLingkupPekerjaan = normalizeLingkupForPrice(payload.lingkup_pekerjaan);
        if (!normalizedLingkupPekerjaan) {
            throw new AppError("Lingkup pekerjaan RAB wajib SIPIL atau ME.", 422);
        }

        // --- VALIDASI SILANG LINGKUP VS ITEM ---
        // Mencegah tercampurnya item Sipil dan ME karena kesalahan form revisi atau auto-switch
        const meCategories = ["INSTALASI", "FIXTURE"];
        const sharedCategories = ["PEKERJAAN TAMBAHAN", "PEKERJAAN SBO"];

        if (normalizedLingkupPekerjaan === "SIPIL") {
            const hasMeOnlyItems = payload.detail_items.some(item => 
                meCategories.includes(item.kategori_pekerjaan.toUpperCase().trim())
            );
            if (hasMeOnlyItems) {
                throw new AppError("Ditolak: Anda mencoba mensubmit item Mekanikal/Elektrikal (ME) ke dalam Lingkup Sipil.", 422);
            }
        } else if (normalizedLingkupPekerjaan === "ME") {
            const hasSipilOnlyItems = payload.detail_items.some(item => {
                const cat = item.kategori_pekerjaan.toUpperCase().trim();
                return !meCategories.includes(cat) && !sharedCategories.includes(cat);
            });
            if (hasSipilOnlyItems) {
                throw new AppError("Ditolak: Anda mencoba mensubmit item Sipil ke dalam Lingkup Mekanikal/Elektrikal (ME).", 422);
            }
        }
        // ---------------------------------------

        const submittedNamaPt = await validateSubmitterCompanyMapping(payload);

        if (payload.projek_planning_id) {
            const planningData = await projekPlanningRepository.findById(payload.projek_planning_id);
            if (!planningData) {
                throw new AppError("Permintaan RAB Project Planning tidak ditemukan", 404);
            }
            const projek = planningData.projek;
            if (projek.status !== PP_STATUS.WAITING_RAB_UPLOAD) {
                throw new AppError("Permintaan RAB Project Planning sudah tidak aktif", 409);
            }
            if (String(projek.nomor_ulok || "").trim().toUpperCase() !== String(payload.nomor_ulok || "").trim().toUpperCase()) {
                throw new AppError("Nomor ULOK tidak cocok dengan Project Planning", 422);
            }
            if (!isSameBranchScope(projek.cabang, payload.cabang)) {
                throw new AppError("Cabang tidak cocok dengan Project Planning", 422);
            }
            const canAccess = await projekPlanningRepository.canActorAccessBranch(payload.email_pembuat, projek.cabang);
            if (!canAccess) {
                throw new AppError("Akun tidak memiliki akses ke permintaan RAB cabang ini", 403);
            }
            const exists = await projekPlanningRepository.existsRabByNomorUlokAndLingkup(
                projek.nomor_ulok,
                normalizedLingkupPekerjaan
            );
            if (exists) {
                throw new AppError("RAB untuk ULOK dan lingkup ini sudah disubmit", 409);
            }
        }

        logRab("SUBMIT", "Mulai submit RAB", {
            nomor_ulok: payload.nomor_ulok,
            lingkup_pekerjaan: normalizedLingkupPekerjaan,
            is_revisi: payload.is_revisi === true,
        });
        // 1. Tentukan mode submit: create baru atau revisi explicit dari frontend
        let rejectedRabToReplaceId: number | null = null;
        let rejectedRabExistingLogo: string | null = null;
        let rejectedRabExistingInsurance: string | null = null;
        let rejectedRabExistingCabang: string | null = null;
        const isRevisionSubmit = payload.is_revisi === true;
        const isTakeover = payload.is_takeover === true;
        const existingTokoByCombination = await tokoRepository.findByNomorUlokAndLingkup(
            payload.nomor_ulok,
            normalizedLingkupPekerjaan
        );

        if (isRevisionSubmit) {
            if (!payload.id_rab_revisi) {
                throw new AppError("Revisi RAB wajib mengirim id_rab_revisi", 400);
            }

            const targetRab = await rabRepository.findMinimalById(payload.id_rab_revisi);
            if (!targetRab) {
                throw new AppError("Data RAB revisi tidak ditemukan", 404);
            }

            if (!REJECTED_RAB_STATUSES.includes(targetRab.status)) {
                throw new AppError(
                    `RAB ini sudah dalam proses approval (status: ${targetRab.status}) dan tidak bisa direvisi lagi. ` +
                    `Silakan refresh halaman dan cek daftar RAB Anda.`,
                    409
                );
            }

            rejectedRabToReplaceId = targetRab.id;
            rejectedRabExistingLogo = targetRab.logo;
            rejectedRabExistingInsurance = targetRab.file_asuransi;
            rejectedRabExistingCabang = targetRab.cabang;
        } else if (existingTokoByCombination && !isTakeover) {
            const latestRab = await rabRepository.findLatestByTokoId(existingTokoByCombination.id);
            const sameSubmitter = latestRab
                && REJECTED_RAB_STATUSES.includes(latestRab.status)
                && String(latestRab.email_pembuat ?? "").trim().toLowerCase() === String(payload.email_pembuat ?? "").trim().toLowerCase()
                && normalizeComparableText(latestRab.nama_pt) === normalizeComparableText(submittedNamaPt);

            if (sameSubmitter) {
                rejectedRabToReplaceId = latestRab.id;
                rejectedRabExistingLogo = latestRab.logo;
                rejectedRabExistingInsurance = latestRab.file_asuransi;
                rejectedRabExistingCabang = existingTokoByCombination.cabang;
                logRab("SUBMIT", "Submit ulang RAB rejected diproses sebagai revisi otomatis", {
                    rab_id: latestRab.id,
                    nomor_ulok: payload.nomor_ulok,
                    lingkup_pekerjaan: normalizedLingkupPekerjaan
                });
            } else {
                console.log('[RAB DEBUG] Existing toko found, checking for active RAB:', {
                    toko_id: existingTokoByCombination.id,
                    toko_ulok: existingTokoByCombination.nomor_ulok,
                    toko_lingkup: existingTokoByCombination.lingkup_pekerjaan
                });
                const alreadyExists = await rabRepository.existsAnyByTokoId(existingTokoByCombination.id);
                console.log('[RAB DEBUG] existsAnyByTokoId result:', { alreadyExists });
                if (alreadyExists) {
                    console.error('[RAB DEBUG] FALSE POSITIVE DUPLICATE DETECTED!', {
                        input_ulok: payload.nomor_ulok,
                        input_lingkup: normalizedLingkupPekerjaan,
                        matched_toko_id: existingTokoByCombination.id,
                        matched_toko_ulok: existingTokoByCombination.nomor_ulok,
                        matched_toko_lingkup: existingTokoByCombination.lingkup_pekerjaan
                    });
                    throw new AppError(
                        `Nomor ULOK ${payload.nomor_ulok} dengan lingkup ${normalizedLingkupPekerjaan} sudah memiliki RAB aktif. ` +
                        `Jika Anda tidak merasa pernah submit RAB ini, kemungkinan ULOK sudah digunakan oleh pihak lain. ` +
                        `Hubungi admin untuk konfirmasi.`,
                        409
                    );
                }
            }
        }

        const revisionPriceCabang = payload.cabang || rejectedRabExistingCabang || existingTokoByCombination?.cabang;
        
        const branchChanged = Boolean(
            rejectedRabExistingCabang && 
            revisionPriceCabang && 
            rejectedRabExistingCabang.trim().toUpperCase() !== revisionPriceCabang.trim().toUpperCase()
        );
        
        const shouldSyncRevisionPrices = isRevisionSubmit && (branchChanged || usesRabParentPrice(revisionPriceCabang));

        const detailItems = shouldSyncRevisionPrices
            ? await syncDetailItemsWithBranchPrices(
                payload.detail_items,
                revisionPriceCabang,
                normalizedLingkupPekerjaan,
                true,
                true
            )
            : payload.detail_items;

        // 2. Hitung totals
        const isNoPpn = isBatamBranch(revisionPriceCabang);
        const totals = computeTotals(detailItems, isNoPpn);
        logRab("SUBMIT", "Totals dihitung", {
            grand_total: totals.grandTotal,
            grand_total_non_sbo: totals.totalNonSbo,
            grand_total_final: totals.finalGrandTotal,
            is_no_ppn: isNoPpn
        });

        // 3. Simpan ke DB (upsert toko + insert rab + insert rab_item dalam 1 transaksi)
        const logoInput = (payload.logo ?? "").trim();
        const revLogoInput = (payload.rev_logo ?? "").trim();
        const fileAsuransiInput = (payload.file_asuransi ?? "").trim();
        const revFileAsuransiInput = (payload.rev_file_asuransi ?? "").trim();

        const isRejectedResubmit = rejectedRabToReplaceId !== null;

        let logoLink = rejectedRabToReplaceId !== null
            ? normalizeIncomingAssetLink(rejectedRabExistingLogo)
            : undefined;

        // Resolve Proxy URLs for logo auto-fill
        const resolveProxyUrl = async (input: string): Promise<string | undefined> => {
            const match = input.match(/^\/api\/rab\/(\d+)\/(logo|file-asuransi)$/i);
            if (match) {
                const id = parseInt(match[1], 10);
                const column = match[2].replace('-', '_'); // "logo" or "file_asuransi"
                try {
                    const result = await pool.query(`SELECT ${column} FROM rab WHERE id = $1`, [id]);
                    if (result.rows.length > 0 && result.rows[0][column]) {
                        return result.rows[0][column];
                    }
                } catch (err) {
                    console.error(`Failed to resolve proxy URL ${input}:`, err);
                }
            }
            return undefined;
        };

        if (!isRejectedResubmit && isRabAssetProxyPath(logoInput)) {
            const resolved = await resolveProxyUrl(logoInput);
            if (resolved) logoLink = resolved;
        } else if (isRejectedResubmit && isRabAssetProxyPath(revLogoInput)) {
            const resolved = await resolveProxyUrl(revLogoInput);
            if (resolved) logoLink = resolved;
        } else if (isRejectedResubmit && isRabAssetProxyPath(logoInput) && !revLogoInput) {
            // Jika resubmit tanpa revisi logo, logoLink sudah terisi rejectedRabExistingLogo
            // Tapi jika kita perlu mengambil dari proxy input, kita cek apakah perlu ditimpa.
            // Biasanya ditangani oleh `rejectedRabToReplaceId`
        }

        const hasLogoInput = logoInput.length > 0 && !isRabAssetProxyPath(logoInput);
        const hasRevLogoInput = revLogoInput.length > 0 && !isRabAssetProxyPath(revLogoInput);
        const hasFileAsuransiInput = fileAsuransiInput.length > 0 && !isRabAssetProxyPath(fileAsuransiInput);
        const hasRevFileAsuransiInput = revFileAsuransiInput.length > 0 && !isRabAssetProxyPath(revFileAsuransiInput);

        if (!isRejectedResubmit && hasLogoInput) {
            const logoValue = logoInput;
            logoLink = normalizeIncomingAssetLink(logoValue);
            try {
                const filename = `RAB_LOGO_${payload.proyek ?? "PROYEK"}_${payload.nomor_ulok}.png`;
                const uploadedLink = await uploadLogoToDrive(logoValue, filename, payload.nomor_ulok, payload.nama_toko, payload.kode_toko, payload.cabang);
                if (uploadedLink) {
                    logoLink = uploadedLink;
                }
                logRab("SUBMIT", "Logo diupload", { logoLink });
            } catch (err) {
                console.error("Warning: Gagal upload logo RAB ke Drive:", err);
            }
        }

        if (isRejectedResubmit && hasRevLogoInput) {
            const revLogoValue = revLogoInput;
            let revLogoLink = normalizeIncomingAssetLink(revLogoValue);
            try {
                const filename = `RAB_LOGO_${payload.proyek ?? "PROYEK"}_${payload.nomor_ulok}_${Date.now()}.png`;
                const uploadedLink = await uploadLogoToDrive(revLogoValue, filename, payload.nomor_ulok, payload.nama_toko, payload.kode_toko, payload.cabang);
                if (uploadedLink) {
                    revLogoLink = uploadedLink;
                }
            } catch (err) {
                console.error("Warning: Gagal upload rev_logo RAB ke Drive:", err);
            }

            if (revLogoLink) {
                logoLink = revLogoLink;
            }
            logRab("SUBMIT", "Rev logo diupload", { logoLink });
        }

        if (isRejectedResubmit && uploadedFiles.revLogoFile) {
            try {
                logoLink = await uploadLogoFileToDrive(
                    uploadedFiles.revLogoFile,
                    payload.nomor_ulok,
                    payload.proyek,
                    payload.nama_toko,
                    payload.kode_toko,
                    payload.cabang
                );
                logRab("SUBMIT", "Rev logo file diupload", { logoLink });
            } catch (err) {
                throwRabUploadAppError("logo revisi RAB", err);
            }
        }

        let insuranceLink = rejectedRabToReplaceId !== null
            ? normalizeIncomingAssetLink(rejectedRabExistingInsurance)
            : undefined;

        if (!isRejectedResubmit && isRabAssetProxyPath(fileAsuransiInput)) {
            const resolved = await resolveProxyUrl(fileAsuransiInput);
            if (resolved) insuranceLink = resolved;
        } else if (isRejectedResubmit && isRabAssetProxyPath(revFileAsuransiInput)) {
            const resolved = await resolveProxyUrl(revFileAsuransiInput);
            if (resolved) insuranceLink = resolved;
        }

        if (!isRejectedResubmit && hasFileAsuransiInput) {
            insuranceLink = normalizeIncomingAssetLink(fileAsuransiInput);
        }

        if (!isRejectedResubmit && uploadedFiles.insuranceFile) {
            try {
                insuranceLink = await uploadInsuranceFileToDrive(
                    uploadedFiles.insuranceFile,
                    payload.nomor_ulok,
                    payload.proyek,
                    payload.nama_toko,
                    payload.kode_toko,
                    payload.cabang
                );
                logRab("SUBMIT", "File asuransi diupload", { insuranceLink });
            } catch (err) {
                throwRabUploadAppError("file asuransi RAB", err);
            }
        }

        if (isRejectedResubmit && hasRevFileAsuransiInput) {
            try {
                insuranceLink = await uploadInsuranceStringToDrive(
                    revFileAsuransiInput,
                    payload.nomor_ulok,
                    payload.proyek,
                    payload.nama_toko,
                    payload.kode_toko,
                    payload.cabang
                );
                logRab("SUBMIT", "Rev file asuransi diupload", { insuranceLink });
            } catch (err) {
                throwRabUploadAppError("file asuransi revisi RAB", err);
            }
        }

        if (isRejectedResubmit && uploadedFiles.revInsuranceFile) {
            try {
                insuranceLink = await uploadInsuranceFileToDrive(
                    uploadedFiles.revInsuranceFile,
                    payload.nomor_ulok,
                    payload.proyek,
                    payload.nama_toko,
                    payload.kode_toko,
                    payload.cabang
                );
                logRab("SUBMIT", "Rev file asuransi (file) diupload", { insuranceLink });
            } catch (err) {
                throwRabUploadAppError("file asuransi revisi RAB", err);
            }
        }

        const normalizedProject = normalizeProjectByUlok(payload.nomor_ulok, payload.proyek) ?? payload.proyek;

        const submitPayload = {
            // toko fields
            nomor_ulok: payload.nomor_ulok,
            lingkup_pekerjaan: normalizedLingkupPekerjaan,
            nama_toko: payload.nama_toko,
            proyek: normalizedProject,
            cabang: payload.cabang || existingTokoByCombination?.cabang,
            alamat: payload.alamat,
            nama_kontraktor: submittedNamaPt,
            projek_planning_id: payload.projek_planning_id,
            is_takeover: isTakeover,
            // rab fields
            email_pembuat: payload.email_pembuat,
            nama_pt: submittedNamaPt,
            status: RAB_STATUS.WAITING_FOR_GANTT,
            logo: logoLink,
            durasi_pekerjaan: payload.durasi_pekerjaan,
            kategori_lokasi: payload.kategori_lokasi,
            no_polis: payload.no_polis,
            berlaku_polis: payload.berlaku_polis,
            file_asuransi: insuranceLink,
            luas_bangunan: payload.luas_bangunan,
            luas_terbangun: payload.luas_terbangun,
            luas_area_terbuka: payload.luas_area_terbuka,
            luas_area_parkir: payload.luas_area_parkir,
            luas_area_sales: payload.luas_area_sales,
            luas_gudang: payload.luas_gudang,
            grand_total: String(totals.grandTotal),
            grand_total_non_sbo: String(totals.totalNonSbo),
            grand_total_final: String(totals.finalGrandTotal),
            detail_items: detailItems
        };

        let rab;
        try {
            rab = rejectedRabToReplaceId !== null
                ? await rabRepository.replaceRejectedWithDetails(rejectedRabToReplaceId, submitPayload)
                : await rabRepository.createWithDetails(submitPayload);
        } catch (error: unknown) {
            const code = typeof error === "object" && error !== null && "code" in error
                ? String((error as { code?: string }).code || "")
                : "";
            if (code === "RAB_DUPLICATE" || code === "23505") {
                throw new AppError(
                    "RAB untuk ULOK dan lingkup ini sudah berhasil tersimpan. " +
                    "Silakan refresh halaman dan cek daftar RAB Anda untuk melanjutkan ke Gantt Chart.",
                    409
                );
            }
            if (code === "TOKO_ULOK_LINGKUP_DUPLICATE") {
                throw new AppError(
                    `Nomor ULOK ${payload.nomor_ulok} dengan lingkup ${normalizedLingkupPekerjaan} sudah terdaftar pada toko/proyek lain. ` +
                    "Gunakan nomor ULOK lain atau hubungi admin untuk merge data.",
                    409
                );
            }
            throw error;
        }
        logRab("SUBMIT", "RAB tersimpan di database", { rabId: rab.id });

        if (normalizedProject && normalizedProject.toUpperCase() !== 'RENOVASI' && normalizedProject.toUpperCase().startsWith('RENOVASI')) {
            try {
                await pool.query(
                    `UPDATE toko 
                     SET proyek = $1 
                     WHERE nomor_ulok = $2 
                       AND UPPER(TRIM(proyek)) = 'RENOVASI'`,
                    [normalizedProject, payload.nomor_ulok]
                );
                await pool.query(
                    `UPDATE rab 
                     SET proyek = $1 
                     WHERE nomor_ulok = $2 
                       AND UPPER(TRIM(proyek)) = 'RENOVASI'`,
                    [normalizedProject, payload.nomor_ulok]
                );
                logRab("SUBMIT", `Sinkronisasi cross-scope proyek renovasi diset ke ${normalizedProject}`, { nomorUlok: payload.nomor_ulok });
            } catch (syncErr) {
                console.error("[RAB SUBMIT] Gagal sinkronisasi proyek renovasi cross-scope:", syncErr);
            }
        }

        // 4. Generate & upload 3 PDF ke Drive (sama seperti server Python)
        try {
            const links = await regenerateRabPdfs(String(rab.id), {
                proyek: normalizedProject,
                nomorUlok: payload.nomor_ulok
            }, null, false, payload.alamat_cabang ?? null);

            if (links) {
                await rabRepository.updatePdfLinks(String(rab.id), links);
                rab.link_pdf_gabungan = links.link_pdf_gabungan;
                rab.link_pdf_non_sbo = links.link_pdf_non_sbo;
                rab.link_pdf_rekapitulasi = links.link_pdf_rekapitulasi;
                logRab("SUBMIT", "Link PDF tersimpan", {
                    rabId: rab.id,
                    link_pdf_gabungan: links.link_pdf_gabungan,
                    link_pdf_non_sbo: links.link_pdf_non_sbo,
                    link_pdf_rekapitulasi: links.link_pdf_rekapitulasi,
                });
            }
        } catch (err) {
            console.error("Warning: Gagal upload PDF ke Drive:", err);
        }

        // 5. Auto-sync Gantt Chart jika RAB direvisi
        try {
            if (existingTokoByCombination) {
                await ganttRepository.syncCategoriesWithRab(Number(existingTokoByCombination.id), Number(rab.id));
            }
        } catch (err) {
            console.error("Warning: Gagal sync kategori Gantt Chart dengan RAB:", err);
        }

        return normalizeRabFileLinks(rab);
    },

    async list(query: RabListQuery) {
        const rows = await rabRepository.list(query);
        return rows.map((row) => normalizeRabFileLinks(row));
    },

    async getById(id: string) {
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }
        const planningData = data.rab.projek_planning_id
            ? await projekPlanningRepository.findById(data.rab.projek_planning_id)
            : null;

        return {
            ...data,
            rab: {
                ...normalizeRabFileLinks(data.rab),
                coordinator_info_prefill: buildRabCoordinatorInfoPrefill(data.rab, planningData?.projek ?? null),
            },
        };
    },

    async regeneratePdf(id: string, hideCoordinatorInfo?: boolean) {
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }
        if (!hasRenderableRabValue(data)) {
            throw new AppError("Data RAB tidak memiliki nilai untuk generate PDF", 422);
        }

        const links = await regenerateRabPdfs(id, {
            proyek: data.toko.proyek,
            nomorUlok: data.toko.nomor_ulok
        }, null, hideCoordinatorInfo || false, null);

        if (!links) {
            throw new AppError("Gagal generate PDF RAB", 500);
        }

        await rabRepository.updatePdfLinks(id, {
            link_pdf_gabungan: links.link_pdf_gabungan,
            link_pdf_non_sbo: links.link_pdf_non_sbo,
            link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
        });
        if (links.link_pdf_sph) {
            await rabRepository.updateSphPdfLink(id, links.link_pdf_sph);
        }

        return {
            ...links,
            has_materai_pdf: Boolean(data.rab.link_pdf_materai)
        };
    },

    async getRegeneratedPdfDownloadPayload(id: string, user?: any) {
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        // Check apakah user adalah kontraktor atau direktur kontraktor
        const userRoles = Array.isArray(user?.roles) 
            ? user.roles.map((r: string) => r.toUpperCase()) 
            : [];
        const isContractorRole = userRoles.some((role: string) => 
            role.includes('KONTRAKTOR') || role.includes('DIREKTUR')
        );
        const hideCoordinatorInfo = isContractorRole;
        
        logRab("REGENERATE", "Role detection", { 
            rabId: id, 
            userRoles, 
            isContractorRole, 
            hideCoordinatorInfo 
        });

        const links = await this.regeneratePdf(id, hideCoordinatorInfo);
        const downloaded = await fetchFileBufferByLink(links.link_pdf_gabungan);
        if (!downloaded?.buffer?.length) {
            throw new AppError("PDF hasil generate tidak bisa diambil dari Drive", 502);
        }

        const filename = generateStandardFilename("RAB", data.toko.nomor_ulok, data.toko.nama_toko, data.toko.lingkup_pekerjaan, ".pdf");

        return {
            filename,
            pdfBuffer: downloaded.buffer
        };
    },

    async handleApproval(id: string, action: ApprovalActionInput) {
        logRab("APPROVAL", "Mulai proses approval", {
            rabId: id,
            tindakan: action.tindakan,
            jabatan: action.jabatan,
            approver_email: action.approver_email,
        });
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        if (data.rab.status === RAB_STATUS.WAITING_FOR_GANTT) {
            throw new AppError("Gantt Chart wajib dibuat sebelum RAB masuk proses approval", 409);
        }

        const hasGanttChart = await rabRepository.existsGanttByRabId(id);
        if (!hasGanttChart) {
            throw new AppError("Gantt Chart wajib dibuat sebelum RAB masuk proses approval", 409);
        }

        const tokoStableFields = {
            nama_toko: data.toko.nama_toko,
            kode_toko: data.toko.kode_toko,
            proyek: data.toko.proyek,
            cabang: data.toko.cabang,
            alamat: data.toko.alamat,
            nama_kontraktor: data.toko.nama_kontraktor,
        };

        await validateInternalApprovalBranchAccess(data, action);
        const newStatus = resolveStatusTransition(data.rab.status, action, data.toko.cabang);
        if (action.tindakan === "REJECT") {
            const revisionItemIds = action.revisi_item_ids ?? [];
            const uniqueRevisionItemIds = new Set(revisionItemIds);
            if (uniqueRevisionItemIds.size !== revisionItemIds.length) {
                throw new AppError("Item revisi RAB tidak boleh duplikat", 400);
            }

            // Validasi: hanya item yang benar-benar ada di RAB ini yang boleh masuk revisi.
            // Item yang tidak valid (stale frontend cache / FK mismatch) di-skip agar
            // tidak menyebabkan FK violation yang memblokir seluruh transaksi penolakan.
            const validRabItemIds = new Set(data.items.map((item: RabItemRow) => item.id));
            const validRevisionItemIds = revisionItemIds.filter(itemId => validRabItemIds.has(itemId));

            if (revisionItemIds.length > 0 && validRevisionItemIds.length !== revisionItemIds.length) {
                const invalidIds = revisionItemIds.filter(id => !validRabItemIds.has(id));
                logRab("APPROVAL", "Beberapa revisi_item_ids tidak valid untuk RAB ini, di-skip", {
                    rabId: id,
                    invalidIds,
                    validIds: validRevisionItemIds,
                });
            }

            const revisionItemNotes = action.revisi_item_notes ?? {};
            const revisionItems: Array<{ id_rab_item: number | null; catatan_item: string | null }> = validRevisionItemIds.map((itemId) => ({
                id_rab_item: itemId,
                catatan_item: revisionItemNotes[String(itemId)] ?? null
            }));
            await rabRepository.rejectRabAndActivateLatestGanttGuarded(
                id,
                newStatus,
                action.alasan_penolakan ?? "",
                action.approver_email,
                action.catatan_approval ?? null,
                revisionItems
            );
            logRab("APPROVAL", "RAB ditolak", { rabId: id, newStatus });

            // Safety net: restore toko fields AFTER the transaction commits,
            // in case a deferred trigger or other side-effect corrupted them.
            await rabRepository.restoreTokoStableFieldsByRabId(id, tokoStableFields);
        } else {
            await validateDirectorContractorApprovalCompany(data, action);
            validateRabCoordinatorAdditionalInfo(action);
            await rabRepository.updateApproval(id, newStatus, action);
            logRab("APPROVAL", "RAB diapprove", { rabId: id, newStatus });
        }

        if (action.tindakan === "APPROVE") {
            try {
                const approvalName = (action.nama_lengkap ?? "").trim();
                const approvalOverrides = approvalName
                    ? action.jabatan === "KOORDINATOR"
                        ? { koordinator: approvalName }
                        : action.jabatan === "MANAGER"
                            ? { manager: approvalName }
                            : { direktur: approvalName }
                    : undefined;
                // Generate all PDFs together. If Direktur has approved, it will automatically include SPH.
                const links = await regenerateRabPdfs(id, {
                    proyek: data.toko.proyek,
                    nomorUlok: data.toko.nomor_ulok
                }, approvalOverrides, false, null);

                if (links) {
                    await rabRepository.updatePdfLinks(id, {
                        link_pdf_gabungan: links.link_pdf_gabungan,
                        link_pdf_non_sbo: links.link_pdf_non_sbo,
                        link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
                    });
                    
                    if (links.link_pdf_sph) {
                        await rabRepository.updateSphPdfLink(id, links.link_pdf_sph);
                    }
                    logRab("APPROVAL", "Link PDF diupdate setelah approval", {
                        rabId: id,
                        link_pdf_gabungan: links.link_pdf_gabungan,
                        link_pdf_non_sbo: links.link_pdf_non_sbo,
                        link_pdf_rekapitulasi: links.link_pdf_rekapitulasi,
                        link_pdf_sph: links.link_pdf_sph,
                    });
                }
            } catch (err) {
                console.error("Warning: Gagal regenerate PDF RAB setelah approval:", err);
            } finally {
                await rabRepository.restoreTokoStableFieldsByRabId(id, tokoStableFields);
            }

            try {
                await emailNotificationService.send({
                    id_toko: data.toko.id,
                    cabang: data.toko.cabang ?? "",
                    flag: "notification-rab-has-approve"
                });
            } catch (err) {
                console.error("Warning: Gagal mengirim email notifikasi RAB disetujui:", err);
            }
        }

        return {
            id,
            old_status: data.rab.status,
            new_status: newStatus
        };
    },

    async getPdfDownloadPayload(id: string, user?: any) {
        logRab("DOWNLOAD", "Request PDF gabungan", { rabId: id, userRoles: user?.roles });
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        // Check apakah user adalah kontraktor atau direktur kontraktor
        const userRoles = Array.isArray(user?.roles) 
            ? user.roles.map((r: string) => r.toUpperCase()) 
            : [];
        const isContractorRole = userRoles.some((role: string) => 
            role.includes('KONTRAKTOR') || role.includes('DIREKTUR')
        );
        const hideCoordinatorInfo = isContractorRole;
        
        logRab("DOWNLOAD", "Role detection", { 
            rabId: id, 
            userRoles, 
            isContractorRole, 
            hideCoordinatorInfo 
        });

        let rawLink = data.rab.link_pdf_gabungan?.trim();
        try {
            if (!hasRenderableRabValue(data)) {
                logRab("DOWNLOAD", "Regenerate PDF dilewati karena item dan nilai header kosong", { rabId: id });
                throw new AppError("Data RAB tidak memiliki nilai untuk regenerate PDF", 422);
            }

            const links = await regenerateRabPdfs(id, {
                proyek: data.toko.proyek,
                nomorUlok: data.toko.nomor_ulok
            }, null, hideCoordinatorInfo, null);

            if (links) {
                await rabRepository.updatePdfLinks(id, {
                    link_pdf_gabungan: links.link_pdf_gabungan,
                    link_pdf_non_sbo: links.link_pdf_non_sbo,
                    link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
                });

                if (links.link_pdf_sph) {
                    await rabRepository.updateSphPdfLink(id, links.link_pdf_sph);
                }

                rawLink = links.link_pdf_gabungan.trim();
                logRab("DOWNLOAD", `PDF gabungan diregenerate sebelum download${hideCoordinatorInfo ? ' (tanpa info koordinator)' : ''}`, { rabId: id });
            }
        } catch (err) {
            console.error("Warning: Gagal regenerate PDF RAB sebelum download, memakai link lama:", err);
        }

        if (!rawLink) {
            throw new AppError("Link PDF gabungan belum tersedia", 404);
        }

        const filename = generateStandardFilename("RAB", data.toko.nomor_ulok, data.toko.nama_toko, data.toko.lingkup_pekerjaan, ".pdf");

        const fileId = extractDriveFileId(rawLink);
        const gp = GoogleProvider.instance;

        if (fileId && gp.spartaDrive) {
            const pdfBuffer = await gp.getFileBufferById(gp.spartaDrive, fileId);
            if (pdfBuffer) {
                logRab("DOWNLOAD", "PDF gabungan diambil dari Drive", { rabId: id });
                return { filename, pdfBuffer };
            }
        }

        const downloadUrl = fileId
            ? `https://drive.google.com/uc?export=download&id=${fileId}`
            : rawLink;

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new AppError("Gagal mengambil file PDF gabungan", 502);
        }

        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        if (!pdfBuffer.length) {
            throw new AppError("File PDF gabungan kosong", 502);
        }
        logRab("DOWNLOAD", "PDF gabungan diambil via HTTP", { rabId: id });

        return { filename, pdfBuffer };
    },

    async getAssetDownloadPayload(id: string, assetField: "logo" | "file_asuransi") {
        logRab("DOWNLOAD", "Request asset", { rabId: id, assetField });
        const data = await rabRepository.findById(id);
        if (!data) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        const rawLink = (assetField === "logo" ? data.rab.logo : data.rab.file_asuransi)?.trim();
        if (!rawLink) {
            const label = assetField === "logo" ? "Logo" : "File asuransi";
            throw new AppError(`${label} tidak tersedia`, 404);
        }

        const fileId = extractDriveFileId(rawLink);
        const gp = GoogleProvider.instance;

        let fileBuffer: Buffer | null = null;
        let contentType: string | null = null;
        let filename: string | null = null;

        if (fileId && gp.spartaDrive) {
            fileBuffer = await gp.getFileBufferById(gp.spartaDrive, fileId);

            try {
                const meta = await gp.spartaDrive.files.get({ fileId, fields: "name,mimeType" });
                filename = meta.data.name ?? null;
                contentType = meta.data.mimeType ?? null;
            } catch {
                // best effort metadata only
            }
        }

        if (!fileBuffer) {
            const fallbackUrl = normalizeDriveDownloadLink(rawLink) ?? rawLink;
            const response = await fetch(fallbackUrl);
            if (!response.ok) {
                throw new AppError("Gagal mengambil file dari Google Drive", 502);
            }
            fileBuffer = Buffer.from(await response.arrayBuffer());
            contentType = response.headers.get("content-type") || contentType;
        }

        if (!fileBuffer.length) {
            throw new AppError("File kosong", 502);
        }
        logRab("DOWNLOAD", "Asset berhasil diambil", { rabId: id, assetField });

        const defaultPrefix = assetField === "logo" ? "RAB_LOGO" : "RAB_ASURANSI";
        const ext = inferFileExtension(contentType);
        const resolvedFilename = filename || `${defaultPrefix}_${data.toko.nomor_ulok}_${data.rab.id}${ext}`;

        return {
            filename: resolvedFilename,
            contentType: contentType || "application/octet-stream",
            fileBuffer,
        };
    },

    /**
     * Update status RAB berdasarkan id_rab.
     * Ketika status adalah "Ditolak" (salah satu status rejected):
     *  - Cari user di user_cabang berdasarkan cabang toko + jabatan yang sesuai
     *    (DIREKTUR / KOORDINATOR / MANAGER) → ambil emailnya
     *  - Insert email tersebut ke kolom ditolak_oleh di RAB
     *  - Set waktu_penolakan = sekarang
     *  - Update gantt_chart status → 'active' berdasarkan id_toko
     */
    async updateRabStatus(input: UpdateRabStatusInput) {
        const { id_toko, id_rab, status } = input;
        logRab("STATUS", "Mulai update status RAB", { id_rab, id_toko, status });

        // Validasi: RAB harus ada
        const rabData = await rabRepository.findById(String(id_rab));
        if (!rabData) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        // Validasi: id_toko harus cocok
        if (rabData.rab.id_toko !== id_toko) {
            throw new AppError("id_toko tidak cocok dengan RAB yang dipilih", 409);
        }

        // Tentukan apakah status termasuk penolakan
        const isRejection = REJECTED_RAB_STATUSES.includes(status as RabStatus);

        if (status === RAB_STATUS.WAITING_FOR_GANTT) {
            await rabRepository.resetToWaitingGantt(id_rab);

            const roleUpper = String(input.actor_role ?? "").trim().toUpperCase();
            const isInterventionRole = roleUpper.includes("SUPER HUMAN")
                || roleUpper.includes("STORE & BRANCH CONTROLLING");

            if (isInterventionRole) {
                await activityLogRepository.insert({
                    entity_type: "RAB",
                    entity_id: id_rab,
                    actor_email: input.actor_email ?? null,
                    actor_role: input.actor_role ?? null,
                    action: "INTERVENTION", // diganti dari SUPER_HUMAN_INTERVENTION agar lebih umum
                    status_before: rabData.rab.status,
                    status_after: status,
                    reason: input.alasan_intervensi?.trim() || null,
                    metadata: { id_toko }
                });
            }

            logRab("STATUS", "RAB dikembalikan ke tahap Menunggu Gantt Chart", {
                id_rab,
                id_toko,
                status
            });

            return {
                id_rab,
                id_toko,
                old_status: rabData.rab.status,
                new_status: status,
                ditolak_oleh: null,
                jabatan_penolak: null
            };
        }

        if (!isRejection) {
            throw new AppError(
                `Status "${status}" bukan status penolakan yang valid. Gunakan endpoint approval untuk approve.`,
                400
            );
        }

        // Tentukan jabatan penolak berdasarkan status yang dikirim
        let jabatanPenolak: string;
        if (status === RAB_STATUS.REJECTED_BY_DIREKTUR) {
            jabatanPenolak = "DIREKTUR";
        } else if (status === RAB_STATUS.REJECTED_BY_COORDINATOR) {
            jabatanPenolak = "BRANCH BUILDING COORDINATOR";
        } else if (status === RAB_STATUS.REJECTED_BY_MANAGER) {
            jabatanPenolak = "BRANCH BUILDING & MAINTENANCE MANAGER";
        } else {
            throw new AppError(`Status penolakan "${status}" tidak dikenali`, 400);
        }

        // Ambil cabang dari toko
        const cabang = rabData.toko.cabang;
        if (!cabang) {
            throw new AppError("Data cabang toko tidak ditemukan", 404);
        }

        // Cari user di user_cabang berdasarkan cabang + jabatan (dengan fallback legacy)
        const jabatanCandidates = jabatanPenolak === "BRANCH BUILDING COORDINATOR"
            ? ["BRANCH BUILDING COORDINATOR", "KOORDINATOR"]
            : jabatanPenolak === "BRANCH BUILDING & MAINTENANCE MANAGER"
                ? ["BRANCH BUILDING & MAINTENANCE MANAGER", "MANAGER"]
                : jabatanPenolak === "DIREKTUR"
                    ? ["Direktur Kontraktor", "DIREKTUR KONTRAKTOR", "DIREKTUR"]
                    : [jabatanPenolak];

        let userPenolak = null;
        let matchedJabatan = jabatanCandidates[0];
        for (const candidate of jabatanCandidates) {
            const found = await userCabangRepository.findByCabangAndJabatan(cabang, candidate);
            if (found) {
                userPenolak = found;
                matchedJabatan = candidate;
                break;
            }
        }
        if (!userPenolak) {
            throw new AppError(
                `User dengan jabatan "${jabatanPenolak}" untuk cabang "${cabang}" tidak ditemukan di data user cabang`,
                404
            );
        }

        const emailPenolak = userPenolak.email_sat;

        // Update RAB status + ditolak_oleh + waktu_penolakan + gantt → active
        await rabRepository.updateRabStatusWithRejection(
            id_rab,
            id_toko,
            status as RabStatus,
            emailPenolak
        );

        if (input.actor_role) {
            const roleUpper = String(input.actor_role).trim().toUpperCase();
            const isInterventionRole = roleUpper.includes("SUPER HUMAN")
                || roleUpper.includes("STORE & BRANCH CONTROLLING");

            if (isInterventionRole) {
                await activityLogRepository.insert({
                    entity_type: "RAB",
                    entity_id: id_rab,
                    actor_email: input.actor_email ?? null,
                    actor_role: input.actor_role,
                    action: "INTERVENTION",
                    status_before: rabData.rab.status,
                    status_after: status,
                    reason: input.alasan_intervensi?.trim() || null,
                    metadata: {
                        id_toko,
                        ditolak_oleh: emailPenolak,
                        jabatan_penolak: matchedJabatan
                    }
                });
            }
        }

        logRab("STATUS", "Update status RAB selesai", {
            id_rab,
            id_toko,
            status,
            ditolak_oleh: emailPenolak
        });

        return {
            id_rab,
            id_toko,
            old_status: rabData.rab.status,
            new_status: status,
            ditolak_oleh: emailPenolak,
            jabatan_penolak: matchedJabatan
        };
    },

    async updateRabItemsBulk(
        rabId: string,
        items: UpdateRabItemInput[],
        manualTotals?: {
            grand_total?: number;
            grand_total_non_sbo?: number;
            grand_total_final?: number;
        }
    ) {
        const rabIdNumber = Number(rabId);
        if (!Number.isInteger(rabIdNumber) || rabIdNumber <= 0) {
            throw new AppError("id_rab tidak valid", 400);
        }

        const rabData = await rabRepository.findById(String(rabIdNumber));
        if (!rabData) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        const usedIds = new Set<number>();
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (usedIds.has(item.id)) {
                throw new AppError(`id duplikat ditemukan pada items[${index}] (id=${item.id})`, 400);
            }
            usedIds.add(item.id);
        }

        const existingItems = await rabRepository.listItemsByRabId(rabIdNumber);
        const existingIds = new Set(existingItems.map((item) => item.id));
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (!existingIds.has(item.id)) {
                throw new AppError(`RAB item tidak ditemukan pada items[${index}] (id=${item.id})`, 404);
            }
        }

        const updatedItems = await rabRepository.updateItemsBulk(rabIdNumber, items);
        const refreshedItems = await rabRepository.listItemsByRabId(rabIdNumber);
        const isNoPpn = isBatamBranch(rabData.toko.cabang);
        const totals = resolveTotals(normalizeDetailItems(refreshedItems), manualTotals, isNoPpn);

        await rabRepository.updateRabTotals(rabIdNumber, {
            grand_total: String(totals.grandTotal),
            grand_total_non_sbo: String(totals.totalNonSbo),
            grand_total_final: String(totals.finalGrandTotal)
        });

        try {
            const links = await regenerateRabPdfs(String(rabIdNumber), {
                proyek: rabData.toko.proyek,
                nomorUlok: rabData.toko.nomor_ulok
            }, null, false, null);

            if (links) {
                await rabRepository.updatePdfLinks(String(rabIdNumber), {
                    link_pdf_gabungan: links.link_pdf_gabungan,
                    link_pdf_non_sbo: links.link_pdf_non_sbo,
                    link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
                });

                if (links.link_pdf_sph) {
                    await rabRepository.updateSphPdfLink(String(rabIdNumber), links.link_pdf_sph);
                }
            }
        } catch (err) {
            console.error("Warning: Gagal regenerate PDF RAB setelah update items:", err);
        }

        return {
            id_rab: rabIdNumber,
            updated_items: updatedItems,
            totals
        };
    },

    async replaceRabItems(
        rabId: string,
        items: DetailItemInput[],
        manualTotals?: {
            grand_total?: number;
            grand_total_non_sbo?: number;
            grand_total_final?: number;
        }
    ) {
        const rabIdNumber = Number(rabId);
        if (!Number.isInteger(rabIdNumber) || rabIdNumber <= 0) {
            throw new AppError("id_rab tidak valid", 400);
        }

        const rabData = await rabRepository.findById(String(rabIdNumber));
        if (!rabData) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        const insertedCount = await rabRepository.replaceItems(rabIdNumber, items);
        const isNoPpn = isBatamBranch(rabData.toko.cabang);
        const totals = resolveTotals(items, manualTotals, isNoPpn);

        await rabRepository.updateRabTotals(rabIdNumber, {
            grand_total: String(totals.grandTotal),
            grand_total_non_sbo: String(totals.totalNonSbo),
            grand_total_final: String(totals.finalGrandTotal)
        });

        try {
            const links = await regenerateRabPdfs(String(rabIdNumber), {
                proyek: rabData.toko.proyek,
                nomorUlok: rabData.toko.nomor_ulok
            }, null, false, null);

            if (links) {
                await rabRepository.updatePdfLinks(String(rabIdNumber), {
                    link_pdf_gabungan: links.link_pdf_gabungan,
                    link_pdf_non_sbo: links.link_pdf_non_sbo,
                    link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
                });

                if (links.link_pdf_sph) {
                    await rabRepository.updateSphPdfLink(String(rabIdNumber), links.link_pdf_sph);
                }
            }
        } catch (err) {
            console.error("Warning: Gagal regenerate PDF RAB setelah replace items:", err);
        }

        return {
            id_rab: rabIdNumber,
            inserted_count: insertedCount,
            totals
        };
    },

    async syncRabItemsWithBranchPrices(rabId: string) {
        const rabIdNumber = Number(rabId);
        if (!Number.isInteger(rabIdNumber) || rabIdNumber <= 0) {
            throw new AppError("id_rab tidak valid", 400);
        }

        throw new AppError("Sinkron harga cabang RAB dinonaktifkan agar kategori dan harga tetap sesuai input user.", 410);
    },

    async deleteRabItems(rabId: string, input: DeleteRabItemsInput) {
        const rabIdNumber = Number(rabId);
        if (!Number.isInteger(rabIdNumber) || rabIdNumber <= 0) {
            throw new AppError("id_rab tidak valid", 400);
        }

        const rabData = await rabRepository.findById(String(rabIdNumber));
        if (!rabData) {
            throw new AppError("Pengajuan RAB tidak ditemukan", 404);
        }

        const requestedIds = input.item_ids;
        const uniqueIds = Array.from(new Set(requestedIds));
        if (uniqueIds.length !== requestedIds.length) {
            throw new AppError("item_ids tidak boleh duplikat", 400);
        }

        const existingItems = await rabRepository.listItemsByRabId(rabIdNumber);
        const existingIds = new Set(existingItems.map((item) => item.id));
        for (const itemId of uniqueIds) {
            if (!existingIds.has(itemId)) {
                throw new AppError(`RAB item tidak ditemukan (id=${itemId})`, 404);
            }
        }

        if (existingItems.length - uniqueIds.length <= 0) {
            throw new AppError("Minimal harus tersisa 1 RAB item", 400);
        }

        const deletedCount = await rabRepository.deleteItemsByIds(rabIdNumber, uniqueIds);
        const refreshedItems = await rabRepository.listItemsByRabId(rabIdNumber);
        const isNoPpn = isBatamBranch(rabData.toko.cabang);
        const totals = computeTotals(normalizeDetailItems(refreshedItems), isNoPpn);

        await rabRepository.updateRabTotals(rabIdNumber, {
            grand_total: String(totals.grandTotal),
            grand_total_non_sbo: String(totals.totalNonSbo),
            grand_total_final: String(totals.finalGrandTotal)
        });

        try {
            const links = await regenerateRabPdfs(String(rabIdNumber), {
                proyek: rabData.toko.proyek,
                nomorUlok: rabData.toko.nomor_ulok
            }, null, false, null);

            if (links) {
                await rabRepository.updatePdfLinks(String(rabIdNumber), {
                    link_pdf_gabungan: links.link_pdf_gabungan,
                    link_pdf_non_sbo: links.link_pdf_non_sbo,
                    link_pdf_rekapitulasi: links.link_pdf_rekapitulasi
                });

                if (links.link_pdf_sph) {
                    await rabRepository.updateSphPdfLink(String(rabIdNumber), links.link_pdf_sph);
                }
            }
        } catch (err) {
            console.error("Warning: Gagal regenerate PDF RAB setelah delete items:", err);
        }

        return {
            id_rab: rabIdNumber,
            deleted_count: deletedCount,
            remaining_items: refreshedItems.length,
            totals
        };
    },

    async exportRabExcel(id: string): Promise<{ filename: string; excelBuffer: Buffer }> {
        const rabData = await rabRepository.findById(id);
        if (!rabData) throw new AppError("RAB tidak ditemukan", 404);

        const items = await rabRepository.listItemsByRabId(id);
        
        const excelData = items.map((item, index) => ({
            "No": index + 1,
            "Kategori Pekerjaan": item.kategori_pekerjaan,
            "Jenis Pekerjaan": item.jenis_pekerjaan,
            "Volume": Number(item.volume) || 0,
            "Satuan": item.satuan,
            "Harga Material": Number(item.harga_material) || 0,
            "Harga Upah": Number(item.harga_upah) || 0,
            "Total Material": Number(item.total_material) || 0,
            "Total Upah": Number(item.total_upah) || 0,
            "Total Harga": Number(item.total_harga) || 0,
            "Catatan": item.catatan || ""
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        
        const wscols = [
            { wch: 5 },  // No
            { wch: 30 }, // Kategori
            { wch: 40 }, // Pekerjaan
            { wch: 10 }, // Volume
            { wch: 10 }, // Satuan
            { wch: 15 }, // Hrg Mat
            { wch: 15 }, // Hrg Upah
            { wch: 15 }, // Tot Mat
            { wch: 15 }, // Tot Upah
            { wch: 15 }, // Tot Harga
            { wch: 30 }  // Catatan
        ];
        worksheet["!cols"] = wscols;

        XLSX.utils.book_append_sheet(workbook, worksheet, "RAB Items");
        
        const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        const filename = generateStandardFilename("RAB", rabData.toko.nomor_ulok, rabData.toko.nama_toko, rabData.toko.lingkup_pekerjaan, ".xlsx");

        return { filename, excelBuffer };
    }
};
