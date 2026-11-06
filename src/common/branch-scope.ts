import { pool } from "../db/pool";

export const BRANCH_GROUPS: Record<string, string[]> = {
    "BANDUNG RAYA": ["BANDUNG RAYA", "BANDUNG", "BANDUNG 1", "BANDUNG 2"],
    LOMBOK: ["LOMBOK", "SUMBAWA"],
    CILEUNGSI: ["CILEUNGSI", "BOGOR", "BEKASI", "KARAWANG"],
    CIKOKOL: ["CIKOKOL", "PARUNG", "BALARAJA", "SERANG", "BINTAN"], // Added BINTAN to CIKOKOL group
    MEDAN: ["MEDAN", "ACEH"],
    LAMPUNG: ["LAMPUNG", "KOTABUMI"],
    PALEMBANG: ["PALEMBANG", "BENGKULU", "BANGKA", "BELITUNG"],
    SIDOARJO: ["SIDOARJO", "SIDOARJO BPN SMD", "MANOKWARI", "NTT", "SORONG"], // FIX: Use space not underscore
    BANJARMASIN: ["BANJARMASIN", "PALANGKARAYA"],
};

export const GLOBAL_ACCESS_ROLES = [
    "BUILDING & MAINTENANCE SUPER HUMAN",
    "BUILDING MAINTENANCE & ENERGY SYSTEM MANAGER",
    "BUILDING & MAINTENANCE GENERAL MANAGER",
    "STORE & BRANCH CONTROLLING SPECIALIST",
    "PROJECT PLANNING & DEVELOPMENT SPECIALIST",
    "PROJECT PLANNING & DEVELOPMENT MANAGER",
];

const shouldLogDebug = process.env.NODE_ENV !== "production";

export const normalizeBranchScopeName = (value?: string | null): string =>
    String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")        // Multiple spaces → single space
        .replace(/_+/g, " ")         // Underscores → space (FIX for SIDOARJO BPN_SMD)
        .toUpperCase();

const ALL_BRANCHES = Array.from(
    new Set([
        ...Object.values(BRANCH_GROUPS).flat(),
        "LUWU", "REMBANG", "TEGAL", "GORONTALO", "PONTIANAK",
        "CIANJUR", "JEMBER", "BALI", "KLATEN", "MAKASSAR", "PLUMBON",
        "PEKANBARU", "JAMBI", "HEAD OFFICE", "BANDUNG RAYA", "CILACAP",
        "SEMARANG", "MALANG", "MANADO", "BATAM", "MADIUN", "PALEMBANG",
        "BENGKULU", "BANGKA", "BELITUNG", "KOTABUMI", "ACEH", "SUMBAWA",
        "BOGOR", "BEKASI", "KARAWANG", "PARUNG", "BALARAJA", "SERANG", "BINTAN",
        "SIDOARJO BPN SMD", "MANOKWARI", "NTT", "SORONG", "PALANGKARAYA"
    ])
).map(normalizeBranchScopeName).filter(Boolean).sort();

export const getBranchScopeCandidates = (branch?: string | null): string[] => {
    const normalized = normalizeBranchScopeName(branch);
    if (!normalized) return [];

    const candidates = new Set<string>([normalized]);
    for (const [parentBranch, branchGroup] of Object.entries(BRANCH_GROUPS)) {
        if (branchGroup.includes(normalized)) {
            candidates.add(parentBranch);
            branchGroup.forEach(item => candidates.add(item));
        }
    }

    const result = Array.from(candidates);
    if (shouldLogDebug) {
        console.log(`[BRANCH SCOPE] getBranchScopeCandidates('${branch}') → normalized:'${normalized}' → result:`, result);
    }
    return result;
};

export const getDriveBranchParent = (branch?: string | null): string => {
    const normalized = normalizeBranchScopeName(branch);
    if (!normalized) return "CABANG LAINNYA";

    for (const [parentBranch, branchGroup] of Object.entries(BRANCH_GROUPS)) {
        if (branchGroup.includes(normalized)) {
            return parentBranch;
        }
    }
    return normalized;
};

export const getRabPriceBranch = (branch?: string | null): string => {
    const normalized = normalizeBranchScopeName(branch);
    if (!normalized) return "";

    if (BRANCH_GROUPS.CIKOKOL.includes(normalized)) return "CIKOKOL";
    if (BRANCH_GROUPS.CILEUNGSI.includes(normalized)) return "CILEUNGSI";

    return normalized;
};

export const isSameBranchScope = (left?: string | null, right?: string | null): boolean => {
    const normalizedLeft = normalizeBranchScopeName(left);
    const normalizedRight = normalizeBranchScopeName(right);
    if (!normalizedLeft || !normalizedRight) return false;
    if (normalizedLeft === normalizedRight) return true;

    return getBranchScopeCandidates(normalizedLeft).includes(normalizedRight);
};

/**
 * Check if user has global access (can see all branches)
 */
export const hasGlobalAccess = (cabang?: string | null, roles?: string[]): boolean => {
    const isRegionalManager = (roles ?? []).some(role => 
        normalizeBranchScopeName(role).includes("REGIONAL MANAGER")
    );
    
    // Regional Manager TIDAK mendapat akses global, harus mematuhi coverage 2 wilayah
    if (isRegionalManager) return false;

    const normalizedCabang = normalizeBranchScopeName(cabang);
    if (normalizedCabang === "HEAD OFFICE") return true;
    
    return (roles ?? []).some(role => 
        GLOBAL_ACCESS_ROLES.includes(normalizeBranchScopeName(role))
    );
};

/**
 * Check if user has branch support role (can see all branches in their branch group)
 */
export const isBranchSupportRole = (roles?: string[]): boolean => {
    return (roles ?? []).some(role => 
        normalizeBranchScopeName(role).includes("BRANCH BUILDING SUPPORT")
    );
};

const isSuperHumanRole = (roles?: string[]): boolean =>
    (roles ?? []).some(role => normalizeBranchScopeName(role).includes("SUPER HUMAN"));

/**
 * Check if user has a Kontraktor role (KONTRAKTOR or Direktur Kontraktor).
 * Kontraktor gets full branch group access for CIKOKOL/CILEUNGSI — no subdivision.
 */
const isKontraktorRole = (roles?: string[]): boolean =>
    (roles ?? []).some(role => normalizeBranchScopeName(role).includes("KONTRAKTOR"));

/**
 * Get user's coverage branches from user_branch_coverage table
 */
export const getUserCoverageBranches = async (emailSat: string, cabang: string): Promise<string[]> => {
    const result = await pool.query<{ covered_cabang: string }>(
        `
        SELECT DISTINCT ubc.covered_cabang
        FROM user_cabang uc
        JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
        WHERE LOWER(TRIM(uc.email_sat)) = LOWER(TRIM($1))
          AND LOWER(TRIM(uc.cabang)) = LOWER(TRIM($2))
        ORDER BY ubc.covered_cabang ASC
        `,
        [emailSat, cabang]
    );

    return result.rows.map(row => normalizeBranchScopeName(row.covered_cabang)).filter(Boolean);
};

const getBranchGroupOrFallback = (branch?: string | null): string[] => {
    const normalized = normalizeBranchScopeName(branch);
    if (!normalized) return [];
    const group = getBranchScopeCandidates(normalized);
    return group.length > 0 ? group.sort() : [normalized];
};

/**
 * Branches that have specific coverage rules (Manager/Coordinator have subdivisions)
 * Other branches allow all roles to access entire branch group
 */
const BRANCHES_WITH_SPECIFIC_COVERAGE = ["CIKOKOL", "CILEUNGSI"];

/**
 * Check if branch has specific coverage rules
 */
const hasSpecificCoverageRules = (cabang: string): boolean => {
    const normalized = normalizeBranchScopeName(cabang);
    return BRANCHES_WITH_SPECIFIC_COVERAGE.includes(normalized);
};

/**
 * Get effective accessible branches for a user based on role and coverage.
 * This is the single source of truth for branch access logic.
 *
 * Business Rules:
 * 1. Global roles (Superhuman, Regional Manager) → All branches
 * 2. Branch Support role → All branches in branch group
 * 3. CIKOKOL/CILEUNGSI — Kontraktor/Direktur Kontraktor → Full branch group (no subdivision)
 * 4. CIKOKOL/CILEUNGSI — Manager/Coordinator → Coverage from user_branch_coverage (subdivided)
 *    - If no coverage → Fallback to login branch only
 * 5. Other branches (Lombok, Medan, Lampung, etc): ALL roles → Entire branch group
 */
export const getEffectiveBranchesForUser = async (input: {
    emailSat: string;
    cabang: string;
    roles: string[];
}): Promise<{ branches: string[]; source: "global" | "support" | "coverage" | "branch_group" | "fallback" }> => {
    const { emailSat, cabang, roles } = input;
    const normalizedCabang = normalizeBranchScopeName(cabang);

    // 1. Global access
    if (hasGlobalAccess(cabang, roles)) {
        return { branches: ALL_BRANCHES, source: "global" };
    }

    // 2. Branch Support role → Always entire branch group
    if (isBranchSupportRole(roles)) {
        const branchGroup = getBranchScopeCandidates(normalizedCabang);
        return { branches: branchGroup.sort(), source: "support" };
    }

    // 3. Kontraktor & Direktur Kontraktor → Full branch group access (no subdivision)
    // Always override coverage for Kontraktor
    if (isKontraktorRole(roles)) {
        const branchGroup = getBranchScopeCandidates(normalizedCabang);
        return { branches: branchGroup.sort(), source: "branch_group" };
    }

    // PRIORITAS: Cek Coverage Database (Untuk Regional Manager atau Manager subdivisi)
    const coverage = await getUserCoverageBranches(emailSat, cabang);
    if (coverage.length > 0) {
        return { branches: coverage.sort(), source: "coverage" };
    }

    // 4. Check if this branch has specific coverage rules (CIKOKOL/CILEUNGSI only)
    const hasSpecificRules = hasSpecificCoverageRules(normalizedCabang);

    if (hasSpecificRules) {
        // Manager/Coordinator tanpa coverage di atas
        // Fallback: login branch only
        return { 
            branches: normalizedCabang ? [normalizedCabang] : [], 
            source: "fallback" 
        };
    }

    // 5. Other branches (Lombok, Medan, Lampung, etc): ALL roles access entire branch group
    const branchGroup = getBranchScopeCandidates(normalizedCabang);
    return { branches: branchGroup.sort(), source: "branch_group" };
};

/**
 * Branch scope khusus approval.
 *
 * Global view tetap global, tetapi tugas approval tidak ikut global access.
 * Hanya Super Human yang boleh bypass approval branch scope. Role regional
 * manager HEAD OFFICE memakai coverage jika tersedia.
 */
export const getApprovalBranchesForUser = async (input: {
    emailSat: string;
    cabang: string;
    roles: string[];
}): Promise<{ branches: string[]; source: "superhuman" | "global" | "coverage" | "support" | "branch_group" | "fallback" }> => {
    const { emailSat, cabang, roles } = input;
    const normalizedCabang = normalizeBranchScopeName(cabang);

    if (isSuperHumanRole(roles)) {
        return { branches: ALL_BRANCHES, source: "superhuman" };
    }

    if ((roles ?? []).some(r => normalizeBranchScopeName(r).includes("PROJECT PLANNING"))) {
        return { branches: ALL_BRANCHES, source: "global" };
    }

    if (isBranchSupportRole(roles)) {
        return { branches: getBranchGroupOrFallback(normalizedCabang), source: "support" };
    }

    if (isKontraktorRole(roles)) {
        return { branches: getBranchGroupOrFallback(normalizedCabang), source: "branch_group" };
    }

    const coverage = await getUserCoverageBranches(emailSat, cabang);
    if (coverage.length > 0) {
        return { branches: coverage.sort(), source: "coverage" };
    }

    if (hasSpecificCoverageRules(normalizedCabang)) {
        return {
            branches: normalizedCabang ? [normalizedCabang] : [],
            source: "fallback",
        };
    }

    return { branches: getBranchGroupOrFallback(normalizedCabang), source: "branch_group" };
};

/**
 * Branch scope khusus Dashboard Monitoring.
 * Prioritas utama: jika user memiliki coverage di DB, GUNAKAN coverage tersebut.
 * Jika tidak punya, baru fallback ke role (Global / Branch Group).
 */
export const getDashboardBranchesForUser = async (input: {
    emailSat: string;
    cabang: string;
    roles: string[];
}): Promise<{ branches: string[]; source: "global" | "support" | "coverage" | "branch_group" | "fallback" }> => {
    const { emailSat, cabang, roles } = input;
    const normalizedCabang = normalizeBranchScopeName(cabang);

    // 0. Global access
    if (hasGlobalAccess(cabang, roles)) {
        return { branches: ALL_BRANCHES, source: "global" };
    }

    // 1. PRIORITAS UTAMA: Branch Support
    if (isBranchSupportRole(roles)) {
        const branchGroup = getBranchScopeCandidates(normalizedCabang);
        return { branches: branchGroup.sort(), source: "support" };
    }

    // 2. Kontraktor → Selalu mendapat full branch group
    if (isKontraktorRole(roles)) {
        const branchGroup = getBranchScopeCandidates(normalizedCabang);
        return { branches: branchGroup.sort(), source: "branch_group" };
    }

    // 3. Cek Coverage Database
    const coverage = await getUserCoverageBranches(emailSat, cabang);
    if (coverage.length > 0) {
        return { branches: coverage.sort(), source: "coverage" };
    }

    // 4. Jika tidak ada coverage, jalankan logic standar
    const hasSpecificRules = hasSpecificCoverageRules(normalizedCabang);
    if (hasSpecificRules) {
        return { 
            branches: normalizedCabang ? [normalizedCabang] : [], 
            source: "fallback" 
        };
    }

    const branchGroup = getBranchScopeCandidates(normalizedCabang);
    return { branches: branchGroup.sort(), source: "branch_group" };
};
