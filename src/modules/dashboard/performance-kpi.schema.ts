import { z } from "zod";

export const performanceKpiPeriodSchema = z.enum(["1m", "3m", "6m", "12m", "ytd", "all"]).default("all");
export const performanceKpiJobTypeSchema = z.enum(["ALL", "REGULER", "RENOVASI"]).default("ALL");
export const performanceKpiCardTypeSchema = z.enum([
    "sla_approval",
    "cost_m2",
    "jhk",
    "denda",
    "kerja_tambah",
    "kerja_kurang",
    "ketepatan_st",
    "sla_ktk",
    "all"
]);
export const performanceKpiSlaRoleSchema = z.enum(["support", "coordinator", "bm_manager", "branch_manager"]).optional();
export const performanceKpiDocumentSchema = z.enum(["rab", "spk", "tambah_spk", "il", "ktk"]).optional();
export const performanceKpiPersonRoleSchema = z.enum(["coordinator", "support", "bm_manager", "branch_manager"]).optional();
export const performanceKpiTableMetricSchema = z.enum([
    "jhk_notaris_to_end_spk",
    "jhk_notaris_to_start_spk",
    "persentase_temuan",
    "ketepatan_st",
    "deviasi_pe",
    "finalisasi_ktk"
]).optional();

const scopeSchema = {
    actor_role: z.string().trim().min(1),
    actor_cabang: z.string().trim().min(1),
    actor_company: z.string().trim().optional(),
    cabang: z.string().trim().optional(),
    cabang_array: z.array(z.string()).optional(),
    coordinator: z.string().trim().optional(),
    support: z.string().trim().optional(),
    job_type: performanceKpiJobTypeSchema,
    period: performanceKpiPeriodSchema,
    search: z.string().trim().optional(),
    tipe_bangunan: z.enum(["ALL", "RUKO", "NON_RUKO"]).optional(),
};

export const performanceKpiSummaryQuerySchema = z.object(scopeSchema);
export const performanceKpiFiltersQuerySchema = z.object(scopeSchema);
export const performanceKpiTableQuerySchema = z.object(scopeSchema);
export const performanceKpiOptionStatsQuerySchema = z.object(scopeSchema).extend({
    card_type: performanceKpiCardTypeSchema,
    selected_role: z.union([performanceKpiSlaRoleSchema, performanceKpiPersonRoleSchema]).optional(),
    selected_name: z.string().trim().optional()
});

export const performanceKpiDrilldownQuerySchema = z.object(scopeSchema).extend({
    card_type: performanceKpiCardTypeSchema,
    sla_role: performanceKpiSlaRoleSchema,
    sla_doc: performanceKpiDocumentSchema,
    person_role: performanceKpiPersonRoleSchema,
    person_name: z.string().trim().optional(),
    support_metric: performanceKpiTableMetricSchema,
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(5).max(100).default(25)
});

export const performanceKpiDetailQuerySchema = z.object(scopeSchema).extend({
    nomor_ulok: z.string().trim().min(1),
    lingkup_pekerjaan: z.string().trim().optional(),
    card_type: performanceKpiCardTypeSchema,
    sla_role: performanceKpiSlaRoleSchema,
    sla_doc: performanceKpiDocumentSchema,
    person_role: performanceKpiPersonRoleSchema,
    person_name: z.string().trim().optional(),
    support_metric: performanceKpiTableMetricSchema
});

export type PerformanceKpiSummaryQueryInput = z.infer<typeof performanceKpiSummaryQuerySchema>;
export type PerformanceKpiFiltersQueryInput = z.infer<typeof performanceKpiFiltersQuerySchema>;
export type PerformanceKpiTableQueryInput = z.infer<typeof performanceKpiTableQuerySchema>;
export type PerformanceKpiOptionStatsQueryInput = z.infer<typeof performanceKpiOptionStatsQuerySchema>;
export type PerformanceKpiDrilldownQueryInput = z.infer<typeof performanceKpiDrilldownQuerySchema>;
export type PerformanceKpiDetailQueryInput = z.infer<typeof performanceKpiDetailQuerySchema>;
