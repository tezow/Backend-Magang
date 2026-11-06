import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { injectDashboardBranchFilter } from "../../common/branch-filter-helper";
import { AppError } from "../../common/app-error";
import {
    performanceKpiDetailQuerySchema,
    performanceKpiDrilldownQuerySchema,
    performanceKpiFiltersQuerySchema,
    performanceKpiOptionStatsQuerySchema,
    performanceKpiSummaryQuerySchema,
    performanceKpiTableQuerySchema
} from "./performance-kpi.schema";
import { performanceKpiService } from "./performance-kpi.service";

export const getPerformanceSummary = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiSummaryQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const data = await performanceKpiService.getSummary(query);
    res.json({ status: "success", data });
});

export const getPerformanceFilters = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiFiltersQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const data = await performanceKpiService.getFilters(query);
    res.json({ status: "success", data });
});

export const getPerformanceDrilldown = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiDrilldownQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const result = await performanceKpiService.getDrilldown(query);
    res.json({ status: "success", data: result.data, meta: result.meta });
});

export const getPerformanceDetail = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiDetailQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const data = await performanceKpiService.getDetail(query);
    if (!data) throw new AppError("Detail KPI SAT tidak ditemukan", 404);
    res.json({ status: "success", data });
});

export const getPerformanceTable = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiTableQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const data = await performanceKpiService.getTable(query);
    res.json({ status: "success", data });
});

export const getPerformanceOptionStats = asyncHandler(async (req: Request, res: Response) => {
    let query = performanceKpiOptionStatsQuerySchema.parse(req.query);
    query = await injectDashboardBranchFilter(req.user!, query);
    const data = await performanceKpiService.getOptionStats(query);
    res.json({ status: "success", data });
});