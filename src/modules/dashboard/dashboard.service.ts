import { AppError } from "../../common/app-error";
import {
    buildKtkOpnameFinalExportFile,
    buildDashboardExportFile,
    buildDashboardExportRows,
    buildDokumentasiIndex,
    filterDashboardExportAccess,
    isKtkOpnameFinalOnlyExport
} from "./dashboard.export";
import type {
    DashboardAllQueryInput,
    DashboardExportQueryInput,
    DashboardProjectsQueryInput,
    DashboardQueryInput,
    DashboardSummaryQueryInput
} from "./dashboard.schema";
import { dashboardRepository } from "./dashboard.repository";
import {
    getDashboardPenalty,
    getDashboardStage,
    isDashboardPastSla,
    scopeDashboardProjects,
    toDashboardProjectRow
} from "./dashboard.presentation";

const hydrateExportProjects = async (projects: Awaited<ReturnType<typeof dashboardRepository.findAllDashboard>>, query: DashboardExportQueryInput) => {
    if (!query.job_types) {
        return dashboardRepository.hydrateDashboardExportItems(filterDashboardExportAccess(projects, query));
    }

    const prefiltered = filterDashboardExportAccess(projects, { ...query, job_types: undefined });
    const hydrated = await dashboardRepository.hydrateDashboardExportItems(prefiltered);
    return filterDashboardExportAccess(hydrated, query);
};

const parseExportSelection = (value?: string): Set<string> => new Set(
    String(value ?? "")
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
);

const isUserOnlyExport = (dataTypes?: string, jobTypes?: string): boolean => {
    const selectedDataTypes = parseExportSelection(dataTypes);
    const selectedJobTypes = parseExportSelection(jobTypes);
    return selectedDataTypes.size === 1 && selectedDataTypes.has("USER") && selectedJobTypes.size === 0;
};

const includesUserExport = (dataTypes?: string): boolean => parseExportSelection(dataTypes).has("USER");
const includesProjectPlanningExport = (dataTypes?: string): boolean => parseExportSelection(dataTypes).has("PROJECT_PLANNING");

const isProjectPlanningOnlyExport = (dataTypes?: string, jobTypes?: string): boolean => {
    const selectedDataTypes = parseExportSelection(dataTypes);
    const selectedJobTypes = parseExportSelection(jobTypes);
    return selectedDataTypes.size === 1 && selectedDataTypes.has("PROJECT_PLANNING") && selectedJobTypes.size === 0;
};

export const dashboardService = {
    async getDashboard(query: DashboardQueryInput) {
        const toko = await dashboardRepository.findTokoByQuery(query);
        if (!toko) {
            throw new AppError("Data toko tidak ditemukan", 404);
        }

        return dashboardRepository.findDashboardByTokoId(toko.id);
    },

    async getDashboardAll(query: DashboardAllQueryInput) {
        const projects = await dashboardRepository.findAllDashboard(query);
        return dashboardRepository.hydrateOpnameItemsOnly(projects);
    },

    async getDashboardSummary(query: DashboardSummaryQueryInput) {
        const projects = scopeDashboardProjects(
            await dashboardRepository.findAllDashboard({ search: query.search }),
            query
        );
        const stages: Record<string, number> = {
            "Approval RAB": 0,
            "Proses Gantt": 0,
            "Proses PJU": 0,
            "Approval SPK": 0,
            Ongoing: 0,
            "Kerja Tambah Kurang": 0,
            Done: 0,
        };
        let attention = 0;
        let penawaran = 0;
        let nilaiSpk = 0;
        let totalDenda = 0;
        let totalDendaEstimasi = 0; // Track estimasi terpisah untuk debugging

        for (const project of projects) {
            const stage = getDashboardStage(project);
            stages[stage] = (stages[stage] || 0) + 1;
            const penalty = getDashboardPenalty(project);
            if (stage !== "Done" && isDashboardPastSla(project, stage)) attention += 1;
            penawaran += Number(project.rab[0]?.grand_total_final || 0);
            nilaiSpk += project.spk.reduce((sum, spk) => sum + Number(spk.grand_total || 0), 0);

            // ✅ FIX: Hanya hitung denda resmi untuk total
            if (penalty.source === "Resmi") {
                totalDenda += penalty.amount;
            } else if (penalty.source === "Estimasi") {
                totalDendaEstimasi += penalty.amount;
            }
        }

        return {
            generated_at: new Date().toISOString(),
            total: projects.length,
            attention,
            penawaran,
            nilai_spk: nilaiSpk,
            total_denda: totalDenda, // Hanya denda resmi
            total_denda_estimasi: totalDendaEstimasi, // Optional: untuk debugging
            stages,
        };
    },

    async getDashboardProjects(query: DashboardProjectsQueryInput) {
        let rows = scopeDashboardProjects(
            await dashboardRepository.findAllDashboard({ search: query.search }),
            query
        ).map(toDashboardProjectRow);

        if (query.stage) rows = rows.filter((row) => row.stage === query.stage);
        if (query.attention !== undefined) rows = rows.filter((row) => row.attention === query.attention);

        rows.sort((a, b) => {
            if (query.sort === "name") return String(a.toko.nama_toko || "").localeCompare(String(b.toko.nama_toko || ""));
            if (query.sort === "latest") return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
            return Number(b.attention) - Number(a.attention)
                || b.penalty.amount - a.penalty.amount
                || b.late_days - a.late_days;
        });

        const total = rows.length;
        const start = (query.page - 1) * query.limit;
        return {
            data: rows.slice(start, start + query.limit),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                total_pages: Math.ceil(total / query.limit),
            },
        };
    },

    async getDashboardProjectDetail(tokoId: number) {
        return dashboardRepository.findDashboardByTokoId(tokoId);
    },

    async exportDashboard(query: DashboardExportQueryInput) {
        if (query.actor_role.toUpperCase().includes("KONTRAKTOR")) {
            throw new AppError("Role kontraktor tidak diizinkan mengunduh export dashboard", 403);
        }

        const userRows = includesUserExport(query.data_types)
            ? await dashboardRepository.findUserExportRows(query)
            : undefined;

        const projectPlanningRows = includesProjectPlanningExport(query.data_types)
            ? await dashboardRepository.findProjectPlanningExportRows(query)
            : undefined;

        const cabangLabel = query.cabang && query.cabang !== "ALL"
            ? query.cabang
            : (query.actor_cabang.toUpperCase() === "HEAD OFFICE" ? "Semua Cabang" : query.actor_cabang);

        if (isUserOnlyExport(query.data_types, query.job_types)) {
            return buildDashboardExportFile(query.format, [], {
                cabang: cabangLabel,
                generatedBy: query.actor_role
            }, query.data_types, query.job_types, [], userRows);
        }

        if (isProjectPlanningOnlyExport(query.data_types, query.job_types)) {
            return buildDashboardExportFile(query.format, [], {
                cabang: cabangLabel,
                generatedBy: query.actor_role
            }, query.data_types, query.job_types, [], undefined, projectPlanningRows);
        }

        if (isKtkOpnameFinalOnlyExport(query.data_types, query.job_types)) {
            const projects = await dashboardRepository.findKtkOpnameFinalDashboard(query);
            const scopedProjects = await hydrateExportProjects(projects, query);

            return buildKtkOpnameFinalExportFile(query.format, scopedProjects, {
                cabang: cabangLabel,
                generatedBy: query.actor_role
            });
        }

        const projects = await dashboardRepository.findAllDashboard({
            search: query.search,
            cabang_array: query.cabang_array,
            _is_global_access: query._is_global_access,
            tipe_bangunan: query.tipe_bangunan,
        });
        const scopedProjects = await hydrateExportProjects(projects, query);
        const dokumentasiRows = await dashboardRepository.findDokumentasiBangunanForExport();
        const rows = buildDashboardExportRows(scopedProjects, buildDokumentasiIndex(dokumentasiRows));

        return buildDashboardExportFile(query.format, rows, {
            cabang: cabangLabel,
            generatedBy: query.actor_role
        }, query.data_types, query.job_types, scopedProjects, userRows, projectPlanningRows);
    }
};
