export const DASHBOARD_KPI_CARD_TYPES = [
    "total_ulok",
    "cost_m2",
    "jhk",
    "denda",
    "keterlambatan",
    "sla_coord",
    "sla_bm",
    "sla_branch_manager",
    "kerja_tambah",
    "kerja_kurang",
    "ketepatan_st",
    "sla_ktk",
] as const;

export type DashboardKpiCardType = typeof DASHBOARD_KPI_CARD_TYPES[number];

export type DashboardKpiDataQualityFlag =
    | "MISSING_RAB_APPROVED"
    | "MISSING_LUAS_BANGUNAN"
    | "MISSING_VALID_SPK"
    | "MISSING_ST_DATE"
    | "MISSING_OPNAME_FINAL"
    | "MISSING_APPROVAL_TIMESTAMPS";

export type DashboardKpiScopeBreakdown = {
    lingkup_pekerjaan: string;
    toko_id: number;
    rab_approved_total: number;
    opname_total: number;
    spk_start_date: string | null;
    spk_end_date: string | null;
    spk_end_date_after_extension: string | null;
    official_late_days: number;
    official_penalty_amount: number;
};

export type DashboardKpiSourceRow = {
    toko_id: number;
    nomor_ulok: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    lingkup_pekerjaan: string | null;
    rab_id: number | null;
    rab_status: string | null;
    rab_grand_total_final: string | number | null;
    rab_luas_bangunan: string | number | null;
    rab_created_at: string | null;
    rab_waktu_persetujuan_koordinator: string | null;
    rab_waktu_persetujuan_manager: string | null;
    rab_waktu_persetujuan_direktur: string | null;
    rab_pemberi_persetujuan_koordinator: string | null;
    spk_id: number | null;
    spk_status: string | null;
    spk_durasi: string | number | null;
    spk_waktu_mulai: string | null;
    spk_waktu_selesai: string | null;
    pertambahan_akhir_setelah_perpanjangan: string | null;
    opname_id: number | null;
    opname_status: string | null;
    opname_created_at: string | null;
    opname_grand_total_final: string | number | null;
    opname_grand_total_opname: string | number | null;
    opname_grand_total_rab: string | number | null;
    opname_tanggal_akhir_spk_denda: string | null;
    opname_tanggal_serah_terima_denda: string | null;
    opname_hari_denda: string | number | null;
    opname_nilai_denda: string | number | null;
    st_created_at: string | null;
    st_link_pdf: string | null;
    plc_building_support: string | null;
};

export type DashboardKpiFact = {
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string | null;
    cabang: string;
    toko_ids: number[];
    job_types: string[];
    rab_approved_total: number;
    rab_approved_count: number;
    luas_bangunan: number;
    spk_start_date: string | null;
    spk_end_date: string | null;
    spk_end_date_after_extension: string | null;
    spk_duration_days: number;
    st_date: string | null;
    opname_final_date: string | null;
    rab_created_date: string | null;
    rab_coord_approved_date: string | null;
    rab_bm_approved_date: string | null;
    rab_branch_manager_approved_date: string | null;
    official_late_days: number;
    official_penalty_amount: number;
    opname_total: number;
    kerja_tambah_amount: number;
    kerja_kurang_amount: number;
    avg_sla_coord: number | null;
    avg_sla_bm: number | null;
    avg_sla_branch_manager: number | null;
    avg_sla_approval_total: number | null;
    ketepatan_st_days: number | null;
    sla_ktk_days: number | null;
    coordinators: string[];
    building_supports: string[];
    scope_breakdown: DashboardKpiScopeBreakdown[];
    data_quality_flags: DashboardKpiDataQualityFlag[];
};

export type DashboardKpiMetricMeta = {
    valid_count: number;
    incomplete_count: number;
};

export type DashboardKpiSummary = {
    basis: "ULOK_GABUNGAN";
    total_ulok: number;
    avg_cost_m2: number;
    avg_jhk: number;
    avg_denda: number;
    total_denda: number;
    avg_keterlambatan_all: number;
    terlambat_count: number;
    avg_kerja_tambah: number;
    avg_kerja_kurang: number;
    avg_sla_coord: number;
    avg_sla_bm: number;
    avg_sla_branch_manager: number;
    avg_ketepatan_st: number;
    avg_sla_ktk: number;
    metrics: Record<DashboardKpiCardType, DashboardKpiMetricMeta>;
};

export type DashboardKpiDrilldownRow = {
    nomor_ulok: string;
    proyek: string;
    kode_toko: string | null;
    cabang: string;
    job_types: string[];
    value: number | null;
    value_label: string;
    secondary_label: string;
    coordinators: string[];
    building_supports: string[];
    data_quality_flags: DashboardKpiDataQualityFlag[];
    scope_breakdown: DashboardKpiScopeBreakdown[];
    detail: {
        rab_approved_total: number;
        luas_bangunan: number;
        spk_start_date: string | null;
        spk_end_date_after_extension: string | null;
        st_date: string | null;
        opname_final_date: string | null;
        rab_created_date: string | null;
        rab_coord_approved_date: string | null;
        rab_bm_approved_date: string | null;
        rab_branch_manager_approved_date: string | null;
        official_late_days: number;
        official_penalty_amount: number;
        opname_total: number;
        kerja_tambah_amount: number;
        kerja_kurang_amount: number;
        avg_sla_coord: number | null;
        avg_sla_bm: number | null;
        avg_sla_branch_manager: number | null;
        avg_sla_approval_total: number | null;
    };
};
