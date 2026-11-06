import { z } from "zod";

export const dashboardQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    id: z.coerce.number().positive().optional()
}).refine((data) => data.search || data.id, {
    message: "Harus memberikan minimal search atau id",
    path: ["search", "id"]
});

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;

export const dashboardAllQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional(),
    tipe_bangunan: z.enum(["ALL", "RUKO", "NON_RUKO"]).optional(),
    _is_global_access: z.boolean().optional()
});

export type DashboardAllQueryInput = z.infer<typeof dashboardAllQuerySchema>;

export const dashboardExportQuerySchema = z.object({
    format: z.enum(["xlsx", "csv", "pdf"]).default("xlsx"),
    search: z.string().trim().min(1).optional(),
    cabang: z.string().trim().optional(),
    toko_ids: z.string().trim().optional(),
    months: z.string().trim().optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    period_mode: z.enum(["months", "ytd", "all"]).default("all"),
    data_types: z.string().trim().optional(),
    job_types: z.string().trim().optional(),
    cabangs: z.string().trim().optional(),
    spk_status: z.enum(["all", "with_spk", "without_spk"]).default("all"),
    beanspot: z.enum(["all", "yes", "no"]).optional(),
    jenis_proyek: z.enum(["all", "reguler", "renovasi"]).optional(),
    actor_role: z.string().trim().min(1),
    actor_cabang: z.string().trim().min(1),
    cabang_array: z.array(z.string()).optional(),
    _is_global_access: z.boolean().optional(),
    tipe_bangunan: z.enum(["ALL", "RUKO", "NON_RUKO"]).optional()
});

export type DashboardExportQueryInput = z.infer<typeof dashboardExportQuerySchema>;

const dashboardScopeSchema = {
    actor_role: z.string().trim().min(1),
    actor_cabang: z.string().trim().min(1),
    actor_company: z.string().trim().optional(),
    cabang: z.string().trim().optional(),
    search: z.string().trim().optional(),
    cabang_array: z.array(z.string()).optional(),
    tipe_bangunan: z.enum(["ALL", "RUKO", "NON_RUKO"]).optional(),
};

export const dashboardSummaryQuerySchema = z.object({
    ...dashboardScopeSchema,
});

export type DashboardSummaryQueryInput = z.infer<typeof dashboardSummaryQuerySchema>;

export const dashboardProjectsQuerySchema = z.object({
    ...dashboardScopeSchema,
    stage: z.string().trim().optional(),
    attention: z.coerce.boolean().optional(),
    sort: z.enum(["priority", "name", "latest"]).default("priority"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(5).max(100).default(20),
});

export type DashboardProjectsQueryInput = z.infer<typeof dashboardProjectsQuerySchema>;

export const dashboardV2JobTypeSchema = z.enum(["ALL", "REGULER", "RENOVASI"]).default("ALL");
export const dashboardV2PeriodSchema = z.enum(["1m", "3m", "6m", "1y", "all"]).default("3m");
export const dashboardV2CardTypeSchema = z.enum([
    "TOTAL_TOKO",
    "SLA",
    "SPK_AKTIF",
    "TOTAL_DENDA",
    "NILAI_PENAWARAN",
    "TAMBAH_HARI_SPK",
    "ITEM_PENGAWASAN",
    "INSTRUKSI_LAPANGAN",
    "KERJA_TAMBAH_KURANG",
    "SERAH_TERIMA",
    "COST_M2_BANGUNAN",
    "COST_M2_TERBUKA"
]);
export const dashboardV2DocumentTypeSchema = z.enum([
    "RAB",
    "GANTT",
    "SPK",
    "TAMBAH_HARI_SPK",
    "PENGAWASAN",
    "INSTRUKSI_LAPANGAN",
    "OPNAME_PARSIAL",
    "OPNAME_FINAL",
    "SERAH_TERIMA"
]);

export const dashboardV2ScopeQuerySchema = z.object({
    ...dashboardScopeSchema,
    job_type: dashboardV2JobTypeSchema
});

export const dashboardV2CardRowsQuerySchema = dashboardV2ScopeQuerySchema.extend({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(5).max(100).default(20),
});

export const dashboardV2ChartsQuerySchema = dashboardV2ScopeQuerySchema.extend({
    period: dashboardV2PeriodSchema,
});

export type DashboardV2ScopeQueryInput = z.infer<typeof dashboardV2ScopeQuerySchema>;
export type DashboardV2CardRowsQueryInput = z.infer<typeof dashboardV2CardRowsQuerySchema>;
export type DashboardV2ChartsQueryInput = z.infer<typeof dashboardV2ChartsQuerySchema>;

export const dashboardKpiQuerySchema = z.object(dashboardScopeSchema).extend({
    job_type: dashboardV2JobTypeSchema.optional(),
    coordinator: z.string().trim().optional(),
    support: z.string().trim().optional()
});

export type DashboardKpiQueryInput = z.infer<typeof dashboardKpiQuerySchema>;

export const dashboardKpiDrilldownTypeSchema = z.enum([
    "keterlambatan",
    "denda",
    "kerja_tambah",
    "kerja_kurang",
    "total_ulok",
    "cost_m2",
    "jhk",
    "sla_coord",
    "sla_bm",
    "sla_branch_manager",
    "ketepatan_st",
    "sla_ktk"
]);

export const dashboardKpiDrilldownQuerySchema = dashboardKpiQuerySchema.extend({
    kpi_type: dashboardKpiDrilldownTypeSchema,
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(5).max(100).default(50)
});

export type DashboardKpiDrilldownQueryInput = z.infer<typeof dashboardKpiDrilldownQuerySchema>;
