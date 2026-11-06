import type {
    DashboardKpiCardType,
    DashboardKpiDataQualityFlag,
    DashboardKpiFact,
    DashboardKpiMetricMeta,
    DashboardKpiScopeBreakdown,
    DashboardKpiSourceRow,
    DashboardKpiSummary,
} from "./dashboard-kpi.types";

const normalize = (value: unknown) => String(value ?? "").trim();
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();

const approvedRabStatuses = new Set(["DISETUJUI", "APPROVED"]);
const validSpkStatuses = new Set(["SPK_APPROVED", "ACTIVE", "SELESAI", "APPROVED", "DISETUJUI", "AKTIF"]);

export const toKpiNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = normalize(value);
    if (!raw) return 0;

    const compact = raw.replace(/\s/g, "");
    const normalized = compact.includes(",")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.includes(".") && compact.split(".").length > 2
            ? compact.replace(/\./g, "")
            : compact.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: unknown): Date | null => {
    const raw = normalize(value);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (value: unknown): string | null => {
    const raw = normalize(value);
    if (!raw) return null;
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const date = parseDate(raw);
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const dayDiff = (from: unknown, to: unknown): number | null => {
    const start = parseDate(from);
    const end = parseDate(to);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
};

const addDaysToDateKey = (value: unknown, days: number): string | null => {
    const date = parseDate(value);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const minDateKey = (values: Array<string | null>): string | null =>
    values.filter(Boolean).sort()[0] ?? null;

const maxDateKey = (values: Array<string | null>): string | null => {
    const sorted = values.filter(Boolean).sort();
    return sorted[sorted.length - 1] ?? null;
};

const average = (values: Array<number | null | undefined>): number => {
    const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (valid.length === 0) return 0;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

type MutableScope = DashboardKpiScopeBreakdown & {
    seenRabIds: Set<number>;
    seenSpkIds: Set<number>;
    seenOpnameIds: Set<number>;
};

type MutableFact = Omit<DashboardKpiFact, "scope_breakdown" | "data_quality_flags"> & {
    scope_breakdown: MutableScope[];
    data_quality_flags: DashboardKpiDataQualityFlag[];
    seenRabIds: Set<number>;
    seenSpkIds: Set<number>;
    seenOpnameIds: Set<number>;
};

const createScope = (row: DashboardKpiSourceRow): MutableScope => ({
    lingkup_pekerjaan: normalizeUpper(row.lingkup_pekerjaan) || "-",
    toko_id: row.toko_id,
    rab_approved_total: 0,
    opname_total: 0,
    spk_start_date: null,
    spk_end_date: null,
    spk_end_date_after_extension: null,
    official_late_days: 0,
    official_penalty_amount: 0,
    seenRabIds: new Set(),
    seenSpkIds: new Set(),
    seenOpnameIds: new Set(),
});

const createFact = (row: DashboardKpiSourceRow): MutableFact => ({
    nomor_ulok: normalize(row.nomor_ulok) || `TOKO-${row.toko_id}`,
    nama_toko: normalize(row.nama_toko) || "-",
    kode_toko: normalize(row.kode_toko) || null,
    cabang: normalize(row.cabang) || "-",
    toko_ids: [],
    job_types: [],
    rab_approved_total: 0,
    rab_approved_count: 0,
    luas_bangunan: 0,
    spk_start_date: null,
    spk_end_date: null,
    spk_end_date_after_extension: null,
    spk_duration_days: 0,
    st_date: null,
    opname_final_date: null,
    rab_created_date: null,
    rab_coord_approved_date: null,
    rab_bm_approved_date: null,
    rab_branch_manager_approved_date: null,
    official_late_days: 0,
    official_penalty_amount: 0,
    opname_total: 0,
    kerja_tambah_amount: 0,
    kerja_kurang_amount: 0,
    avg_sla_coord: null,
    avg_sla_bm: null,
    avg_sla_branch_manager: null,
    avg_sla_approval_total: null,
    ketepatan_st_days: null,
    sla_ktk_days: null,
    coordinators: [],
    building_supports: [],
    scope_breakdown: [],
    data_quality_flags: [],
    seenRabIds: new Set(),
    seenSpkIds: new Set(),
    seenOpnameIds: new Set(),
});

const getScope = (fact: MutableFact, row: DashboardKpiSourceRow): MutableScope => {
    const lingkup = normalizeUpper(row.lingkup_pekerjaan) || "-";
    const existing = fact.scope_breakdown.find((scope) => scope.toko_id === row.toko_id && scope.lingkup_pekerjaan === lingkup);
    if (existing) return existing;
    const created = createScope(row);
    fact.scope_breakdown.push(created);
    return created;
};

export const buildDashboardKpiFacts = (rows: DashboardKpiSourceRow[]): DashboardKpiFact[] => {
    const byUlok = new Map<string, MutableFact>();
    const slaCoord = new Map<string, number[]>();
    const slaBm = new Map<string, number[]>();
    const slaBranch = new Map<string, number[]>();

    for (const row of rows) {
        const key = normalize(row.nomor_ulok) || `TOKO-${row.toko_id}`;
        const fact = byUlok.get(key) ?? createFact(row);
        byUlok.set(key, fact);
        const scope = getScope(fact, row);

        fact.toko_ids = unique([...fact.toko_ids, row.toko_id]);
        const lingkup = normalizeUpper(row.lingkup_pekerjaan);
        if (lingkup) fact.job_types = unique([...fact.job_types, lingkup]);

        const coordinator = normalize(row.rab_pemberi_persetujuan_koordinator);
        if (coordinator) fact.coordinators = unique([...fact.coordinators, coordinator]);

        const support = normalize(row.plc_building_support);
        if (support) fact.building_supports = unique([...fact.building_supports, support]);

        const isRabApproved = Boolean(row.rab_id) && approvedRabStatuses.has(normalizeUpper(row.rab_status));
        if (isRabApproved && !fact.seenRabIds.has(row.rab_id!)) {
            fact.seenRabIds.add(row.rab_id!);
            scope.seenRabIds.add(row.rab_id!);
            const total = toKpiNumber(row.rab_grand_total_final);
            fact.rab_approved_count += 1;
            fact.rab_approved_total += total;
            scope.rab_approved_total += total;
            fact.luas_bangunan = fact.luas_bangunan || toKpiNumber(row.rab_luas_bangunan);
            fact.rab_created_date = minDateKey([fact.rab_created_date, dateKey(row.rab_created_at)]);
            fact.rab_coord_approved_date = maxDateKey([fact.rab_coord_approved_date, dateKey(row.rab_waktu_persetujuan_koordinator)]);
            fact.rab_bm_approved_date = maxDateKey([fact.rab_bm_approved_date, dateKey(row.rab_waktu_persetujuan_manager)]);
            fact.rab_branch_manager_approved_date = maxDateKey([fact.rab_branch_manager_approved_date, dateKey(row.rab_waktu_persetujuan_direktur)]);
        }

        const isSpkValid = Boolean(row.spk_id) && validSpkStatuses.has(normalizeUpper(row.spk_status));
        if (isSpkValid && !fact.seenSpkIds.has(row.spk_id!)) {
            fact.seenSpkIds.add(row.spk_id!);
            scope.seenSpkIds.add(row.spk_id!);
            const start = dateKey(row.spk_waktu_mulai);
            const end = dateKey(row.spk_waktu_selesai);
            const extendedEnd = dateKey(row.pertambahan_akhir_setelah_perpanjangan) || end;
            fact.spk_start_date = minDateKey([fact.spk_start_date, start]);
            fact.spk_end_date = maxDateKey([fact.spk_end_date, end]);
            fact.spk_end_date_after_extension = maxDateKey([fact.spk_end_date_after_extension, extendedEnd]);
            fact.spk_duration_days = Math.max(fact.spk_duration_days, toKpiNumber(row.spk_durasi));
            scope.spk_start_date = minDateKey([scope.spk_start_date, start]);
            scope.spk_end_date = maxDateKey([scope.spk_end_date, end]);
            scope.spk_end_date_after_extension = maxDateKey([scope.spk_end_date_after_extension, extendedEnd]);
        }

        if (row.opname_id && !fact.seenOpnameIds.has(row.opname_id)) {
            fact.seenOpnameIds.add(row.opname_id);
            scope.seenOpnameIds.add(row.opname_id);
            const opnameTotal = toKpiNumber(row.opname_grand_total_final) || toKpiNumber(row.opname_grand_total_opname);
            const lateDays = toKpiNumber(row.opname_hari_denda);
            const penalty = toKpiNumber(row.opname_nilai_denda);
            fact.opname_total += opnameTotal;
            fact.opname_final_date = maxDateKey([fact.opname_final_date, dateKey(row.opname_created_at)]);
            fact.official_late_days = Math.max(fact.official_late_days, lateDays);
            fact.official_penalty_amount += penalty;
            scope.opname_total += opnameTotal;
            scope.official_late_days = Math.max(scope.official_late_days, lateDays);
            scope.official_penalty_amount += penalty;
        }

        const stDate = row.st_link_pdf ? dateKey(row.st_created_at) : null;
        fact.st_date = maxDateKey([fact.st_date, stDate || dateKey(row.opname_tanggal_serah_terima_denda)]);

        const coordDays = dayDiff(row.rab_created_at, row.rab_waktu_persetujuan_koordinator);
        if (coordDays !== null) slaCoord.set(key, [...(slaCoord.get(key) ?? []), coordDays]);
        const bmDays = dayDiff(row.rab_waktu_persetujuan_koordinator, row.rab_waktu_persetujuan_manager);
        if (bmDays !== null) slaBm.set(key, [...(slaBm.get(key) ?? []), bmDays]);
        const branchDays = dayDiff(row.rab_waktu_persetujuan_manager, row.rab_waktu_persetujuan_direktur);
        if (branchDays !== null) slaBranch.set(key, [...(slaBranch.get(key) ?? []), branchDays]);
    }

    return [...byUlok.entries()].map(([key, fact]) => {
        fact.kerja_tambah_amount = Math.max(0, fact.opname_total - fact.rab_approved_total);
        fact.kerja_kurang_amount = Math.max(0, fact.rab_approved_total - fact.opname_total);
        fact.avg_sla_coord = average(slaCoord.get(key) ?? []) || null;
        fact.avg_sla_bm = average(slaBm.get(key) ?? []) || null;
        fact.avg_sla_branch_manager = average(slaBranch.get(key) ?? []) || null;
        fact.avg_sla_approval_total = average([fact.avg_sla_coord, fact.avg_sla_bm, fact.avg_sla_branch_manager]) || null;
        fact.ketepatan_st_days = dayDiff(addDaysToDateKey(fact.spk_end_date_after_extension, 1), fact.st_date);
        fact.sla_ktk_days = dayDiff(fact.st_date, fact.opname_final_date);

        const flags: DashboardKpiDataQualityFlag[] = [];
        if (fact.rab_approved_count === 0) flags.push("MISSING_RAB_APPROVED");
        if (fact.luas_bangunan <= 0) flags.push("MISSING_LUAS_BANGUNAN");
        if (!fact.spk_end_date_after_extension) flags.push("MISSING_VALID_SPK");
        if (!fact.st_date) flags.push("MISSING_ST_DATE");
        if (!fact.opname_final_date) flags.push("MISSING_OPNAME_FINAL");
        if (fact.avg_sla_coord === null && fact.avg_sla_bm === null && fact.avg_sla_branch_manager === null) {
            flags.push("MISSING_APPROVAL_TIMESTAMPS");
        }
        fact.data_quality_flags = unique(flags);

        const scopeBreakdown = fact.scope_breakdown.map((scope) => {
            const { seenRabIds, seenSpkIds, seenOpnameIds, ...publicScope } = scope;
            return publicScope;
        });
        const { seenRabIds, seenSpkIds, seenOpnameIds, scope_breakdown, ...publicFact } = fact;
        return { ...publicFact, scope_breakdown: scopeBreakdown };
    });
};

export const metricValueForKpiType = (fact: DashboardKpiFact, type: DashboardKpiCardType): number | null => {
    if (type === "total_ulok") return 1;
    if (type === "cost_m2") return fact.rab_approved_total > 0 && fact.luas_bangunan > 0 ? fact.rab_approved_total / fact.luas_bangunan : null;
    if (type === "jhk") return fact.spk_duration_days > 0 ? fact.spk_duration_days : null;
    if (type === "denda") return fact.official_penalty_amount;
    if (type === "keterlambatan") return fact.official_late_days > 0 ? fact.official_late_days : (fact.ketepatan_st_days !== null ? Math.max(0, fact.ketepatan_st_days) : null);
    if (type === "sla_coord") return fact.avg_sla_coord;
    if (type === "sla_bm") return fact.avg_sla_bm;
    if (type === "sla_branch_manager") return fact.avg_sla_branch_manager;
    if (type === "kerja_tambah") return fact.kerja_tambah_amount;
    if (type === "kerja_kurang") return fact.kerja_kurang_amount;
    if (type === "ketepatan_st") return fact.ketepatan_st_days;
    if (type === "sla_ktk") return fact.sla_ktk_days;
    return null;
};

const metricMeta = (facts: DashboardKpiFact[], type: DashboardKpiCardType): DashboardKpiMetricMeta => {
    const valid = facts.filter((fact) => metricValueForKpiType(fact, type) !== null).length;
    return {
        valid_count: valid,
        incomplete_count: Math.max(0, facts.length - valid),
    };
};

export const summarizeDashboardKpiFacts = (facts: DashboardKpiFact[]): DashboardKpiSummary => ({
    basis: "ULOK_GABUNGAN",
    total_ulok: facts.length,
    avg_cost_m2: average(facts.map((fact) => metricValueForKpiType(fact, "cost_m2"))),
    avg_jhk: average(facts.map((fact) => metricValueForKpiType(fact, "jhk"))),
    avg_denda: average(facts.map((fact) => metricValueForKpiType(fact, "denda"))),
    total_denda: facts.reduce((sum, fact) => sum + fact.official_penalty_amount, 0),
    avg_keterlambatan_all: average(facts.map((fact) => metricValueForKpiType(fact, "keterlambatan"))),
    terlambat_count: facts.filter((fact) => (metricValueForKpiType(fact, "keterlambatan") ?? 0) > 0).length,
    avg_kerja_tambah: average(facts.map((fact) => fact.kerja_tambah_amount)),
    avg_kerja_kurang: average(facts.map((fact) => fact.kerja_kurang_amount)),
    avg_sla_coord: average(facts.map((fact) => fact.avg_sla_coord)),
    avg_sla_bm: average(facts.map((fact) => fact.avg_sla_bm)),
    avg_sla_branch_manager: average(facts.map((fact) => fact.avg_sla_branch_manager)),
    avg_ketepatan_st: average(facts.map((fact) => metricValueForKpiType(fact, "ketepatan_st"))),
    avg_sla_ktk: average(facts.map((fact) => metricValueForKpiType(fact, "sla_ktk"))),
    metrics: {
        total_ulok: metricMeta(facts, "total_ulok"),
        cost_m2: metricMeta(facts, "cost_m2"),
        jhk: metricMeta(facts, "jhk"),
        denda: metricMeta(facts, "denda"),
        keterlambatan: metricMeta(facts, "keterlambatan"),
        sla_coord: metricMeta(facts, "sla_coord"),
        sla_bm: metricMeta(facts, "sla_bm"),
        sla_branch_manager: metricMeta(facts, "sla_branch_manager"),
        kerja_tambah: metricMeta(facts, "kerja_tambah"),
        kerja_kurang: metricMeta(facts, "kerja_kurang"),
        ketepatan_st: metricMeta(facts, "ketepatan_st"),
        sla_ktk: metricMeta(facts, "sla_ktk"),
    },
});
