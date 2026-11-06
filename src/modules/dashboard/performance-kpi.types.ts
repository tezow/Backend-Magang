export type PerformanceKpiPeriod = "1m" | "3m" | "6m" | "12m" | "ytd" | "all";
export type PerformanceKpiJobType = "ALL" | "REGULER" | "RENOVASI";

export type PerformanceKpiCardType =
    | "sla_approval"
    | "cost_m2"
    | "jhk"
    | "denda"
    | "kerja_tambah"
    | "kerja_kurang"
    | "ketepatan_st"
    | "sla_ktk"
    | "all";

export type PerformanceKpiSlaRole = "support" | "coordinator" | "bm_manager" | "branch_manager";
export type PerformanceKpiPersonRole = "coordinator" | "support" | "bm_manager" | "branch_manager";
export type PerformanceKpiDocument = "rab" | "spk" | "tambah_spk" | "il" | "ktk";
export type PerformanceKpiTableMetric =
    | "jhk_notaris_to_end_spk"
    | "jhk_notaris_to_start_spk"
    | "persentase_temuan"
    | "ketepatan_st"
    | "deviasi_pe"
    | "finalisasi_ktk";

export type PerformanceKpiQueryInput = {
    actor_role: string;
    actor_cabang: string;
    actor_company?: string;
    cabang?: string;
    cabang_array?: string[];
    _is_global_access?: boolean;
    coordinator?: string;
    support?: string;
    job_type?: PerformanceKpiJobType;
    period?: PerformanceKpiPeriod;
    search?: string;
    tipe_bangunan?: "ALL" | "RUKO" | "NON_RUKO";
};

export type PerformanceKpiDrilldownInput = PerformanceKpiQueryInput & {
    card_type: PerformanceKpiCardType;
    sla_role?: PerformanceKpiSlaRole;
    sla_doc?: PerformanceKpiDocument;
    person_role?: PerformanceKpiPersonRole;
    person_name?: string;
    support_metric?: PerformanceKpiTableMetric;
    page: number;
    limit: number;
};

export type PerformanceKpiDetailInput = PerformanceKpiQueryInput & {
    nomor_ulok: string;
    lingkup_pekerjaan?: string;
    card_type: PerformanceKpiCardType;
    sla_role?: PerformanceKpiSlaRole;
    sla_doc?: PerformanceKpiDocument;
    person_role?: PerformanceKpiPersonRole;
    person_name?: string;
    support_metric?: PerformanceKpiTableMetric;
};

export type PerformanceKpiOptionStatsInput = PerformanceKpiQueryInput & {
    card_type: PerformanceKpiCardType;
    selected_role?: PerformanceKpiSlaRole | PerformanceKpiPersonRole;
    selected_name?: string;
    sla_doc?: PerformanceKpiDocument;
};

export type PerformanceKpiOptionStat = {
    id: string;
    label: string;
    value: number | null;
    count: number;
    incomplete_count: number;
    bangunan?: number | null;
    area_terbuka?: number | null;
};

export type PerformanceKpiRawRow = {
    toko_id: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    proyek: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
    support_name: string | null;
    support_created_at: string | Date | null;

    rab_id: number | null;
    rab_status: string | null;
    rab_grand_total_final: string | null;
    rab_luas_bangunan: string | null;
    rab_luas_terbuka: string | null;
    rab_area_terbuka: string | number | null;
    rab_created_at: string | Date | null;
    rab_coord_name: string | null;
    rab_coord_at: string | Date | null;
    rab_manager_name: string | null;
    rab_manager_at: string | Date | null;
    rab_pdf_gabungan: string | null;
    rab_pdf_non_sbo: string | null;
    rab_pdf_rekap: string | null;
    rab_pdf_sph: string | null;
    rab_pdf_materai: string | null;

    spk_id: number | null;
    spk_nomor: string | null;
    spk_status: string | null;
    spk_grand_total: string | number | null;
    spk_created_at: string | Date | null;
    spk_start: string | Date | null;
    spk_end: string | Date | null;
    spk_duration: number | null;
    spk_approver: string | null;
    spk_approved_at: string | Date | null;
    spk_pdf: string | null;

    tambah_spk_id: number | null;
    tambah_spk_days: string | null;
    tambah_spk_old_end: string | null;
    tambah_spk_new_end: string | null;
    tambah_spk_created_at: string | Date | null;
    tambah_spk_approver: string | null;
    tambah_spk_approved_at: string | Date | null;
    tambah_spk_pdf: string | null;
    tambah_spk_lampiran: string | null;

    il_id: number | null;
    il_status: string | null;
    il_grand_total_final: string | null;
    il_created_at: string | Date | null;
    il_coord_name: string | null;
    il_coord_at: string | Date | null;
    il_manager_name: string | null;
    il_manager_at: string | Date | null;
    il_pdf_gabungan: string | null;
    il_pdf_non_sbo: string | null;
    il_pdf_rekap: string | null;
    il_lampiran: string | null;

    opname_id: number | null;
    opname_status: string | null;
    opname_type: string | null;
    opname_grand_total_final: string | null;
    opname_grand_total_opname: string | null;
    opname_grand_total_rab: string | null;
    opname_created_at: string | Date | null;
    opname_coord_name: string | null;
    opname_coord_at: string | Date | null;
    opname_manager_name: string | null;
    opname_manager_at: string | Date | null;
    opname_director_name: string | null;
    opname_director_at: string | Date | null;
    opname_hari_denda: number | null;
    opname_nilai_denda: string | number | null;
    opname_tanggal_akhir_spk_denda: string | Date | null;
    opname_tanggal_st_denda: string | Date | null;
    opname_pdf: string | null;

    st_created_at: string | Date | null;
    st_pdf: string | null;

    tanggal_notaris_start: string | Date | null;
    tanggal_notaris_end: string | Date | null;
    persentase_temuan: string | number | null;
    deviasi_pe: string | number | null;
};

export type PerformanceKpiDocumentLink = {
    type: PerformanceKpiDocument | "serah_terima" | "sph" | "lampiran";
    label: string;
    url: string;
    source: string;
    lingkup?: string | null;
};

export type PerformanceKpiApprovalEvent = {
    role: PerformanceKpiSlaRole;
    document: PerformanceKpiDocument;
    label: string;
    lingkup?: string | null;
    actorName: string | null;
    startAt: string | null;
    approvedAt: string | null;
    durationDays: number | null;
    source: string;
};

export type PerformanceKpiScopeRow = {
    tokoId: number;
    lingkup: string | null;
    supportName: string | null;
    projectType: PerformanceKpiJobType | "UNKNOWN";
    spkTotal: number | null;
    spkStart: string | null;
    spkEnd: string | null;
    spkEndWithExtension: string | null;
    spkDurationDays: number | null;
    jhkActualDays: number | null;
    jhkTargetDays: number | null;
    targetStDate: string | null;
    extensionDays: number | null;
    rabTotal: number | null;
    luasBangunan: number | null;
    luasTerbuka: number | null;
    rabAreaTerbuka: number | null;
    opnameFinalTotal: number | null;
    dendaValue: number | null;
    dendaDays: number | null;
    stDate: string | null;
    ktkCreatedDate: string | null;
    finalKtkDate: string | null;
};

export type PerformanceKpiFact = {
    nomorUlok: string;
    namaToko: string | null;
    kodeToko: string | null;
    cabang: string | null;
    alamat: string | null;
    kontraktor: string | null;
    supports: string[];
    coordinators: string[];
    rows: PerformanceKpiScopeRow[];
    approvals: PerformanceKpiApprovalEvent[];
    documents: PerformanceKpiDocumentLink[];
    kpiMetrics: {
        tanggalNotarisStart: string | null;
        tanggalNotarisEnd: string | null;
        persentaseTemuan: number | null;
        deviasiPe: number | null;
    };
    values: {
        costM2Terbangun: number | null;
        costM2Bangunan: number | null;
        costM2Terbuka: number | null;
        jhkDays: number | null;
        jhkActualDays: number | null;
        jhkTargetDays: number | null;
        dendaValue: number | null;
        kerjaTambah: number | null;
        kerjaKurang: number | null;
        ketepatanStDays: number | null;
        slaKtkDays: number | null;
    };
    dataQuality: string[];
};
