export type DashboardV2JobType = "ALL" | "REGULER" | "RENOVASI";

export type DashboardV2CardType =
    | "TOTAL_TOKO"
    | "SLA"
    | "SPK_AKTIF"
    | "TOTAL_DENDA"
    | "NILAI_PENAWARAN"
    | "TAMBAH_HARI_SPK"
    | "ITEM_PENGAWASAN"
    | "INSTRUKSI_LAPANGAN"
    | "KERJA_TAMBAH_KURANG"
    | "SERAH_TERIMA"
    | "COST_M2_BANGUNAN"
    | "COST_M2_TERBUKA";

export type DashboardV2Period = "1m" | "3m" | "6m" | "1y" | "all";

export type DashboardV2DocumentType =
    | "RAB"
    | "GANTT"
    | "SPK"
    | "TAMBAH_HARI_SPK"
    | "PENGAWASAN"
    | "INSTRUKSI_LAPANGAN"
    | "OPNAME_PARSIAL"
    | "OPNAME_FINAL"
    | "SERAH_TERIMA";

export type DashboardV2Tone = "neutral" | "blue" | "green" | "yellow" | "red" | "purple" | "orange";

export type DashboardV2Metric = {
    label: string;
    value: string | number;
    tone: DashboardV2Tone;
};

export type DashboardV2SummaryCard = {
    type: DashboardV2CardType;
    title: string;
    value: string | number;
    subtitle: string;
    tone: DashboardV2Tone;
    metrics: DashboardV2Metric[];
};

export type DashboardV2Summary = {
    generated_at: string;
    total_projects: number;
    cards: DashboardV2SummaryCard[];
};

export type DashboardV2Row = {
    key: string;
    toko_id: number;
    nomor_ulok: string;
    nama_toko: string;
    cabang: string;
    lingkup_pekerjaan: string;
    proyek: string;
    stage: string;
    status_label: string;
    value_label: string;
    metrics: DashboardV2Metric[];
};

export type DashboardV2TimelineNode = {
    id: string;
    type: DashboardV2DocumentType;
    title: string;
    subtitle: string;
    status_label: string;
    date_label: string;
    value_label: string;
    pdf_url: string | null;
    raw_id: number | null;
};

export type DashboardV2Timeline = {
    toko_id: number;
    nomor_ulok: string;
    nama_toko: string;
    cabang: string;
    lingkup_pekerjaan: string;
    nodes: DashboardV2TimelineNode[];
};

export type DashboardV2DetailField = {
    label: string;
    value: string;
};

export type DashboardV2Detail = {
    title: string;
    subtitle: string;
    type: DashboardV2DocumentType;
    status_label: string;
    pdf_url: string | null;
    fields: DashboardV2DetailField[];
    items: Array<Record<string, string | number | null>>;
};

export type DashboardV2ChartDataset = {
    label: string;
    data: number[];
    kind: "count" | "currency";
};

export type DashboardV2Chart = {
    id: "rab" | "spk" | "release_st" | "spk_vs_opname";
    title: string;
    labels: string[];
    datasets: DashboardV2ChartDataset[];
};

export type DashboardV2Charts = {
    period: DashboardV2Period;
    charts: DashboardV2Chart[];
};
