import { isSameBranchScope } from "../../common/branch-scope";
import {
    calculateDendaFromDates,
    calculateDendaNominal,
    DENDA_ACTION_THRESHOLD_DAYS,
    isHeadOfficeCabang
} from "../denda/denda-keterlambatan";
import type { DashboardData } from "./dashboard.repository";
import type { DashboardProjectsQueryInput, DashboardSummaryQueryInput } from "./dashboard.schema";

const GLOBAL_ROLES = [
    "BUILDING & MAINTENANCE SUPER HUMAN",
    "BUILDING & MAINTENANCE REGIONAL MANAGER",
    "BUILDING MAINTENANCE & ENERGY SYSTEM MANAGER",
    "BUILDING & MAINTENANCE GENERAL MANAGER",
    "STORE & BRANCH CONTROLLING SPECIALIST",
    "HEAD OFFICE",
];

const normalize = (value: unknown) => String(value || "").trim().toUpperCase();
const parseDate = (value: unknown) => {
    const date = value ? new Date(String(value)) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const dateOnlyKey = (value: unknown): string | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const date = parseDate(raw);
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const isStoredStDateSynced = (project: DashboardData, opname: DashboardData["opname_final"][number] | undefined) => {
    const stored = dateOnlyKey(opname?.tanggal_serah_terima_denda);
    const actual = dateOnlyKey(project.berkas_serah_terima[0]?.created_at);
    return !stored || !actual || stored === actual;
};

const isDateEffective = (value: unknown, now = new Date()) => {
    const date = parseDate(value);
    if (!date) return false;
    const effectiveDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return effectiveDate.getTime() < today.getTime();
};

const dayDiff = (from: Date | null, to: Date | null = new Date()) => {
    if (!from || !to) return 0;
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
};

const approvedSpks = (project: DashboardData) => {
    const valid = project.spk.filter((spk) =>
        ["APPROVED", "ACTIVE", "SPK_APPROVED", "DISETUJUI", "AKTIF", "SELESAI"].includes(normalize(spk.status))
    );
    return valid.length > 0 ? valid : project.spk.slice(0, 1);
};

const spkAllowedDays = (spk: ReturnType<typeof approvedSpks>[number]) => {
    const extensionDays = spk.pertambahan_spk
        .filter((item) => ["APPROVED", "DISETUJUI", "DISETUJUI BM"].includes(normalize(item.status_persetujuan)))
        .reduce((sum, item) => sum + Number(item.pertambahan_hari || 0), 0);
    return Number(spk.durasi || 0) + extensionDays;
};

export const getDashboardStage = (project: DashboardData) => {
    const now = new Date();
    const rab = project.rab[0];
    const rabStatus = normalize(rab?.status);
    const hasApprovedSpk = project.spk.some((spk) =>
        ["APPROVED", "ACTIVE", "SPK_APPROVED", "DISETUJUI", "AKTIF", "SELESAI"].includes(normalize(spk.status))
    );
    const hasWaitingSpk = project.spk.some((spk) => normalize(spk.status) === "WAITING_FOR_BM_APPROVAL");
    const opname = project.opname_final.find((item) => String(item.link_pdf_opname || "").trim() && isDateEffective(item.created_at, now));
    const hasSt = project.berkas_serah_terima.some((item) => isDateEffective(item.created_at, now));
    const hasStDocument = project.berkas_serah_terima.some((item) =>
        String(item.link_pdf || "").trim() && isDateEffective(item.created_at, now)
    );

    if (opname && normalize(opname.status_opname_final) === "DISETUJUI" && isDateEffective(opname.waktu_persetujuan_direktur, now)) return "Done";
    if (hasStDocument) return "Done";
    if (opname || hasSt) return "Kerja Tambah Kurang";
    if (hasApprovedSpk) return "Ongoing";
    if (hasWaitingSpk) return "Approval SPK";
    if (rabStatus === "DISETUJUI") return "Proses PJU";
    if (rab && rabStatus === "MENUNGGU GANTT CHART") return "Proses Gantt";
    return "Approval RAB";
};

export const isDashboardPastSla = (project: DashboardData, stage = getDashboardStage(project)) => {
    const now = new Date();
    const rab = project.rab[0];
    const opname = project.opname_final.find((item) => String(item.link_pdf_opname || "").trim()) || project.opname_final[0];
    const latestSt = [...project.berkas_serah_terima]
        .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime())[0];

    if (stage === "Ongoing") {
        const start = approvedSpks(project)
            .map((spk) => parseDate(spk.waktu_mulai || spk.created_at))
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        const allowedDays = Math.max(0, ...approvedSpks(project).map(spkAllowedDays));
        return dayDiff(start, now) > allowedDays;
    }

    if (stage === "Approval SPK") {
        const spk = project.spk.find((item) => normalize(item.status) === "WAITING_FOR_BM_APPROVAL") || project.spk[0];
        return dayDiff(parseDate(spk?.created_at), parseDate(spk?.waktu_persetujuan) || now) > 2;
    }

    if (stage === "Approval RAB") {
        return dayDiff(parseDate(rab?.created_at), parseDate(rab?.waktu_persetujuan_manager) || now) > 2;
    }

    if (stage === "Proses Gantt") {
        return false;
    }

    if (stage === "Proses PJU") {
        const firstSpkCreated = project.spk
            .map((spk) => parseDate(spk.created_at))
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        return dayDiff(parseDate(rab?.waktu_persetujuan_manager), firstSpkCreated || now) > 10;
    }

    if (stage === "Kerja Tambah Kurang") {
        return dayDiff(parseDate(latestSt?.created_at), parseDate(opname?.created_at) || now) > 14;
    }

    return false;
};

export const getDashboardLateDays = (project: DashboardData) => {
    const opname = project.opname_final[0];
    if (Number(opname?.hari_denda || 0) > 0 && isStoredStDateSynced(project, opname)) {
        return Number(opname?.hari_denda || 0);
    }

    const endDates = approvedSpks(project)
        .map((spk) => {
            const extensionDates = spk.pertambahan_spk
                .filter((item) => ["APPROVED", "DISETUJUI", "DISETUJUI BM"].includes(normalize(item.status_persetujuan)))
                .map((item) => parseDate(item.tanggal_spk_akhir_setelah_perpanjangan))
                .filter((date): date is Date => Boolean(date));
            return extensionDates.sort((a, b) => b.getTime() - a.getTime())[0] || parseDate(spk.waktu_selesai);
        })
        .filter((date): date is Date => Boolean(date));
    const target = endDates.sort((a, b) => b.getTime() - a.getTime())[0];
    if (!target) return 0;

    const compareDate = parseDate(project.berkas_serah_terima[0]?.created_at) || new Date();
    return calculateDendaFromDates(target, compareDate).hari_denda;
};

export const getDashboardPenalty = (project: DashboardData) => {
    const opname = project.opname_final[0];
    const official = Number(opname?.nilai_denda || 0);
    const officialHari = Number(opname?.hari_denda || 0);
    const days = getDashboardLateDays(project);

    // If opname_final has a stored tanggal_akhir_spk_denda, a real denda calculation has been
    // persisted (even if the result is 0 – e.g. ME peer delivered on time → minimum = 0).
    // In that case we MUST use the official stored values and NOT fall through to the estimasi path.
    const hasOfficialCalculation = Boolean(opname?.tanggal_akhir_spk_denda) && isStoredStDateSynced(project, opname);

    if (official > 0 || officialHari > 0 || hasOfficialCalculation) {
        const actionDays = officialHari || days;
        return {
            amount: official,
            days: actionDays,
            source: "Resmi" as const,
            requires_action: actionDays >= DENDA_ACTION_THRESHOLD_DAYS,
            action_options: actionDays >= DENDA_ACTION_THRESHOLD_DAYS ? ["SP", "TAKEOVER"] : [],
        };
    }
    const amount = calculateDendaNominal(days);
    return {
        amount,
        days,
        source: "Estimasi" as const,
        requires_action: days >= DENDA_ACTION_THRESHOLD_DAYS,
        action_options: days >= DENDA_ACTION_THRESHOLD_DAYS ? ["SP", "TAKEOVER"] : [],
    };
};

const canViewAllBranches = (query: DashboardSummaryQueryInput | DashboardProjectsQueryInput) => {
    const roles = normalize(query.actor_role).split(",").map((role) => role.trim());
    return normalize(query.actor_cabang) === "HEAD OFFICE" || roles.some((role) => GLOBAL_ROLES.includes(role));
};

const matchesCompany = (project: DashboardData, company?: string) => {
    const target = normalize(company);
    if (!target) return true;
    return [
        project.toko.nama_kontraktor,
        ...project.rab.map((rab) => rab.nama_pt),
        ...project.spk.map((spk) => spk.nama_kontraktor),
    ].some((value) => normalize(value) === target);
};

export const scopeDashboardProjects = (
    projects: DashboardData[],
    query: DashboardSummaryQueryInput | DashboardProjectsQueryInput
) => {
    const selectedBranch = normalize(query.cabang);
    const actorBranch = normalize(query.actor_cabang);
    const search = normalize(query.search);
    return projects.filter((project) => {
        const branch = normalize(project.toko.cabang);
        if (isHeadOfficeCabang(branch)) return false;
        if (query.cabang_array) {
            if (!query.cabang_array.includes(branch)) return false;
        } else if (!canViewAllBranches(query) && !isSameBranchScope(branch, actorBranch)) {
            return false;
        }
        if (selectedBranch && selectedBranch !== "ALL" && branch !== selectedBranch) return false;
        if (!matchesCompany(project, query.actor_company)) return false;
        if (search && ![
            project.toko.nama_toko,
            project.toko.nomor_ulok,
            project.toko.kode_toko,
            project.toko.cabang,
            project.toko.nama_kontraktor,
        ].some((value) => normalize(value).includes(search))) return false;
        return true;
    });
};

export const toDashboardProjectRow = (project: DashboardData) => {
    const stage = getDashboardStage(project);
    const lateDays = getDashboardLateDays(project);
    const penalty = getDashboardPenalty(project);
    const rab = project.rab[0];
    const spk = project.spk[0];
    return {
        toko: project.toko,
        stage,
        attention: stage !== "Done" && isDashboardPastSla(project, stage),
        late_days: lateDays,
        penalty,
        penawaran: Number(rab?.grand_total_final || 0),
        nilai_spk: Number(spk?.grand_total || 0),
        rab_status: rab?.status || null,
        spk_status: spk?.status || null,
        opname_status: project.opname_final[0]?.status_opname_final || null,
        has_serah_terima: project.berkas_serah_terima.length > 0,
        updated_at: project.berkas_serah_terima[0]?.created_at
            || project.opname_final[0]?.created_at
            || spk?.created_at
            || rab?.created_at
            || null,
    };
};
