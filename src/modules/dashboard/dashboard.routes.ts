import { Router, type NextFunction, type Request, type Response } from "express";
import {
    exportDashboard,
    getDashboardAll,
    getDashboardProjectDetail,
    getDashboardProjects,
    getDashboardSummary,
    getDashboardV2CardRows,
    getDashboardV2Charts,
    getDashboardV2Detail,
    getDashboardV2Summary,
    getDashboardV2Timeline,
    getDashboardView,
    getDashboardKpiPerformance,
    getDashboardKpiFilters,
    getDashboardKpiDrilldown
} from "./dashboard.controller";
import {
    getPerformanceSummary,
    getPerformanceFilters,
    getPerformanceDrilldown,
    getPerformanceDetail,
    getPerformanceOptionStats,
    getPerformanceTable
} from "./dashboard-performance.controller";
import {
    getContractorSummary,
    getContractorCharts,
    getContractorLeaderboard,
    getContractorDrilldownRanking,
    getContractorDrilldownSpHistory,
    getContractorDrilldownSpActiveAll,
    getContractorAllSpHistory,
    getContractorDrilldownUlok,
    getContractorDrilldownDetail,
    getContractorBalanceChart,
    getContractorAvailableCabang,
    getContractorAvailableKontraktors
} from "./dashboard-contractor.controller";

const normalizeRole = (role: string): string => role.trim().toUpperCase();

const isSuperHuman = (req: Request): boolean =>
    Boolean(req.user?.roles?.some((role: string) => normalizeRole(role).includes("SUPER HUMAN")));

const isContractorPerformanceBlocked = (req: Request): boolean =>
    Boolean(req.user?.roles?.some((role: string) => {
        const normalized = normalizeRole(role);
        return normalized.includes("KONTRAKTOR") || normalized === "DIREKTUR";
    }));

const hasInternalPerformanceAccess = (req: Request): boolean => {
    if (isSuperHuman(req)) return true;
    const cabang = req.user?.cabang?.toUpperCase().trim();
    if (cabang === "HEAD OFFICE") return true;
    if (req.user?.roles?.some((r: string) => r.toUpperCase().includes("REGIONAL MANAGER"))) return true;
    return false;
};

const requireInternalPerformanceAccess = (req: Request, res: Response, next: NextFunction) => {
    if (hasInternalPerformanceAccess(req) && !isContractorPerformanceBlocked(req)) {
        next();
        return;
    }

    res.status(403).json({
        status: "coming_soon",
        message: "Performance Internal SAT sedang disiapkan dan tidak tersedia untuk kontraktor atau direktur kontraktor."
    });
};

const requireContractorPerformanceAccess = (req: Request, res: Response, next: NextFunction) => {
    if (isSuperHuman(req)) {
        next();
        return;
    }

    res.status(403).json({
        status: "coming_soon",
        message: "Performance Kontraktor sedang dalam tahap uji coba dan ditutup sementara."
    });
};

const dashboardRouter = Router();

dashboardRouter.get("/export", exportDashboard);
dashboardRouter.get("/v2/summary", getDashboardV2Summary);
dashboardRouter.get("/v2/cards/:cardType", getDashboardV2CardRows);
dashboardRouter.get("/v2/timeline/:tokoId", getDashboardV2Timeline);
dashboardRouter.get("/v2/detail/:tokoId/:documentType/:rawId", getDashboardV2Detail);
dashboardRouter.get("/v2/charts", getDashboardV2Charts);
dashboardRouter.get("/summary", getDashboardSummary);
dashboardRouter.get("/projects", getDashboardProjects);
dashboardRouter.get("/projects/:tokoId", getDashboardProjectDetail);
dashboardRouter.get("/kpi-performance", requireInternalPerformanceAccess, getDashboardKpiPerformance);
dashboardRouter.get("/kpi-filters", requireInternalPerformanceAccess, getDashboardKpiFilters);
dashboardRouter.get("/kpi-drilldown", requireInternalPerformanceAccess, getDashboardKpiDrilldown);

// Performance KPI SAT routes.
dashboardRouter.get("/performance/summary", requireInternalPerformanceAccess, getPerformanceSummary);
dashboardRouter.get("/performance/filters", requireInternalPerformanceAccess, getPerformanceFilters);
dashboardRouter.get("/performance/options-stats", requireInternalPerformanceAccess, getPerformanceOptionStats);
dashboardRouter.get("/performance/drilldown", requireInternalPerformanceAccess, getPerformanceDrilldown);
dashboardRouter.get("/performance/detail", requireInternalPerformanceAccess, getPerformanceDetail);
dashboardRouter.get("/performance/table", requireInternalPerformanceAccess, getPerformanceTable);

// Contractor Performance routes
dashboardRouter.get("/contractor/filters/cabang", getContractorAvailableCabang);
dashboardRouter.get("/contractor/filters/kontraktor", getContractorAvailableKontraktors);
dashboardRouter.get("/contractor/summary",  getContractorSummary);
dashboardRouter.get("/contractor/charts",  getContractorCharts);
dashboardRouter.get("/contractor/leaderboard",  getContractorLeaderboard);
dashboardRouter.get("/contractor/drilldown-ranking",  getContractorDrilldownRanking);
dashboardRouter.get("/contractor/drilldown-sp-history",  getContractorDrilldownSpHistory);
dashboardRouter.get("/contractor/drilldown-sp-active-all",  getContractorDrilldownSpActiveAll);
dashboardRouter.get("/contractor/all-sp-history",  getContractorAllSpHistory);
dashboardRouter.get("/contractor/drilldown-ulok",  getContractorDrilldownUlok);
dashboardRouter.get("/contractor/drilldown-detail",  getContractorDrilldownDetail);
dashboardRouter.get("/contractor/balance-chart",  getContractorBalanceChart);

dashboardRouter.get("/", getDashboardView);
dashboardRouter.get("/all", getDashboardAll);

export { dashboardRouter };
