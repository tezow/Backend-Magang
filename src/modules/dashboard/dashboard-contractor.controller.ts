import type { Request, Response } from "express";
import { getEffectiveBranchesForUser } from "../../common/branch-scope";
import { contractorPerformanceService } from "./dashboard-contractor.service";
import type { ContractorPerformanceFilters } from "./dashboard-contractor.types";

export const getContractorSummary = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };

        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const allowedBranches = allowedBranchesScope.branches;
        
        const summary = await contractorPerformanceService.getSummary(filters, allowedBranches);
        
        res.json({
            status: "success",
            data: summary
        });
    } catch (error: any) {
        res.status(500).json({
            status: "error",
            message: error.message || "Terjadi kesalahan internal"
        });
    }
};

export const getContractorCharts = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };

        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const allowedBranches = allowedBranchesScope.branches;
        
        const charts = await contractorPerformanceService.getCharts(filters, allowedBranches);
        
        res.json({
            status: "success",
            data: charts
        });
    } catch (error: any) {
        res.status(500).json({
            status: "error",
            message: error.message || "Terjadi kesalahan internal"
        });
    }
};

export const getContractorLeaderboard = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };

        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const allowedBranches = allowedBranchesScope.branches;
        
        const leaderboard = await contractorPerformanceService.getLeaderboard(filters, allowedBranches);
        
        res.json({
            status: "success",
            data: leaderboard
        });
    } catch (error: any) {
        res.status(500).json({
            status: "error",
            message: error.message || "Terjadi kesalahan internal"
        });
    }
};

export const getContractorDrilldownRanking = async (req: Request, res: Response) => {
    console.log("=> GET /api/dashboard/contractor/drilldown-ranking");
    console.log("Query:", req.query);
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const metric = req.query.metric as string;

        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const allowedBranches = allowedBranchesScope.branches;
        const ranking = await contractorPerformanceService.getDrilldownRanking(metric, filters, allowedBranches);
        
        console.log("Drilldown Ranking SUCCESS, returned rows:", ranking.length);
        res.json({ status: "success", data: ranking });
    } catch (error: any) {
        console.error("Drilldown Ranking ERROR:", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorDrilldownSpHistory = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const kontraktor = req.query.kontraktor as string;
        const history = await contractorPerformanceService.getDrilldownSpHistory(kontraktor, filters, allowedBranchesScope.branches);
        res.json({ status: "success", data: history });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorDrilldownSpActiveAll = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const history = await contractorPerformanceService.getDrilldownSpActiveAll(filters, allowedBranchesScope.branches);
        res.json({ status: "success", data: history });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorAllSpHistory = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const list = await contractorPerformanceService.getAllSpHistory(filters, allowedBranchesScope.branches);
        res.json({ status: "success", data: list });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorDrilldownUlok = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const kontraktor = req.query.kontraktor as string;
        const idTokoFilter = req.query.id_toko as string;
        const metric = req.query.metric as string;
        
        console.log('KONTRAKTOR RECVD:', kontraktor, metric); const ulokList = await contractorPerformanceService.getDrilldownUlok(kontraktor, idTokoFilter, metric, filters, allowedBranchesScope.branches);
        console.log("==> API /drilldown-ulok KONTRAKTOR:", kontraktor, "METRIC:", metric, "RESULT LEN:", ulokList.length); console.log('ULOK LIST LEN:', ulokList.length);
        res.json({ status: "success", data: ulokList });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorDrilldownDetail = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };
        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const idToko = req.query.id_toko as string;
        const lingkup = req.query.lingkup as string;
        
        const detail = await contractorPerformanceService.getDrilldownDetail(idToko, lingkup, filters, allowedBranchesScope.branches);
        res.json({ status: "success", data: detail });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorBalanceChart = async (req: Request, res: Response) => {
    try {
        const filters: ContractorPerformanceFilters = {
            cabang: req.query.cabang as string,
            job_type: req.query.job_type as any,
            period: req.query.period as any,
            search: req.query.search as string,
            proyek: req.query.proyek as string,
            bangunan: req.query.bangunan as string,
            kontraktor: req.query.kontraktor as string
        };

        const allowedBranchesScope = await getEffectiveBranchesForUser({
            emailSat: req.user!.email_sat,
            cabang: filters.cabang || req.user!.cabang,
            roles: req.user!.roles
        });
        const allowedBranches = allowedBranchesScope.branches;

        const data = await contractorPerformanceService.getContractorBalanceChart(filters, allowedBranches);
        res.json({ status: "success", data });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorAvailableCabang = async (req: Request, res: Response) => {
    try {
        const { getEffectiveBranchesForUser, getDriveBranchParent } = await import("../../common/branch-scope");
        const { branches, source } = await getEffectiveBranchesForUser({ emailSat: req.user!.email_sat, cabang: req.user!.cabang, roles: req.user!.roles });
        
        let result: string[] = [];
        if (source === "global") {
            const parents = new Set(branches.map(b => getDriveBranchParent(b)));
            result = Array.from(parents).sort();
        } else if (branches.length > 1) {
            result = branches.sort();
        } else {
            result = [];
        }
        res.json({ status: "success", data: result });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const getContractorAvailableKontraktors = async (req: Request, res: Response) => {
    try {
        const { getEffectiveBranchesForUser } = await import("../../common/branch-scope");
        const cabangParam = req.query.cabang as string;
        
        const allowedBranchesScope = await getEffectiveBranchesForUser({ 
            emailSat: req.user!.email_sat, 
            cabang: cabangParam || req.user!.cabang, 
            roles: req.user!.roles 
        });
        
        const allowedBranches = allowedBranchesScope.branches;
        
        const values: any[] = [];
        let branchFilter = "";
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND UPPER(t.cabang) = ANY($${values.length})`;
        }
        
        if (cabangParam && cabangParam !== "ALL" && cabangParam !== "SEMUA CABANG") {
            values.push(cabangParam.trim().toUpperCase());
            branchFilter += ` AND UPPER(t.cabang) = $${values.length}`;
        }
        
        const query = `
            SELECT DISTINCT ${require('./dashboard-contractor.service').NORM_KONTRAKTOR('t.nama_kontraktor')} as nama_kontraktor
            FROM toko t
            WHERE 1=1 ${branchFilter}
              AND t.nama_kontraktor IS NOT NULL
              AND TRIM(t.nama_kontraktor) != ''
            ORDER BY nama_kontraktor ASC
        `;
        
        const { pool } = await import("../../db/pool");
        const result = await pool.query(query, values);
        
        const list = result.rows.map(r => r.nama_kontraktor).filter(Boolean);
        res.json({ status: "success", data: list });
    } catch (error: any) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
