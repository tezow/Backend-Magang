import { getBranchScopeCandidates, hasGlobalAccess } from "../../common/branch-scope";
import { pool } from "../../db/pool";
import type { AuthenticatedUser } from "../auth/auth-session.service";

type SqlValue = string | number | string[] | null;

export type TaskNotificationItem = {
    id: string;
    entity_type: string;
    entity_id: number;
    id_toko?: number;
    title: string;
    subtitle: string;
    description: string;
    action_label: string;
    action_url: string;
    metadata?: Record<string, unknown>;
};

export type TaskNotificationGroup = {
    key: string;
    action_type: "approval" | "revision" | "input" | "process" | "offer";
    title: string;
    description: string;
    count: number;
    items: TaskNotificationItem[];
};

type NotificationRow = {
    entity_type: string;
    entity_id: number;
    id_toko: number | null;
    title: string | null;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    cabang: string | null;
    status: string | null;
    description: string | null;
    action_label: string;
    action_url: string;
    total_count: number | string;
};

const ITEM_LIMIT = 20;

const normalize = (value?: string | null) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Check if user's ACTIVE role (jabatan) matches the matcher.
 * For multi-role users, only the currently active role is considered.
 */
const hasActiveRole = (user: AuthenticatedUser, matcher: string) => {
    const activeRole = normalize(user.jabatan);
    const normalizedMatcher = normalize(matcher);
    return activeRole.includes(normalizedMatcher);
};

/**
 * Check if user has role in their roles array (for backward compatibility).
 * This checks ALL roles, not just active role.
 */
const hasRole = (user: AuthenticatedUser, matcher: string) =>
    user.roles.some(role => normalize(role).includes(normalize(matcher)));

const hasAnyActiveRole = (user: AuthenticatedUser, matchers: string[]) =>
    matchers.some(matcher => hasActiveRole(user, matcher));

const hasAnyRole = (user: AuthenticatedUser, matchers: string[]) =>
    matchers.some(matcher => hasRole(user, matcher));

const isSuperHuman = (user: AuthenticatedUser) => hasActiveRole(user, "SUPER HUMAN");
const isLiteralActiveRole = (user: AuthenticatedUser, role: string) => normalize(user.jabatan) === normalize(role);
const isHeadOffice = (user: AuthenticatedUser) => normalize(user.cabang) === "HEAD OFFICE";
const isBranchSupportRole = (user: AuthenticatedUser) => hasActiveRole(user, "BRANCH BUILDING SUPPORT");
const isBranchBuildingMaintenanceManager = (user: AuthenticatedUser) =>
    hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER")
    || hasRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER")
    || hasActiveRole(user, "BBMM")
    || hasRole(user, "BBMM");

const canViewAllBranches = (user: AuthenticatedUser) =>
    isHeadOffice(user)
    || hasAnyRole(user, [
        "BUILDING & MAINTENANCE SUPER HUMAN",
        "BUILDING & MAINTENANCE REGIONAL MANAGER",
        "BUILDING MAINTENANCE & ENERGY SYSTEM MANAGER",
        "BUILDING & MAINTENANCE GENERAL MANAGER",
        "STORE & BRANCH CONTROLLING SPECIALIST",
    ]);

type ApprovalStage = "KOORDINATOR" | "MANAGER" | "DIREKTUR" | "DIREKTUR_KONTRAKTOR" | "KONTRAKTOR" | "ALL" | null;

const getApprovalStage = (user: AuthenticatedUser): ApprovalStage => {
    if (isSuperHuman(user)) return "ALL";
    if (hasActiveRole(user, "DIREKTUR KONTRAKTOR")) return "DIREKTUR_KONTRAKTOR";
    if (hasActiveRole(user, "DIREKTUR")) return "DIREKTUR";
    if (hasActiveRole(user, "KONTRAKTOR")) return "KONTRAKTOR";
    if (hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER") || hasActiveRole(user, "BBMM") || isLiteralActiveRole(user, "MANAGER")) return "MANAGER";
    if (hasActiveRole(user, "BRANCH BUILDING COORDINATOR") || isLiteralActiveRole(user, "COORDINATOR") || isLiteralActiveRole(user, "KOORDINATOR")) return "KOORDINATOR";
    return null;
};

const normalizeCompanySql = (expression: string) =>
    `regexp_replace(REPLACE(REPLACE(UPPER(COALESCE(${expression}, '')), 'PT', ''), 'CV', ''), '[^A-Z0-9]', '', 'g')`;

const addBranchScope = (user: AuthenticatedUser, values: SqlValue[], branchExpression: string): string => {
    if (isSuperHuman(user)) return "";
    if (hasGlobalAccess(user.cabang, user.roles)) return "";

    if (isBranchSupportRole(user)) {
        const branches = getBranchScopeCandidates(user.cabang);
        values.push(branches);
        return `AND UPPER(TRIM(COALESCE(${branchExpression}, ''))) = ANY($${values.length}::text[])`;
    }

    // Business Rule Clarification: Only CIKOKOL & CILEUNGSI have subdivision coverage
    // Other branches (Lombok, Medan, Lampung, etc.) get entire branch group
    const normalizedCabang = (user.cabang ?? '').trim().toUpperCase();
    const BRANCHES_WITH_SPECIFIC_COVERAGE = ['CIKOKOL', 'CILEUNGSI'];
    
    if (!BRANCHES_WITH_SPECIFIC_COVERAGE.includes(normalizedCabang)) {
        // Other branches: Return entire branch group (no subdivision)
        const branches = getBranchScopeCandidates(user.cabang);
        values.push(branches);
        return `AND UPPER(TRIM(COALESCE(${branchExpression}, ''))) = ANY($${values.length}::text[])`;
    }

    // CIKOKOL/CILEUNGSI only: Check user_branch_coverage for subdivisions
    values.push(user.email_sat);
    const emailIndex = values.length;
    values.push(user.cabang);
    const cabangIndex = values.length;
    values.push(user.cabang);
    const fallbackCabangIndex = values.length;

    return `
        AND (
            EXISTS (
                SELECT 1
                FROM user_cabang uc_scope
                JOIN user_branch_coverage ubc_scope
                  ON ubc_scope.user_cabang_id = uc_scope.id
                WHERE LOWER(TRIM(uc_scope.email_sat)) = LOWER(TRIM($${emailIndex}))
                  AND LOWER(TRIM(uc_scope.cabang)) = LOWER(TRIM($${cabangIndex}))
                  AND UPPER(TRIM(ubc_scope.covered_cabang)) = UPPER(TRIM(COALESCE(${branchExpression}, '')))
            )
            OR (
                NOT EXISTS (
                    SELECT 1
                    FROM user_cabang uc_scope
                    JOIN user_branch_coverage ubc_scope
                      ON ubc_scope.user_cabang_id = uc_scope.id
                    WHERE LOWER(TRIM(uc_scope.email_sat)) = LOWER(TRIM($${emailIndex}))
                      AND LOWER(TRIM(uc_scope.cabang)) = LOWER(TRIM($${cabangIndex}))
                )
                AND UPPER(TRIM(COALESCE(${branchExpression}, ''))) = UPPER(TRIM($${fallbackCabangIndex}))
            )
        )
    `;
};

const addApprovalBranchScope = (user: AuthenticatedUser, values: SqlValue[], branchExpression: string): string => {
    if (isSuperHuman(user)) return "";
    if (hasGlobalAccess(user.cabang, user.roles)) return "";

    values.push(user.email_sat);
    const emailIndex = values.length;
    values.push(user.cabang);
    const cabangIndex = values.length;
    values.push(getBranchScopeCandidates(user.cabang));
    const branchGroupIndex = values.length;
    const normalizedBranchExpression = `REPLACE(UPPER(TRIM(COALESCE(${branchExpression}, ''))), '_', ' ')`;

    return `
        AND (
            (
                EXISTS (
                    SELECT 1
                    FROM user_cabang uc_scope
                    JOIN user_branch_coverage ubc_scope
                      ON ubc_scope.user_cabang_id = uc_scope.id
                    WHERE LOWER(TRIM(uc_scope.email_sat)) = LOWER(TRIM($${emailIndex}))
                      AND LOWER(TRIM(uc_scope.cabang)) = LOWER(TRIM($${cabangIndex}))
                )
                AND EXISTS (
                    SELECT 1
                    FROM user_cabang uc_scope
                    JOIN user_branch_coverage ubc_scope
                      ON ubc_scope.user_cabang_id = uc_scope.id
                    WHERE LOWER(TRIM(uc_scope.email_sat)) = LOWER(TRIM($${emailIndex}))
                      AND LOWER(TRIM(uc_scope.cabang)) = LOWER(TRIM($${cabangIndex}))
                      AND REPLACE(UPPER(TRIM(ubc_scope.covered_cabang)), '_', ' ') = ${normalizedBranchExpression}
                )
            )
            OR (
                NOT EXISTS (
                    SELECT 1
                    FROM user_cabang uc_scope
                    JOIN user_branch_coverage ubc_scope
                      ON ubc_scope.user_cabang_id = uc_scope.id
                    WHERE LOWER(TRIM(uc_scope.email_sat)) = LOWER(TRIM($${emailIndex}))
                      AND LOWER(TRIM(uc_scope.cabang)) = LOWER(TRIM($${cabangIndex}))
                )
                AND ${normalizedBranchExpression} = ANY($${branchGroupIndex}::text[])
            )
        )
    `;
};

const addCompanyScope = (user: AuthenticatedUser, values: SqlValue[], companyExpression: string): string => {
    if (!hasActiveRole(user, "KONTRAKTOR")) return "";
    if (!user.nama_pt) return "AND FALSE";
    values.push(user.nama_pt);
    return `AND ${normalizeCompanySql(companyExpression)} = ${normalizeCompanySql(`$${values.length}::text`)}`;
};

const toCount = (rows: NotificationRow[]) => {
    if (rows.length === 0) return 0;
    const totalsByEntity = new Map<string, number>();
    for (const row of rows) {
        const total = Number(row.total_count) || 0;
        totalsByEntity.set(row.entity_type, Math.max(totalsByEntity.get(row.entity_type) ?? 0, total));
    }
    return Array.from(totalsByEntity.values()).reduce((sum, total) => sum + total, 0);
};

const toItems = (rows: NotificationRow[]): TaskNotificationItem[] =>
    rows.map(row => ({
        id: `${row.entity_type}-${row.entity_id}`,
        entity_type: row.entity_type,
        entity_id: Number(row.entity_id),
        id_toko: row.id_toko ? Number(row.id_toko) : undefined,
        title: row.title || row.nomor_ulok || "Dokumen",
        subtitle: [row.nomor_ulok, row.lingkup_pekerjaan, row.cabang].filter(Boolean).join(" | "),
        description: row.description || row.status || "Perlu tindakan",
        action_label: row.action_label,
        action_url: row.action_url,
        metadata: {
            status: row.status,
            cabang: row.cabang,
        },
    }));

const makeGroup = (
    key: string,
    actionType: TaskNotificationGroup["action_type"],
    title: string,
    description: string,
    rows: NotificationRow[]
): TaskNotificationGroup | null => {
    const count = toCount(rows);
    if (count <= 0) return null;
    return {
        key,
        action_type: actionType,
        title,
        description,
        count,
        items: toItems(rows),
    };
};

const mergeRows = (...sources: NotificationRow[][]) => sources.flat();

const queryNotificationRows = async (sql: string, values: SqlValue[]) => {
    const result = await pool.query<NotificationRow>(sql, values);
    return result.rows;
};

const findRabApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const stage = getApprovalStage(user);
    if (!stage || stage === "KONTRAKTOR") return [];

    const values: SqlValue[] = [];
    const statuses = stage === "ALL"
        ? ["Menunggu Persetujuan Koordinator", "Menunggu Persetujuan Manajer", "Menunggu Persetujuan Direktur Kontraktor"]
        : stage === "KOORDINATOR"
            ? ["Menunggu Persetujuan Koordinator"]
            : stage === "MANAGER"
                ? ["Menunggu Persetujuan Manajer"]
                : stage === "DIREKTUR" || stage === "DIREKTUR_KONTRAKTOR"
                    ? ["Menunggu Persetujuan Direktur Kontraktor"]
                    : [];

    if (statuses.length === 0) return [];

    values.push(statuses);
    const branchWhere = addApprovalBranchScope(user, values, "t.cabang");
    const companyWhere = addCompanyScope(user, values, "r.nama_pt");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'RAB' AS entity_type,
            r.id AS entity_id,
            r.id_toko,
            COALESCE(t.nama_toko, t.nomor_ulok) AS title,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.cabang,
            r.nama_pt,
            r.status,
            'RAB menunggu approval sesuai role Anda.' AS description,
            'Buka Approval RAB' AS action_label,
            '/approval?type=RAB&id=' || r.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM rab r
        JOIN toko t ON t.id = r.id_toko
        WHERE r.status = ANY($1::text[])
          ${branchWhere}
          ${companyWhere}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $${values.length}
    `, values);
};

const findSpkApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH MANAGER")) return [];
    const values: SqlValue[] = [];
    const branchWhere = addApprovalBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'SPK' AS entity_type,
            p.id AS entity_id,
            p.id_toko,
            COALESCE(t.nama_toko, p.nomor_ulok) AS title,
            p.nomor_ulok,
            p.lingkup_pekerjaan,
            t.cabang,
            p.status,
            'SPK menunggu approval Branch Manager.' AS description,
            'Buka Approval SPK' AS action_label,
            '/approval?type=SPK&id=' || p.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM pengajuan_spk p
        LEFT JOIN toko t ON t.id = p.id_toko
        WHERE p.status = 'WAITING_FOR_BM_APPROVAL'
          ${branchWhere}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${values.length}
    `, values);
};

const findPertambahanSpkApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH MANAGER")) return [];
    const values: SqlValue[] = [];
    const branchWhere = addApprovalBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'PERTAMBAHAN_SPK' AS entity_type,
            p.id::int AS entity_id,
            s.id_toko,
            COALESCE(t.nama_toko, s.nomor_ulok, s.nomor_spk) AS title,
            s.nomor_ulok,
            s.lingkup_pekerjaan,
            t.cabang,
            p.status_persetujuan AS status,
            'Pertambahan SPK menunggu approval Branch Manager.' AS description,
            'Buka Approval Pertambahan SPK' AS action_label,
            '/approval?type=PERTAMBAHAN_SPK&id=' || p.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM pertambahan_spk p
        JOIN pengajuan_spk s ON s.id = p.id_spk
        LEFT JOIN toko t ON t.id = s.id_toko
        WHERE p.status_persetujuan = 'Menunggu Persetujuan'
          ${branchWhere}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${values.length}
    `, values);
};

const findOpnameApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const stage = getApprovalStage(user);
    if (!stage) return [];

    const values: SqlValue[] = [];
    const statuses = stage === "ALL"
        ? ["Menunggu Persetujuan Koordinator", "Menunggu Persetujuan Manajer", "Menunggu Persetujuan Direktur Kontraktor"]
        : stage === "KOORDINATOR"
            ? ["Menunggu Persetujuan Koordinator"]
            : stage === "MANAGER"
                ? ["Menunggu Persetujuan Manajer"]
                : stage === "DIREKTUR_KONTRAKTOR"
                    ? ["Menunggu Persetujuan Direktur Kontraktor"]
                    : [];

    if (statuses.length === 0) return [];

    values.push(statuses);
    const branchWhere = addApprovalBranchScope(user, values, "t.cabang");
    const companyWhere = addCompanyScope(user, values, "t.nama_kontraktor");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'OPNAME' AS entity_type,
            ofn.id AS entity_id,
            ofn.id_toko,
            COALESCE(t.nama_toko, t.nomor_ulok) AS title,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.cabang,
            t.nama_kontraktor,
            ofn.status_opname_final AS status,
            'KTK menunggu approval sesuai role Anda.' AS description,
            'Buka Approval KTK' AS action_label,
            '/approval?type=OPNAME&id=' || ofn.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM opname_final ofn
        JOIN toko t ON t.id = ofn.id_toko
        WHERE ofn.aksi = 'terkunci'
          AND ofn.tipe_opname = 'OPNAME_FINAL'
          AND ofn.status_opname_final = ANY($1::text[])
          ${branchWhere}
          ${companyWhere}
        ORDER BY ofn.created_at DESC, ofn.id DESC
        LIMIT $${values.length}
    `, values);
};

const findInstruksiLapanganApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const stage = getApprovalStage(user);
    if (!stage || stage === "DIREKTUR" || stage === "DIREKTUR_KONTRAKTOR" || stage === "KONTRAKTOR") return [];

    const values: SqlValue[] = [];
    const isBatamKoordinator = stage === "KOORDINATOR" && user.cabang?.toUpperCase() === "BATAM";
    const statuses = stage === "ALL" || isBatamKoordinator
        ? ["Menunggu Persetujuan Koordinator", "Menunggu Persetujuan Manager"]
        : stage === "KOORDINATOR"
            ? ["Menunggu Persetujuan Koordinator"]
            : ["Menunggu Persetujuan Manager"];

    values.push(statuses);
    const branchWhere = addApprovalBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'INSTRUKSI_LAPANGAN' AS entity_type,
            il.id AS entity_id,
            il.id_toko,
            COALESCE(t.nama_toko, t.nomor_ulok) AS title,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.cabang,
            il.status,
            'Instruksi Lapangan menunggu approval sesuai role Anda.' AS description,
            'Buka Approval IL' AS action_label,
            '/approval?type=INSTRUKSI_LAPANGAN&id=' || il.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM instruksi_lapangan il
        JOIN toko t ON t.id = il.id_toko
        WHERE il.status = ANY($1::text[])
          ${branchWhere}
        ORDER BY il.created_at DESC, il.id DESC
        LIMIT $${values.length}
    `, values);
};

const findProjectPlanningApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const isBmManager = hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER") || hasActiveRole(user, "BBMM");
    const isBmRegionalManager =
        hasActiveRole(user, "BUILDING & MAINTENANCE REGIONAL MANAGER")
        || hasActiveRole(user, "B&M REGIONAL")
        || hasActiveRole(user, "REGIONAL MANAGER");
    const isPpSpecialist = hasActiveRole(user, "PROJECT PLANNING & DEVELOPMENT SPECIALIST") || hasActiveRole(user, "PP SPECIALIST");
    const isPpManager = hasActiveRole(user, "PROJECT PLANNING & DEVELOPMENT MANAGER") || hasActiveRole(user, "PP MANAGER");
    if (!isSuperHuman(user) && !isBmManager && !isBmRegionalManager && !isPpSpecialist && !isPpManager) return [];

    const statusConditions: string[] = [];
    if (isSuperHuman(user)) {
        statusConditions.push("pp.status IN ('WAITING_BM_APPROVAL', 'WAITING_PP_APPROVAL_1', 'PP_DESIGN_3D_REQUIRED', 'WAITING_BM_APPROVAL_2', 'WAITING_BM_REGIONAL_APPROVAL', 'WAITING_PP_MANAGER_APPROVAL', 'WAITING_PP_APPROVAL_2')");
    } else {
        if (isBmManager) statusConditions.push("pp.status IN ('WAITING_BM_APPROVAL', 'WAITING_BM_APPROVAL_2')");
        if (isBmRegionalManager) statusConditions.push("pp.status = 'WAITING_BM_REGIONAL_APPROVAL'");
        if (isPpSpecialist) statusConditions.push("pp.status IN ('WAITING_PP_APPROVAL_1', 'PP_DESIGN_3D_REQUIRED', 'WAITING_PP_APPROVAL_2')");
        if (isPpManager) statusConditions.push("pp.status = 'WAITING_PP_MANAGER_APPROVAL'");
    }

    const values: SqlValue[] = [];
    const branchWhere = addApprovalBranchScope(user, values, "pp.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'PROJECT_PLANNING' AS entity_type,
            pp.id AS entity_id,
            pp.id_toko,
            COALESCE(pp.nama_toko, pp.nama_lokasi, pp.nomor_ulok) AS title,
            pp.nomor_ulok,
            pp.lingkup_pekerjaan,
            pp.cabang,
            pp.status,
            'Project Planning menunggu approval sesuai role Anda.' AS description,
            'Buka Approval Project Planning' AS action_label,
            '/approval?type=PROJECT_PLANNING&id=' || pp.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM projek_planning pp
        WHERE (${statusConditions.join(" OR ")})
          ${branchWhere}
        ORDER BY pp.created_at DESC, pp.id DESC
        LIMIT $${values.length}
    `, values);
};

const findDendaActionApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    // Only Branch Building & Maintenance Manager can approve SP.
    if (!isBranchBuildingMaintenanceManager(user) && !isSuperHuman(user)) return [];

    const values: SqlValue[] = [];
    const branchWhere = addApprovalBranchScope(user, values, "d.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'SURAT_PERINGATAN' AS entity_type,
            d.id AS entity_id,
            d.id_toko,
            COALESCE(t.nama_toko, d.nomor_ulok, 'Surat Peringatan') AS title,
            d.nomor_ulok,
            NULL AS lingkup_pekerjaan,
            d.cabang,
            d.status,
            'Surat Peringatan menunggu approval Manager.' AS description,
            'Buka Approval SP' AS action_label,
            '/approval?type=SURAT_PERINGATAN&id=' || d.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM denda_keterlambatan_action d
        LEFT JOIN toko t ON t.id = d.id_toko
        WHERE d.action_type = 'SP'
          AND d.status = 'WAITING_MANAGER'
          ${branchWhere}
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT $${values.length}
    `, values);
};

const findRequestIntervensiApproval = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const values: SqlValue[] = [];
    const normalizedRole = normalize(user.jabatan);
    let statuses: string[] = [];

    if (isSuperHuman(user)) {
        statuses = ["WAITING_BM_APPROVAL", "WAITING_SBCS_APPROVAL", "WAITING_REGIONAL_MANAGER_APPROVAL"];
    } else if (
        normalizedRole.includes("BRANCH BUILDING & MAINTENANCE MANAGER") ||
        normalizedRole.includes("B&M MANAGER") ||
        normalizedRole === "MANAGER"
    ) {
        statuses = ["WAITING_BM_APPROVAL"];
    } else if (normalizedRole.includes("STORE & BRANCH CONTROLLING")) {
        statuses = ["WAITING_SBCS_APPROVAL"];
    } else if (
        normalizedRole.includes("BUILDING & MAINTENANCE REGIONAL MANAGER") ||
        normalizedRole.includes("B&M REGIONAL") ||
        normalizedRole.includes("REGIONAL MANAGER")
    ) {
        statuses = ["WAITING_REGIONAL_MANAGER_APPROVAL"];
    }

    if (statuses.length === 0) return [];

    values.push(statuses);
    const branchWhere = addApprovalBranchScope(user, values, "ri.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'INTERVENSI' AS entity_type,
            ri.id AS entity_id,
            ri.id_toko,
            COALESCE(ri.nama_toko, ri.nomor_ulok, ri.nomor_request) AS title,
            ri.nomor_ulok,
            ri.lingkup_pekerjaan,
            ri.cabang,
            ri.status_request AS status,
            'Request intervensi menunggu persetujuan role Anda.' AS description,
            'Buka Approval Intervensi' AS action_label,
            '/approval?type=INTERVENSI&id=' || ri.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM request_intervensi ri
        WHERE ri.status_request = ANY($1::text[])
          ${branchWhere}
        ORDER BY ri.created_at DESC, ri.id DESC
        LIMIT $${values.length}
    `, values);
};

const findDendaActionToAcknowledge = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    // Only Contractor sees the approved SP for acknowledgement
    if (!hasActiveRole(user, "KONTRAKTOR") && !isSuperHuman(user)) return [];

    const values: SqlValue[] = [];
    const companyWhere = addCompanyScope(user, values, "d.nama_kontraktor");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'SURAT_PERINGATAN_KONTRAKTOR' AS entity_type,
            d.id AS entity_id,
            d.id_toko,
            COALESCE(t.nama_toko, d.nomor_ulok, 'Surat Peringatan') AS title,
            d.nomor_ulok,
            NULL AS lingkup_pekerjaan,
            d.cabang,
            d.status,
            'Surat Peringatan baru diterbitkan. Harap segera disetujui.' AS description,
            'Lihat SP' AS action_label,
            '/surat-peringatan' AS action_url,
            COUNT(*) OVER() AS total_count
        FROM denda_keterlambatan_action d
        LEFT JOIN toko t ON t.id = d.id_toko
        WHERE d.action_type = 'SP'
          AND d.status IN ('SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR')
          ${companyWhere}
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT $${values.length}
    `, values);
};

const findPendingOpnameFromGantt = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH BUILDING SUPPORT")) return [];

    const values: SqlValue[] = [];
    const branchWhere = addBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        WITH latest_gantt AS (
            SELECT DISTINCT ON (id_toko) id, id_toko
            FROM gantt_chart
            ORDER BY id_toko, id DESC
        ),
        completed_pengawasan AS (
            SELECT lg.id_toko, p.kategori_pekerjaan
            FROM pengawasan p
            JOIN latest_gantt lg ON lg.id = p.id_gantt
            WHERE LOWER(p.status) = 'selesai'
        ),
        opname_items AS (
            SELECT ofn.id_toko, COALESCE(ri.kategori_pekerjaan, ili.kategori_pekerjaan) AS kategori_pekerjaan
            FROM opname_item oi
            JOIN opname_final ofn ON ofn.id = oi.id_opname_final
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
            WHERE COALESCE(ofn.status_opname_final, '') NOT IN ('Ditolak', 'Batal')
        ),
        missing_opname AS (
            SELECT cp.id_toko, cp.kategori_pekerjaan
            FROM completed_pengawasan cp
            LEFT JOIN opname_items oi ON oi.id_toko = cp.id_toko AND LOWER(TRIM(oi.kategori_pekerjaan)) = LOWER(TRIM(cp.kategori_pekerjaan))
            WHERE oi.kategori_pekerjaan IS NULL
        ),
        grouped_missing AS (
            SELECT id_toko, STRING_AGG(DISTINCT kategori_pekerjaan, ', ') as missing_items, COUNT(DISTINCT kategori_pekerjaan)::int as missing_count
            FROM missing_opname
            GROUP BY id_toko
        )
        SELECT
            'PENDING_OPNAME_GANTT' AS entity_type,
            t.id AS entity_id,
            t.id AS id_toko,
            COALESCE(t.nama_toko, t.nomor_ulok) AS title,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.cabang,
            'Opname Belum Diisi (' || gm.missing_count || ' Item)' AS status,
            'Progress pengawasan selesai tapi belum di-Opname: ' || gm.missing_items AS description,
            'Isi Opname' AS action_label,
            '/opname?id_toko=' || t.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM grouped_missing gm
        JOIN toko t ON t.id = gm.id_toko
        WHERE 1=1
          ${branchWhere}
        ORDER BY t.id DESC
        LIMIT $${values.length}
    `, values);
};

const findSupportKtkReady = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH BUILDING SUPPORT")) return [];

    const values: SqlValue[] = [];
    const branchWhere = addBranchScope(user, values, "t.cabang");
    
    let picJoin = "";
    if (!isSuperHuman(user)) {
        values.push(user.nama_lengkap ?? "");
        picJoin = `
        JOIN pic_pengawasan pic ON pic.id_toko = laf.id_toko
          AND UPPER(TRIM(COALESCE(pic.plc_building_support, ''))) = UPPER(TRIM($${values.length}))
        `;
    }

    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        WITH latest_active_final AS (
            SELECT DISTINCT ON (ofn.id_toko)
                ofn.id,
                ofn.id_toko,
                ofn.created_at
            FROM opname_final ofn
            WHERE COALESCE(ofn.aksi, 'active') <> 'terkunci'
              AND COALESCE(ofn.status_opname_final, '') = 'Proses KTK/Approval Kontraktor'
            ORDER BY ofn.id_toko, ofn.id DESC
        ),
        latest_approved_rab AS (
            SELECT DISTINCT ON (r.id_toko)
                r.id,
                r.id_toko
            FROM rab r
            WHERE UPPER(COALESCE(r.status, '')) IN ('DISETUJUI', 'APPROVED')
            ORDER BY r.id_toko, r.created_at DESC, r.id DESC
        ),
        expected_rab AS (
            SELECT lar.id_toko, COUNT(ri.id)::int AS expected_count
            FROM latest_approved_rab lar
            JOIN rab_item ri ON ri.id_rab = lar.id
            GROUP BY lar.id_toko
        ),
        expected_il AS (
            SELECT il.id_toko, COUNT(ili.id)::int AS expected_count
            FROM instruksi_lapangan il
            JOIN instruksi_lapangan_item ili ON ili.id_instruksi_lapangan = il.id
            WHERE UPPER(COALESCE(il.status, '')) IN ('DISETUJUI', 'APPROVED')
            GROUP BY il.id_toko
        ),
        expected_total AS (
            SELECT id_toko, SUM(expected_count)::int AS expected_count
            FROM (
                SELECT * FROM expected_rab
                UNION ALL
                SELECT * FROM expected_il
            ) expected_sources
            GROUP BY id_toko
        ),
        approved_latest_items AS (
            SELECT latest_items.id_opname_final, COUNT(*)::int AS approved_count
            FROM (
                SELECT DISTINCT ON (
                    oi.id_opname_final,
                    COALESCE('rab:' || oi.id_rab_item::text, 'il:' || oi.id_instruksi_lapangan_item::text)
                )
                    oi.id_opname_final,
                    oi.status
                FROM opname_item oi
                JOIN latest_active_final laf ON laf.id = oi.id_opname_final
                WHERE oi.id_rab_item IS NOT NULL OR oi.id_instruksi_lapangan_item IS NOT NULL
                ORDER BY
                    oi.id_opname_final,
                    COALESCE('rab:' || oi.id_rab_item::text, 'il:' || oi.id_instruksi_lapangan_item::text),
                    oi.id DESC
            ) latest_items
            WHERE LOWER(COALESCE(latest_items.status, '')) = 'disetujui'
            GROUP BY latest_items.id_opname_final
        )
        SELECT
            'OPNAME_FINAL_READY' AS entity_type,
            laf.id AS entity_id,
            laf.id_toko,
            COALESCE(t.nama_toko, t.nomor_ulok) AS title,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.cabang,
            'Proses KTK/Approval Kontraktor' AS status,
            COALESCE(ali.approved_count, 0)::text || '/' || COALESCE(et.expected_count, 0)::text || ' item sudah disetujui kontraktor. Support perlu proses/finalisasi KTK.' AS description,
            'Proses KTK' AS action_label,
            '/opname?id_toko=' || laf.id_toko || '&opname_final_id=' || laf.id || '&mode=finalisasi_ktk' AS action_url,
            COUNT(*) OVER() AS total_count
        FROM latest_active_final laf
        JOIN toko t ON t.id = laf.id_toko
        JOIN expected_total et ON et.id_toko = laf.id_toko
        JOIN approved_latest_items ali ON ali.id_opname_final = laf.id${picJoin}
        WHERE COALESCE(et.expected_count, 0) > 0
          AND COALESCE(ali.approved_count, 0) >= COALESCE(et.expected_count, 0)
          ${branchWhere}
        ORDER BY laf.created_at DESC, laf.id DESC
        LIMIT $${values.length}
    `, values);
};

const findRevisionRequired = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const rows: NotificationRow[][] = [];
    const userEmail = normalize(user.email_sat);

    // RAB Revision - hanya untuk role KONTRAKTOR aktif (bukan DIREKTUR KONTRAKTOR)
    // Check: Active role harus "KONTRAKTOR" dan BUKAN "DIREKTUR KONTRAKTOR"
    const isKontraktorOnly = hasActiveRole(user, "KONTRAKTOR") && !hasActiveRole(user, "DIREKTUR KONTRAKTOR");
    
    if (isSuperHuman(user) || isKontraktorOnly) {
        const values: SqlValue[] = [];
        const companyWhere = addCompanyScope(user, values, "r.nama_pt");
        let emailCondition = "TRUE";
        if (!isSuperHuman(user)) {
            values.push(userEmail);
            const emailPlaceholder = `$${values.length}`;
            emailCondition = `(UPPER(TRIM(COALESCE(r.email_pembuat, ''))) = ${emailPlaceholder} ${companyWhere ? `OR ${companyWhere.replace(/^AND\s+/, "")}` : ""})`;
        }
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'RAB_REJECTED' AS entity_type,
                r.id AS entity_id,
                r.id_toko,
                COALESCE(t.nama_toko, t.nomor_ulok) AS title,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.cabang,
                r.status,
                COALESCE('Alasan: ' || NULLIF(r.alasan_penolakan, ''), 'RAB perlu direvisi dan diajukan ulang.') AS description,
                'Revisi RAB' AS action_label,
                '/rab?revision_id=' || r.id AS action_url,
                COUNT(*) OVER() AS total_count
            FROM rab r
            JOIN toko t ON t.id = r.id_toko
            WHERE r.status IN ('Ditolak oleh Koordinator', 'Ditolak oleh Manajer', 'Ditolak oleh Direktur Kontraktor')
              AND ${emailCondition}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING COORDINATOR") || hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "t.cabang");
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'SPK_REJECTED' AS entity_type,
                p.id AS entity_id,
                p.id_toko,
                COALESCE(t.nama_toko, p.nomor_ulok) AS title,
                p.nomor_ulok,
                p.lingkup_pekerjaan,
                t.cabang,
                p.status,
                COALESCE('Alasan: ' || NULLIF(p.alasan_penolakan, ''), 'SPK perlu diperbaiki/diajukan ulang.') AS description,
                'Revisi SPK' AS action_label,
                '/spk?spk_id=' || p.id || '&nomor_ulok=' || COALESCE(p.nomor_ulok, '') || '&lingkup=' || replace(replace(COALESCE(p.lingkup_pekerjaan, ''), '&', '%26'), ' ', '%20') || '&id_toko=' || COALESCE(p.id_toko::text, '') AS action_url,
                COUNT(*) OVER() AS total_count
            FROM pengajuan_spk p
            LEFT JOIN toko t ON t.id = p.id_toko
            WHERE p.status = 'SPK_REJECTED'
              ${branchWhere}
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING COORDINATOR")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "ri.cabang");
        let ownerCondition = "TRUE";
        if (!isSuperHuman(user)) {
            values.push(userEmail);
            ownerCondition = "UPPER(TRIM(COALESCE(ri.submitted_by, ''))) = UPPER(TRIM($" + values.length + "))";
        }
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'INTERVENSI_REVISION' AS entity_type,
                ri.id AS entity_id,
                ri.id_toko,
                COALESCE(ri.nama_toko, ri.nomor_ulok, ri.nomor_request) AS title,
                ri.nomor_ulok,
                ri.lingkup_pekerjaan,
                ri.cabang,
                ri.status_request AS status,
                COALESCE('Alasan: ' || NULLIF(ri.rejection_reason, ''), 'Request intervensi perlu direvisi dan diajukan ulang.') AS description,
                'Revisi Intervensi' AS action_label,
                '/request-intervensi?id=' || ri.id AS action_url,
                COUNT(*) OVER() AS total_count
            FROM request_intervensi ri
            WHERE ri.status_request = 'REVISION_REQUESTED'
              ${branchWhere}
              AND ${ownerCondition}
            ORDER BY ri.updated_at DESC, ri.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING COORDINATOR") || hasActiveRole(user, "KOORDINATOR") || hasActiveRole(user, "COORDINATOR")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "d.cabang");
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'SURAT_PERINGATAN_REJECTED' AS entity_type,
                d.id AS entity_id,
                d.id_toko,
                COALESCE(t.nama_toko, d.nomor_ulok, 'Surat Peringatan') AS title,
                d.nomor_ulok,
                NULL AS lingkup_pekerjaan,
                d.cabang,
                d.status,
                COALESCE('Alasan Penolakan: ' || NULLIF(d.manager_rejected_reason, ''), 'Surat Peringatan ditolak oleh Branch Manager, perlu diperbaiki.') AS description,
                'Revisi SP' AS action_label,
                '/surat-peringatan' AS action_url,
                COUNT(*) OVER() AS total_count
            FROM denda_keterlambatan_action d
            LEFT JOIN toko t ON t.id = d.id_toko
            WHERE d.action_type = 'SP'
              AND d.status = 'REJECTED_BY_MANAGER'
              ${branchWhere}
            ORDER BY d.created_at DESC, d.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER") || hasActiveRole(user, "BRANCH BUILDING SUPPORT DOKUMENTASI")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "t.cabang");
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'PERTAMBAHAN_SPK_REJECTED' AS entity_type,
                p.id::int AS entity_id,
                s.id_toko,
                COALESCE(t.nama_toko, s.nomor_ulok, s.nomor_spk) AS title,
                s.nomor_ulok,
                s.lingkup_pekerjaan,
                t.cabang,
                p.status_persetujuan AS status,
                COALESCE('Alasan: ' || NULLIF(p.alasan_penolakan, ''), 'Pertambahan SPK perlu diperbaiki.') AS description,
                'Revisi Pertambahan SPK' AS action_label,
                '/tambahspk?spk_id=' || p.id_spk || '&pertambahan_id=' || p.id AS action_url,
                COUNT(*) OVER() AS total_count
            FROM pertambahan_spk p
            JOIN pengajuan_spk s ON s.id = p.id_spk
            LEFT JOIN toko t ON t.id = s.id_toko
            WHERE p.status_persetujuan = 'Ditolak BM'
              ${branchWhere}
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING SUPPORT")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "t.cabang");
        let emailCondition = "TRUE";
        if (!isSuperHuman(user)) {
            values.push(userEmail);
            emailCondition = `UPPER(TRIM(COALESCE(il.email_pembuat, ''))) = $${values.length}`;
        }
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'INSTRUKSI_LAPANGAN_REJECTED' AS entity_type,
                il.id AS entity_id,
                il.id_toko,
                COALESCE(t.nama_toko, t.nomor_ulok) AS title,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.cabang,
                il.status,
                COALESCE('Alasan: ' || NULLIF(il.alasan_penolakan, ''), 'Instruksi Lapangan perlu diperbaiki.') AS description,
                'Revisi Instruksi Lapangan' AS action_label,
                '/instruksi-lapangan?revision_id=' || il.id || '&id_toko=' || il.id_toko AS action_url,
                COUNT(*) OVER() AS total_count
            FROM instruksi_lapangan il
            JOIN toko t ON t.id = il.id_toko
            WHERE UPPER(COALESCE(il.status, '')) LIKE '%DITOLAK%'
              ${branchWhere}
              AND ${emailCondition}
            ORDER BY il.created_at DESC, il.id DESC
            LIMIT $${values.length}
        `, values));
    }

    if (isSuperHuman(user) || hasActiveRole(user, "BRANCH BUILDING SUPPORT")) {
        const values: SqlValue[] = [];
        const branchWhere = addBranchScope(user, values, "t.cabang");
        let emailCondition = "TRUE";
        if (!isSuperHuman(user)) {
            values.push(userEmail);
            emailCondition = `UPPER(TRIM(COALESCE(ofn.email_pembuat, ''))) = $${values.length}`;
        }
        values.push(ITEM_LIMIT);
        rows.push(await queryNotificationRows(`
            SELECT
                'OPNAME_FINAL_REJECTED' AS entity_type,
                ofn.id AS entity_id,
                ofn.id_toko,
                COALESCE(t.nama_toko, t.nomor_ulok) AS title,
                t.nomor_ulok,
                t.lingkup_pekerjaan,
                t.cabang,
                ofn.status_opname_final AS status,
                COALESCE('Alasan: ' || NULLIF(ofn.alasan_penolakan, ''), 'KTK perlu diperbaiki.') AS description,
                'Revisi KTK' AS action_label,
                '/opname?id_toko=' || ofn.id_toko || '&opname_final_id=' || ofn.id || '&mode=revisi_ktk' AS action_url,
                COUNT(*) OVER() AS total_count
            FROM opname_final ofn
            JOIN toko t ON t.id = ofn.id_toko
            WHERE ofn.tipe_opname = 'OPNAME_FINAL'
              AND ofn.status_opname_final IN ('Ditolak oleh Koordinator', 'Ditolak oleh Manajer', 'Ditolak oleh Direktur Kontraktor')
              ${branchWhere}
              AND ${emailCondition}
            ORDER BY ofn.created_at DESC, ofn.id DESC
            LIMIT $${values.length}
        `, values));
    }

    return mergeRows(...rows);
};

const findPicAssignmentRequired = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH BUILDING COORDINATOR") && !hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER")) {
        return [];
    }

    const values: SqlValue[] = [];
    const branchWhere = addBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        WITH missing_pic AS (
            SELECT
                p.id AS entity_id,
                p.id_toko,
                COALESCE(t.nama_toko, p.nomor_ulok) AS title,
                p.nomor_ulok,
                UPPER(TRIM(p.lingkup_pekerjaan)) AS lingkup_pekerjaan,
                t.cabang,
                p.status,
                p.created_at
            FROM pengajuan_spk p
            LEFT JOIN toko t ON t.id = p.id_toko
            WHERE p.status = 'SPK_APPROVED'
              ${branchWhere}
              AND NOT EXISTS (
                  SELECT 1
                  FROM pic_pengawasan pic
                  WHERE pic.id_spk = p.id
                     OR pic.id_toko = p.id_toko
              )
        ), unique_lingkup AS (
            SELECT DISTINCT nomor_ulok, lingkup_pekerjaan
            FROM missing_pic
        ), aggregated_lingkup AS (
            SELECT nomor_ulok, STRING_AGG(lingkup_pekerjaan, ' + ' ORDER BY lingkup_pekerjaan DESC) AS lingkup_pekerjaan
            FROM unique_lingkup
            GROUP BY nomor_ulok
        ), grouped_missing AS (
            SELECT 
                m.nomor_ulok,
                MAX(m.title) AS title,
                MAX(m.cabang) AS cabang,
                MAX(m.status) AS status,
                al.lingkup_pekerjaan,
                MAX(m.entity_id) AS entity_id,
                MAX(m.id_toko) AS id_toko,
                MAX(m.created_at) AS max_created_at
            FROM missing_pic m
            JOIN aggregated_lingkup al ON al.nomor_ulok = m.nomor_ulok
            GROUP BY m.nomor_ulok, al.lingkup_pekerjaan
        )
        SELECT
            'PIC_PENGAWASAN_MISSING' AS entity_type,
            entity_id,
            id_toko,
            title,
            nomor_ulok,
            lingkup_pekerjaan,
            cabang,
            status,
            'SPK sudah approved, tetapi PIC pengawasan belum ditentukan.' AS description,
            'Input PIC' AS action_label,
            '/inputpic?ulok=' || nomor_ulok || '&lingkup=' || REPLACE(COALESCE(lingkup_pekerjaan, ''), ' ', '%20') AS action_url,
            COUNT(*) OVER() AS total_count
        FROM grouped_missing
        ORDER BY max_created_at DESC, nomor_ulok DESC
        LIMIT $${values.length}
    `, values);
};

const findSpkCreationRequired = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    if (!isSuperHuman(user) && !hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER")) {
        return [];
    }

    const values: SqlValue[] = [];
    const branchWhere = addBranchScope(user, values, "t.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        WITH missing_spk AS (
            SELECT
                r.id AS entity_id,
                r.id_toko,
                COALESCE(t.nama_toko, t.nomor_ulok, pp.nomor_ulok) AS title,
                COALESCE(t.nomor_ulok, pp.nomor_ulok, t.kode_toko) AS nomor_ulok,
                UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, pp.lingkup_pekerjaan))) AS lingkup_pekerjaan,
                t.cabang,
                r.status,
                r.created_at
            FROM rab r
            LEFT JOIN toko t ON t.id = r.id_toko
            LEFT JOIN projek_planning pp ON pp.id = r.projek_planning_id
            WHERE r.status = 'Disetujui'
              ${branchWhere}
              AND NOT EXISTS (
                  SELECT 1
                  FROM pengajuan_spk spk
                  WHERE spk.id_toko = r.id_toko
                    AND (
                        (spk.nomor_ulok IS NOT NULL AND spk.nomor_ulok = COALESCE(t.nomor_ulok, pp.nomor_ulok)) 
                        OR spk.nomor_ulok IS NULL
                    )
                    AND UPPER(TRIM(spk.lingkup_pekerjaan)) = UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, pp.lingkup_pekerjaan)))
              )
        )
        SELECT
            'SPK_CREATION_REQUIRED' AS entity_type,
            entity_id,
            id_toko,
            title,
            nomor_ulok,
            lingkup_pekerjaan,
            cabang,
            status,
            'RAB sudah disetujui, harap buat SPK untuk RAB ini.' AS description,
            'Buat SPK' AS action_label,
            '/spk?ulok=' || nomor_ulok || '&lingkup=' || REPLACE(COALESCE(lingkup_pekerjaan, ''), ' ', '%20') AS action_url,
            COUNT(*) OVER() AS total_count
        FROM missing_spk
        ORDER BY created_at DESC, entity_id DESC
        LIMIT $${values.length}
    `, values);
};

const findRabProjectPlanningRequests = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    // Only for KONTRAKTOR role (not DIREKTUR KONTRAKTOR) - they create/upload RAB
    const isKontraktorOnly = hasActiveRole(user, "KONTRAKTOR") && !hasActiveRole(user, "DIREKTUR KONTRAKTOR");
    if (!isKontraktorOnly || !user.email_sat) return [];

    const values: SqlValue[] = [user.email_sat, ITEM_LIMIT];
    return queryNotificationRows(`
        SELECT
            'RAB_PROJECT_PLANNING_REQUEST' AS entity_type,
            pp.id AS entity_id,
            pp.id_toko,
            COALESCE(pp.nama_toko, pp.nama_lokasi, pp.nomor_ulok) AS title,
            pp.nomor_ulok,
            scope.lingkup_pekerjaan,
            pp.cabang,
            pp.status,
            'Project Planning membutuhkan penawaran RAB.' AS description,
            'Buat Penawaran' AS action_label,
            '/rab?projek_planning_id=' || pp.id || '&lingkup=' || replace(replace(COALESCE(scope.lingkup_pekerjaan, ''), '&', '%26'), ' ', '%20') AS action_url,
            COUNT(*) OVER() AS total_count
        FROM projek_planning pp
        CROSS JOIN (VALUES ('SIPIL'::text), ('ME'::text)) AS scope(lingkup_pekerjaan)
        WHERE pp.status = 'WAITING_RAB_UPLOAD'
          AND EXISTS (
              SELECT 1
              FROM user_cabang uc
              LEFT JOIN user_branch_coverage ubc ON ubc.user_cabang_id = uc.id
              WHERE LOWER(TRIM(uc.email_sat)) = LOWER(TRIM($1))
                AND (
                    LOWER(TRIM(uc.cabang)) = LOWER(TRIM(pp.cabang))
                    OR UPPER(TRIM(ubc.covered_cabang)) = UPPER(TRIM(pp.cabang))
                )
                AND UPPER(COALESCE(uc.jabatan, '')) LIKE '%KONTRAKTOR%'
          )
          AND NOT EXISTS (
              SELECT 1
              FROM toko t
              JOIN rab r ON r.id_toko = t.id
              WHERE t.nomor_ulok = pp.nomor_ulok
                AND UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = scope.lingkup_pekerjaan
          )
        ORDER BY pp.created_at ASC, pp.id ASC, scope.lingkup_pekerjaan DESC
        LIMIT $2
    `, values);
};

const findCoordinatorRabUploadRequired = async (user: AuthenticatedUser): Promise<NotificationRow[]> => {
    const isCoordinator = hasActiveRole(user, "BRANCH BUILDING COORDINATOR") || hasActiveRole(user, "COORDINATOR") || hasActiveRole(user, "KOORDINATOR") || (hasActiveRole(user, "BRANCH BUILDING & MAINTENANCE MANAGER") && user.cabang?.toUpperCase() === "BOGOR");
    
    if (!isSuperHuman(user) && !isCoordinator) return [];

    const values: SqlValue[] = [];
    const branchWhere = addApprovalBranchScope(user, values, "pp.cabang");
    values.push(ITEM_LIMIT);

    return queryNotificationRows(`
        SELECT
            'PROJECT_PLANNING' AS entity_type,
            pp.id AS entity_id,
            pp.id_toko,
            COALESCE(pp.nama_toko, pp.nama_lokasi, pp.nomor_ulok) AS title,
            pp.nomor_ulok,
            pp.lingkup_pekerjaan,
            pp.cabang,
            pp.status,
            'Project Planning menunggu Anda untuk upload RAB dan Gambar Kerja Final (Tahap 2).' AS description,
            'Upload RAB & Gambar' AS action_label,
            '/projek-planning/' || pp.id AS action_url,
            COUNT(*) OVER() AS total_count
        FROM projek_planning pp
        WHERE pp.status = 'WAITING_RAB_UPLOAD'
          ${branchWhere}
        LIMIT $${values.length}
    `, values);
};

export const taskNotificationRepository = {
    async getGroups(user: AuthenticatedUser): Promise<TaskNotificationGroup[]> {
        const [
            rabApproval,
            spkApproval,
            pertambahanSpkApproval,
            opnameApproval,
            instruksiLapanganApproval,
            projectPlanningApproval,
            dendaActionApproval,
            requestIntervensiApproval,
            dendaActionToAcknowledge,
            pendingOpnameFromGantt,
            supportKtkReady,
            revisionRequired,
            picAssignmentRequired,
            rabProjectPlanningRequests,
            coordinatorRabUpload,
            spkCreationRequired,
        ] = await Promise.all([
            findRabApproval(user),
            findSpkApproval(user),
            findPertambahanSpkApproval(user),
            findOpnameApproval(user),
            findInstruksiLapanganApproval(user),
            findProjectPlanningApproval(user),
            findDendaActionApproval(user),
            findRequestIntervensiApproval(user),
            findDendaActionToAcknowledge(user),
            findPendingOpnameFromGantt(user),
            findSupportKtkReady(user),
            findRevisionRequired(user),
            findPicAssignmentRequired(user),
            findRabProjectPlanningRequests(user),
            findCoordinatorRabUploadRequired(user),
            findSpkCreationRequired(user),
        ]);

        return [
            makeGroup(
                "approval_rab",
                "approval",
                "Approval RAB",
                "RAB yang menunggu persetujuan role Anda.",
                rabApproval
            ),
            makeGroup(
                "approval_spk",
                "approval",
                "Approval SPK",
                "SPK yang menunggu approval Branch Manager.",
                spkApproval
            ),
            makeGroup(
                "approval_pertambahan_spk",
                "approval",
                "Approval Pertambahan SPK",
                "Pertambahan SPK yang menunggu approval Branch Manager.",
                pertambahanSpkApproval
            ),
            makeGroup(
                "approval_ktk",
                "approval",
                "Approval KTK",
                "KTK yang menunggu persetujuan role Anda.",
                opnameApproval
            ),
            makeGroup(
                "approval_instruksi_lapangan",
                "approval",
                "Approval Instruksi Lapangan",
                "Instruksi Lapangan yang menunggu persetujuan role Anda.",
                instruksiLapanganApproval
            ),
            makeGroup(
                "approval_project_planning",
                "approval",
                "Approval Project Planning",
                "Project Planning yang menunggu persetujuan role Anda.",
                projectPlanningApproval
            ),
            makeGroup(
                "approval_surat_peringatan",
                "approval",
                "Approval Surat Peringatan",
                "Surat Peringatan yang menunggu approval Manager.",
                dendaActionApproval
            ),
            makeGroup(
                "approval_intervensi",
                "approval",
                "Approval Intervensi",
                "Request intervensi yang menunggu persetujuan role Anda.",
                requestIntervensiApproval
            ),
            makeGroup(
                "input_surat_peringatan",
                "input",
                "Surat Peringatan Baru",
                "Surat Peringatan yang baru diterbitkan dan perlu disetujui.",
                dendaActionToAcknowledge
            ),
            makeGroup(
                "pending_opname_gantt",
                "input",
                "Opname Belum Diisi",
                "Progress pengawasan sudah selesai, harap lanjutkan pengisian Opname.",
                pendingOpnameFromGantt
            ),
            makeGroup(
                "support_ktk_ready",
                "process",
                "KTK Siap Diproses",
                "Proyek yang semua item opname-nya sudah disetujui kontraktor dan perlu diproses support.",
                supportKtkReady
            ),
            makeGroup(
                "revision_rab",
                "revision",
                "Revisi RAB",
                "RAB yang dikembalikan dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "RAB_REJECTED")
            ),
            makeGroup(
                "revision_spk",
                "revision",
                "Revisi SPK",
                "SPK yang ditolak dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "SPK_REJECTED")
            ),
            makeGroup(
                "revision_pertambahan_spk",
                "revision",
                "Revisi Pertambahan SPK",
                "Pertambahan SPK yang ditolak dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "PERTAMBAHAN_SPK_REJECTED")
            ),
            makeGroup(
                "revision_instruksi_lapangan",
                "revision",
                "Revisi Instruksi Lapangan",
                "Instruksi Lapangan yang ditolak dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "INSTRUKSI_LAPANGAN_REJECTED")
            ),
            makeGroup(
                "revision_surat_peringatan",
                "revision",
                "Surat Peringatan Ditolak",
                "Surat Peringatan yang ditolak Manager dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "SURAT_PERINGATAN_REJECTED")
            ),
            makeGroup(
                "revision_ktk",
                "revision",
                "Revisi KTK",
                "KTK yang ditolak dan perlu diperbaiki.",
                revisionRequired.filter(row => row.entity_type === "OPNAME_FINAL_REJECTED")
            ),
            makeGroup(
                "revision_intervensi",
                "revision",
                "Revisi Request Intervensi",
                "Request intervensi yang dikembalikan dan perlu diajukan ulang.",
                revisionRequired.filter(row => row.entity_type === "INTERVENSI_REVISION")
            ),
            makeGroup(
                "pic_pengawasan_missing",
                "input",
                "PIC Pengawasan",
                "Belum ada branch building support yang ditugaskan untuk SPK yang sudah disetujui (Tugas Branch Building Coordinator).",
                picAssignmentRequired
            ),
            makeGroup(
                "coordinator_rab_upload",
                "input",
                "Upload RAB & Gambar Final",
                "Project Planning yang membutuhkan upload dokumen tahap 2 oleh Koordinator.",
                coordinatorRabUpload
            ),
            makeGroup(
                "rab_project_planning_request",
                "offer",
                "Permintaan RAB Project Planning",
                "ULOK dari FPD yang membutuhkan penawaran RAB.",
                rabProjectPlanningRequests
            ),
            makeGroup(
                "spk_creation_required",
                "input",
                "Buat SPK",
                "RAB yang sudah disetujui dan menunggu pembuatan SPK (Tugas Branch Building & Maintenance Manager).",
                spkCreationRequired
            ),
        ].filter((group): group is TaskNotificationGroup => Boolean(group));
    },
};
