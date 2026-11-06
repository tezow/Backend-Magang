import * as XLSX from "xlsx";
import { AppError } from "../../common/app-error";
import { isSameBranchScope } from "../../common/branch-scope";
import { renderPdfFromHtml } from "../../common/html-pdf";
import { calculateDendaNominal, isHeadOfficeCabang } from "../denda/denda-keterlambatan";
import { PP_STATUS_LABEL } from "../project-planning/project-planning.constants";
import type { DashboardData, DashboardProjectPlanningRow, DashboardUserExportRow as DashboardUserSourceRow } from "./dashboard.repository";
import type { DashboardExportQueryInput } from "./dashboard.schema";

export type DashboardExportColumn = {
    key: string;
    label: string;
};

export type DashboardExportRow = {
    timestamp: string;
    cabang: string;
    nomor_ulok: string;
    status_rab: string;
    proyek: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    nama_toko: string;
    kode_toko: string;
    luas_bangunan: string;
    luas_terbangunan: string;
    luas_area_terbuka: string;
    luas_area_parkir: string;
    luas_area_sales: string;
    luas_gudang: string;
    pekerjaan_area_terbuka: number;
    pekerjaan_beanspot: number;
    total_penawaran_final: number;
    kategori: string;
    timestamp_acc_koordinator: string;
    timestamp_acc_manager: string;
    pic: string;
    status_spk: string;
    timestamp_spk: string;
    durasi_spk: string | number;
    waktu_persetujuan_bm: string;
    nominal_spk: number;
    cost_m2_bangunan: number;
    cost_m2_terbuka: number;
    cost_m2_terbangun: number;
    awal_spk: string;
    akhir_spk: string;
    tambah_spk: string;
    akhir_spk_setelah: string;
    real_spk: number;
    tanggal_serah_terima: string;
    keterlambatan: number;
    denda: number;
    tanggal_grand_opening: string;
    kerja_tambah: number;
    kerja_kurang: number;
    grand_total_opname_final: number;
    tanggal_opname_final: string;
    status_opname_final: string;
    nilai_toko: number;
    keterangan_toko?: string;
    _work_items?: string[];
    _job_items?: DashboardJobItemExportRow[];
};

export type DashboardJobItemExportRow = {
    sumber: string;
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume: string | number;
    harga_material: number;
    harga_upah: number;
    total_material: number;
    total_upah: number;
    total_harga: number;
    status: string;
    catatan: string;
    tanggal: string;
};

export type DashboardPengawasanExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    tanggal_pengawasan: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    status: string;
    catatan: string;
};

export type DashboardOpnameParsialExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    tipe_opname: string;
    tanggal_serah_terima: string;
    status_opname: string;
    keterlambatan: number;
    denda: number;
    kerja_tambah: number;
    kerja_kurang: number;
    grand_total_opname: number;
};

export type DashboardInstruksiLapanganExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume: number | string;
    harga_material: number;
    harga_upah: number;
    total_material: number;
    total_upah: number;
    total_harga: number;
    status_il: string;
    tanggal: string;
};

export type DashboardSerahTerimaExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    tanggal_serah_terima: string;
    link_dokumen: string;
};

export type DashboardKtkOpnameFinalExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    lingkup_pekerjaan: string;
    kontraktor: string;
    status_opname_final: string;
    tanggal_opname_final: string;
    tanggal_serah_terima: string;
    keterlambatan: number;
    denda: number;
    kerja_tambah: number;
    kerja_kurang: number;
    grand_total_opname: number;
    nilai_toko: number;
};

export type DashboardProjectPlanningExportRow = {
    cabang: string;
    nomor_ulok: string;
    nama_toko: string;
    kode_toko: string;
    proyek: string;
    lingkup_pekerjaan: string;
    nama_pengaju: string;
    nama_lokasi: string;
    jenis_proyek: string;
    jenis_pengajuan: string;
    estimasi_biaya: string;
    luas_bangunan: string;
    luas_area_terbuka: string;
    luas_area_terbangun: string;
    luas_gudang: string;
    luas_area_parkir: string;
    luas_area_sales: string;
    status: string;
    tanggal_pengajuan: string;
    tanggal_persetujuan_bm: string;
};

export type DashboardUserExportRow = {
    nama_user: string;
    email_user: string;
    role: string;
    cabang: string;
    tanggal_login_terakhir: string;
};

export const dashboardExportColumns: DashboardExportColumn[] = [
    { key: "timestamp", label: "Timestamp" },
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor Ulok" },
    { key: "status_rab", label: "Status_Rab" },
    { key: "proyek", label: "Proyek" },
    { key: "lingkup_pekerjaan", label: "Lingkup_Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "nama_toko", label: "Nama_Toko" },
    { key: "kode_toko", label: "Kode_Toko" },
    { key: "luas_bangunan", label: "Luas Bangunan" },
    { key: "luas_terbangunan", label: "Luas Terbangunan" },
    { key: "luas_area_terbuka", label: "Luas Area Terbuka" },
    { key: "luas_area_parkir", label: "Luas Area Parkir" },
    { key: "luas_area_sales", label: "Luas Area Sales" },
    { key: "luas_gudang", label: "Luas Gudang" },
    { key: "pekerjaan_area_terbuka", label: "Pekerjaan Area Terbuka" },
    { key: "pekerjaan_beanspot", label: "Pekerjaan Beanspot" },
    { key: "total_penawaran_final", label: "Total Penawaran Final" },
    { key: "kategori", label: "Kategori" },
    { key: "timestamp_acc_koordinator", label: "Tanggal Approved Koordinator" },
    { key: "timestamp_acc_manager", label: "Tanggal Approved Manager" },
    { key: "pic", label: "PIC" },
    { key: "status_spk", label: "Status SPK" },
    { key: "timestamp_spk", label: "TimeSTAMP SPK" },
    { key: "durasi_spk", label: "Durasi SPK" },
    { key: "waktu_persetujuan_bm", label: "Waktu Persetujuan BM" },
    { key: "nominal_spk", label: "Nominal SPK" },
    { key: "cost_m2_bangunan", label: "Cost/m2 Bangunan" },
    { key: "cost_m2_terbuka", label: "Cost/m2 Terbuka" },
    { key: "cost_m2_terbangun", label: "Cost/m2 Terbangun" },
    { key: "awal_spk", label: "Awal_SPK" },
    { key: "akhir_spk", label: "Akhir_SPK" },
    { key: "tambah_spk", label: "tambah_spk" },
    { key: "akhir_spk_setelah", label: "Akhir_SPK_Setelah" },
    { key: "real_spk", label: "Real SPK" },
    { key: "tanggal_serah_terima", label: "tanggal_serah_terima" },
    { key: "keterlambatan", label: "Keterlambatan" },
    { key: "denda", label: "Denda" },
    { key: "tanggal_grand_opening", label: "Tanggal Grand Opening" },
    { key: "kerja_tambah", label: "Kerja_Tambah" },
    { key: "kerja_kurang", label: "Kerja_Kurang" },
    { key: "grand_total_opname_final", label: "Grand Total Opname Final" },
    { key: "tanggal_opname_final", label: "tanggal_opname_final" },
    { key: "status_opname_final", label: "Status Opname Final" },
    { key: "nilai_toko", label: "Nilai Toko" },
    { key: "keterangan_toko", label: "Keterangan Toko" }
];

const normalize = (value: unknown) => String(value ?? "").trim();
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();

const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = normalize(value);
    if (!raw) return 0;
    const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: unknown): Date | null => {
    const raw = normalize(value);
    if (!raw) return null;
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const [, day, month, year] = slash;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoDate = (value: unknown): string => {
    const date = toDate(value);
    if (!date) return "";
    return date.toISOString().slice(0, 10);
};

const formatDateTime = (value: unknown): string => {
    const date = toDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta"
    }).format(date);
};

const formatDateLong = (value: unknown): string => {
    const date = toDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta"
    }).format(date);
};

const formatMoney = (value: unknown): string =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(toNumber(value));

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6;
};

const nextBusinessDayAfter = (date: Date): Date => {
    let current = addDays(date, 1);
    while (isWeekend(current)) current = addDays(current, 1);
    return current;
};

const countWeekdaysAfter = (freeDate: Date, compareDate: Date): number => {
    if (compareDate <= freeDate) return 0;
    let current = addDays(freeDate, 1);
    let count = 0;
    while (current <= compareDate) {
        if (!isWeekend(current)) count += 1;
        current = addDays(current, 1);
    }
    return count;
};

const calculatePenalty = (lateDays: number): number => {
    return calculateDendaNominal(lateDays);
};

const roundDownTenThousand = (value: number): number => {
    const sign = value < 0 ? -1 : 1;
    return sign * Math.floor(Math.abs(value) / 10000) * 10000;
};

const roundUpTenThousand = (value: number): number => {
    if (value === 0) return 0;
    const sign = value < 0 ? -1 : 1;
    return sign * Math.ceil(Math.abs(value) / 10000) * 10000;
};

const isNoPpnArea = (project: DashboardData): boolean => {
    const values = [
        project.toko.cabang,
        project.toko.nama_toko,
        project.toko.alamat
    ].map((value) => normalizeUpper(value));

    return values.some((value) => value === "BATAM" || value === "BINTAN" || /\bBATAM\b|\bBINTAN\b/.test(value));
};

const buildFinancialGrandTotal = (total: number, direction: "down" | "up", noPpn = false): number => {
    const pembulatan = direction === "down"
        ? roundDownTenThousand(total)
        : roundUpTenThousand(total);
    const ppn = noPpn ? 0 : Math.round(pembulatan * 0.11);
    return pembulatan + ppn;
};

const latestByDate = <T>(items: T[], picker: (item: T) => unknown): T | null => {
    if (items.length === 0) return null;
    return [...items].sort((a, b) => (toDate(picker(b))?.getTime() ?? 0) - (toDate(picker(a))?.getTime() ?? 0))[0] ?? null;
};

const isApprovedSpk = (status: unknown): boolean => {
    const normalized = normalizeUpper(status);
    return ["APPROVED", "ACTIVE", "SPK_APPROVED", "DISETUJUI", "AKTIF", "SELESAI"].includes(normalized);
};

const isApprovedExtension = (status: unknown): boolean => {
    const normalized = normalizeUpper(status);
    return normalized === "APPROVED" || normalized.includes("DISETUJUI");
};

const isAreaTerbuka = (item: { kategori_pekerjaan?: string | null; jenis_pekerjaan?: string | null; rab_item?: unknown }) => {
    const rabItem = item.rab_item && typeof item.rab_item === "object" ? item.rab_item as Record<string, unknown> : {};
    const text = `${item.kategori_pekerjaan ?? rabItem.kategori_pekerjaan ?? ""} ${item.jenis_pekerjaan ?? rabItem.jenis_pekerjaan ?? ""}`;
    return normalizeUpper(text).includes("AREA TERBUKA");
};

const isBeanspot = (item: { kategori_pekerjaan?: string | null; jenis_pekerjaan?: string | null; rab_item?: unknown }) => {
    const rabItem = item.rab_item && typeof item.rab_item === "object" ? item.rab_item as Record<string, unknown> : {};
    const text = `${item.kategori_pekerjaan ?? rabItem.kategori_pekerjaan ?? ""} ${item.jenis_pekerjaan ?? rabItem.jenis_pekerjaan ?? ""}`;
    return normalizeUpper(text).includes("BEANSPOT");
};

const sumBy = <T>(items: T[], predicate: (item: T) => boolean, picker: (item: T) => unknown): number =>
    items.reduce((total, item) => total + (predicate(item) ? toNumber(picker(item)) : 0), 0);

const findTanggalGo = (
    project: DashboardData,
    dokumentasiByKey: Map<string, { tanggal_go: string | null; created_at: string | null }>
) => {
    const candidates = [
        `kode:${normalizeUpper(project.toko.kode_toko)}`,
        `ulok:${normalizeUpper(project.toko.nomor_ulok)}`,
        `toko:${normalizeUpper(project.toko.cabang)}|${normalizeUpper(project.toko.nama_toko)}`
    ];
    for (const key of candidates) {
        const row = dokumentasiByKey.get(key);
        if (row?.tanggal_go) return row.tanggal_go;
    }
    return "";
};

const parseSelectedTokoIds = (value?: string): Set<number> => {
    const ids = String(value ?? "")
        .split("|")
        .map((item) => Number(item.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
    return new Set(ids);
};
const parseCsvSet = (value?: string): Set<string> => new Set(
    String(value ?? "")
        .split("|")
        .map((item) => normalizeUpper(item))
        .filter(Boolean)
);

const parseMonthSet = (value?: string): Set<number> => new Set(
    String(value ?? "")
        .split("|")
        .map((item) => Number(item.trim()))
        .filter((id) => Number.isInteger(id) && id > 0 && id <= 12)
);

const getProjectDates = (project: DashboardData): Date[] => [
    ...project.rab.map((item) => item.created_at),
    ...project.spk.map((item) => item.created_at),
    ...project.opname_final.map((item) => item.created_at),
    ...project.berkas_serah_terima.map((item) => item.created_at)
]
    .map(toDate)
    .filter((date): date is Date => Boolean(date));

const matchesPeriodFilter = (project: DashboardData, query: DashboardExportQueryInput): boolean => {
    if (query.period_mode === "all") return true;
    const year = query.year ?? new Date().getFullYear();
    const months = parseMonthSet(query.months);
    const dates = getProjectDates(project);
    if (dates.length === 0) return false;

    if (query.period_mode === "ytd") {
        const now = new Date();
        return dates.some((date) => date.getFullYear() === year && date <= now);
    }

    if (months.size === 0) return true;
    return dates.some((date) => date.getFullYear() === year && months.has(date.getMonth() + 1));
};

const hasSpk = (project: DashboardData): boolean => project.spk.length > 0;

const normalizeWorkItemLabel = (value: unknown): string => {
    const normalized = normalizeUpper(value)
        .replace(/^\[\s*IL\s*\]\s*/i, "")
        .replace(/^IL\s*[-:]\s*/i, "")
        .replace(/\s*\(\s*IL\s*\)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    return normalized === "IL" || normalized === "INSTRUKSI LAPANGAN" ? "" : normalized;
};

const collectProjectWorkItems = (project: DashboardData): Set<string> => {
    const values: string[] = [];
    const push = (value: unknown) => {
        const normalized = normalizeWorkItemLabel(value);
        if (normalized) values.push(normalized);
    };

    project.gantt.forEach((gantt) => {
        gantt.kategori_pekerjaan.forEach((kat: any) => {
            push(kat.kategori_pekerjaan);
        });
        gantt.pengawasan.forEach((p: any) => {
            push(p.kategori_pekerjaan);
        });
    });
    project.rab.forEach((rab) => rab.items.forEach((item) => push(item.kategori_pekerjaan || item.jenis_pekerjaan)));
    project.instruksi_lapangan.forEach((instruksi) => {
        instruksi.items.forEach((item) => push(item.kategori_pekerjaan || item.jenis_pekerjaan));
    });

    return new Set(values.filter(Boolean));
};

const buildJobItemBase = (project: DashboardData, source: string) => ({
    sumber: source,
    cabang: normalize(project.toko.cabang),
    nomor_ulok: normalize(project.toko.nomor_ulok),
    nama_toko: normalize(project.toko.nama_toko),
    kode_toko: normalize(project.toko.kode_toko),
    lingkup_pekerjaan: normalize(project.toko.lingkup_pekerjaan)
});

const collectProjectJobItems = (project: DashboardData): DashboardJobItemExportRow[] => {
    const rows: DashboardJobItemExportRow[] = [];

    // removed debug log

    const latestRab = latestByDate(project.rab, (item) => item.created_at);
    if (latestRab && latestRab.items) {
        latestRab.items.forEach((item) => {
            rows.push({
                ...buildJobItemBase(project, "RAB"),
                kategori_pekerjaan: normalize(item.kategori_pekerjaan),
                jenis_pekerjaan: normalize(item.jenis_pekerjaan),
                satuan: normalize(item.satuan),
                volume: normalize(item.volume),
                harga_material: toNumber(item.harga_material),
                harga_upah: toNumber(item.harga_upah),
                total_material: toNumber(item.total_material),
                total_upah: toNumber(item.total_upah),
                total_harga: toNumber(item.total_harga),
                status: normalize(latestRab.status),
                catatan: normalize(item.catatan),
                tanggal: toIsoDate(latestRab.created_at)
            });
        });
    }

    project.instruksi_lapangan.forEach((instruksi) => instruksi.items.forEach((item) => {
        rows.push({
            ...buildJobItemBase(project, "IL"),
            kategori_pekerjaan: normalize(item.kategori_pekerjaan),
            jenis_pekerjaan: normalize(item.jenis_pekerjaan),
            satuan: normalize(item.satuan),
            volume: item.volume ?? "",
            harga_material: toNumber(item.harga_material),
            harga_upah: toNumber(item.harga_upah),
            total_material: toNumber(item.total_material),
            total_upah: toNumber(item.total_upah),
            total_harga: toNumber(item.total_harga),
            status: normalize(instruksi.status),
            catatan: "",
            tanggal: toIsoDate(instruksi.created_at)
        });
    }));

    const result = rows.filter((row) => normalize(row.kategori_pekerjaan || row.jenis_pekerjaan));
    return result;
};

// ---------------------------------------------------------------------------
// Status humanizer — mengubah nilai kode DB ke bahasa Indonesia
// ---------------------------------------------------------------------------

const humanizeSpkStatus = (status: unknown): string => {
    const raw = normalizeUpper(status);
    const map: Record<string, string> = {
        WAITING_FOR_BM_APPROVAL: "Menunggu Persetujuan BM",
        SPK_APPROVED: "SPK Disetujui",
        SPK_REJECTED: "SPK Ditolak",
        APPROVED: "Disetujui",
        ACTIVE: "Aktif",
        AKTIF: "Aktif",
        SELESAI: "Selesai",
        DISETUJUI: "Disetujui"
    };
    return map[raw] ?? normalize(status);
};

const humanizeOpnameStatus = (status: unknown): string => {
    const raw = normalizeUpper(status);
    const map: Record<string, string> = {
        WAITING_FOR_COORDINATOR_APPROVAL: "Menunggu Persetujuan Koordinator",
        WAITING_FOR_MANAGER_APPROVAL: "Menunggu Persetujuan Manager",
        WAITING_FOR_DIRECTOR_APPROVAL: "Menunggu Persetujuan Direktur",
        APPROVED: "Disetujui",
        REJECTED: "Ditolak",
        SELESAI: "Selesai",
        DRAFT: "Draft"
    };
    return map[raw] ?? normalize(status);
};

const humanizePpStatus = (status: unknown): string => {
    const raw = normalizeUpper(status);
    return (PP_STATUS_LABEL as Record<string, string>)[raw] ?? normalize(status);
};

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const identitasCols: Array<keyof DashboardExportRow> = ["timestamp", "cabang", "nomor_ulok", "proyek", "lingkup_pekerjaan", "kontraktor", "nama_toko", "kode_toko", "kategori", "pic"];

const dataTypeColumns: Record<string, Array<keyof DashboardExportRow>> = {
    IDENTITAS: [...identitasCols],
    RAB: [...identitasCols, "status_rab", "pekerjaan_area_terbuka", "pekerjaan_beanspot", "total_penawaran_final", "timestamp_acc_koordinator", "timestamp_acc_manager", "keterangan_toko"],
    SPK: [...identitasCols, "status_spk", "timestamp_spk", "durasi_spk", "waktu_persetujuan_bm", "nominal_spk", "cost_m2_bangunan", "cost_m2_terbuka", "cost_m2_terbangun", "awal_spk", "akhir_spk", "tambah_spk", "akhir_spk_setelah", "real_spk"],
    OPNAME: [...identitasCols, "tanggal_serah_terima", "keterlambatan", "denda", "kerja_tambah", "kerja_kurang", "grand_total_opname_final", "tanggal_opname_final", "status_opname_final", "nilai_toko"]
};

const jobItemExportColumns: DashboardExportColumn[] = [
    { key: "sumber", label: "Sumber" },
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kategori_pekerjaan", label: "Kategori Pekerjaan" },
    { key: "jenis_pekerjaan", label: "Jenis Pekerjaan" },
    { key: "satuan", label: "Satuan" },
    { key: "volume", label: "Volume" },
    { key: "harga_material", label: "Harga Material" },
    { key: "harga_upah", label: "Harga Upah" },
    { key: "total_material", label: "Total Material" },
    { key: "total_upah", label: "Total Upah" },
    { key: "total_harga", label: "Total Harga" },
    { key: "status", label: "Status" },
    { key: "catatan", label: "Catatan" },
    { key: "tanggal", label: "Tanggal" }
];

const pengawasanExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "tanggal_pengawasan", label: "Tanggal Pengawasan" },
    { key: "kategori_pekerjaan", label: "Kategori Pekerjaan" },
    { key: "jenis_pekerjaan", label: "Jenis Pekerjaan" },
    { key: "status", label: "Status" },
    { key: "catatan", label: "Catatan" }
];

const opnameParsialExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "tipe_opname", label: "Tipe Opname" },
    { key: "tanggal_serah_terima", label: "Tanggal Serah Terima" },
    { key: "status_opname", label: "Status Opname" },
    { key: "keterlambatan", label: "Keterlambatan (hari)" },
    { key: "denda", label: "Denda" },
    { key: "kerja_tambah", label: "Kerja Tambah" },
    { key: "kerja_kurang", label: "Kerja Kurang" },
    { key: "grand_total_opname", label: "Grand Total Opname" }
];

const instruksiLapanganExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "kategori_pekerjaan", label: "Kategori Pekerjaan" },
    { key: "jenis_pekerjaan", label: "Jenis Pekerjaan" },
    { key: "satuan", label: "Satuan" },
    { key: "volume", label: "Volume" },
    { key: "harga_material", label: "Harga Material" },
    { key: "harga_upah", label: "Harga Upah" },
    { key: "total_material", label: "Total Material" },
    { key: "total_upah", label: "Total Upah" },
    { key: "total_harga", label: "Total Harga" },
    { key: "status_il", label: "Status IL" },
    { key: "tanggal", label: "Tanggal" }
];

const serahTerimaExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "tanggal_serah_terima", label: "Tanggal Serah Terima" },
    { key: "link_dokumen", label: "Link Dokumen" }
];

const ktkOpnameFinalExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "kontraktor", label: "Kontraktor" },
    { key: "status_opname_final", label: "Status Opname Final" },
    { key: "tanggal_opname_final", label: "Tanggal Opname Final" },
    { key: "tanggal_serah_terima", label: "Tanggal Serah Terima" },
    { key: "keterlambatan", label: "Keterlambatan (hari)" },
    { key: "denda", label: "Denda" },
    { key: "kerja_tambah", label: "Kerja Tambah" },
    { key: "kerja_kurang", label: "Kerja Kurang" },
    { key: "grand_total_opname", label: "Grand Total Opname" },
    { key: "nilai_toko", label: "Nilai Toko" }
];

const projectPlanningExportColumns: DashboardExportColumn[] = [
    { key: "cabang", label: "Cabang" },
    { key: "nomor_ulok", label: "Nomor ULOK" },
    { key: "nama_toko", label: "Nama Toko" },
    { key: "kode_toko", label: "Kode Toko" },
    { key: "proyek", label: "Proyek" },
    { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan" },
    { key: "awal_spk", label: "Awal SPK" },
    { key: "akhir_spk", label: "Akhir SPK" },
    { key: "nama_pengaju", label: "Nama Pengaju" },
    { key: "nama_lokasi", label: "Nama Lokasi" },
    { key: "jenis_pengajuan", label: "Jenis Pengajuan Desain" },
    { key: "status_desain_3d", label: "Desain 3D" },
    { key: "link_desain_3d", label: "Link Desain 3D" },
    { key: "estimasi_biaya", label: "Estimasi Biaya" },
    { key: "luas_bangunan", label: "Luas Bangunan" },
    { key: "luas_area_terbuka", label: "Luas Area Terbuka" },
    { key: "luas_area_terbangun", label: "Luas Terbangun" },
    { key: "luas_gudang", label: "Luas Gudang" },
    { key: "luas_area_parkir", label: "Luas Area Parkir" },
    { key: "luas_area_sales", label: "Luas Area Sales" },
    { key: "status", label: "Status" },
    { key: "tanggal_pengajuan", label: "Tanggal Pengajuan" },
    { key: "tanggal_persetujuan_bm", label: "Tanggal Persetujuan BM Manager 1" },
    { key: "approver_bm", label: "Approver BM Manager 1" },
    { key: "revisi_bm_tahap_1", label: "Jumlah Revisi BM Manager 1" },
    { key: "tanggal_persetujuan_pp1", label: "Tanggal Persetujuan PP Tahap 1" },
    { key: "approver_pp1", label: "Approver PP Tahap 1" },
    { key: "revisi_pp_tahap_1", label: "Jumlah Revisi PP Tahap 1" },
    { key: "waktu_send_3d", label: "Timestamp Kirim 3D" },
    { key: "input_branch_building_koordinator_tahap_2", label: "Input Branch Building Koordinator Tahap 2" },
    { key: "tanggal_persetujuan_bm2", label: "Tanggal Persetujuan B&M Tahap 2" },
    { key: "approver_bm2", label: "Approver B&M Tahap 2" },
    { key: "revisi_bm_tahap_2", label: "Jumlah Revisi B&M Tahap 2" },
    { key: "tanggal_persetujuan_bm_regional", label: "Tanggal Persetujuan B&M Regional" },
    { key: "approver_bm_regional", label: "Approver B&M Regional" },
    { key: "revisi_bm_regional", label: "Jumlah Revisi B&M Regional" },
    { key: "tanggal_persetujuan_pp2", label: "Tanggal Persetujuan PP Tahap 2" },
    { key: "approver_pp2", label: "Approver PP Tahap 2" },
    { key: "revisi_pp_tahap_2", label: "Jumlah Revisi PP Tahap 2" },
    { key: "tanggal_persetujuan_pp_manager", label: "Tanggal Persetujuan PP Manager" },
    { key: "approver_pp_manager", label: "Approver PP Manager" },
    { key: "revisi_pp_manager", label: "Jumlah Revisi PP Manager" }
];

const userExportColumns: DashboardExportColumn[] = [
    { key: "nama_user", label: "Nama User" },
    { key: "email_user", label: "Email User" },
    { key: "role", label: "Role" },
    { key: "cabang", label: "Cabang" },
    { key: "tanggal_login_terakhir", label: "Tanggal Login Terakhir" }
];

const dataTypeLabels: Record<string, string> = {
    IDENTITAS: "Identitas Toko",
    RAB: "RAB & Luasan",
    SPK: "SPK dan cost/m2",
    OPNAME: "Opname & Denda",
    PENGAWASAN: "Pengawasan",
    OPNAME_PARSIAL: "Opname (Parsial)",
    INSTRUKSI_LAPANGAN: "Instruksi Lapangan",
    SERAH_TERIMA: "Serah Terima",
    KTK_OPNAME_FINAL: "KTK (Opname Final)",
    PROJECT_PLANNING: "Project Planning",
    USER: "Data User"
};

const addJobTypeColumns = (keys: Set<keyof DashboardExportRow>, jobTypes?: string) => {
    const selectedJobTypes = parseCsvSet(jobTypes);
    selectedJobTypes.forEach((type) => {
        if (type.includes("AREA TERBUKA")) keys.add("pekerjaan_area_terbuka");
        if (type.includes("BEANSPOT")) keys.add("pekerjaan_beanspot");
    });
};

const resolveDashboardExportColumns = (dataTypes?: string, jobTypes?: string): DashboardExportColumn[] => {
    const selected = parseCsvSet(dataTypes);
    if (selected.size === 0) return dashboardExportColumns;
    const keys = new Set<keyof DashboardExportRow>();
    selected.forEach((type) => dataTypeColumns[type]?.forEach((key) => keys.add(key)));
    addJobTypeColumns(keys, jobTypes);
    if (keys.size === 0) return dashboardExportColumns;
    return dashboardExportColumns.filter((column) => keys.has(column.key as keyof DashboardExportRow));
};

const resolveDataTypeColumns = (dataType: string): DashboardExportColumn[] => {
    const keys = new Set(dataTypeColumns[dataType] ?? []);
    if (keys.size === 0) return dashboardExportColumns;
    return dashboardExportColumns.filter((column) => keys.has(column.key as keyof DashboardExportRow));
};

const normalizeSheetName = (value: string, fallback: string): string => {
    const cleaned = normalize(value)
        .replace(/[\\/?*[\]:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return (cleaned || fallback).slice(0, 31);
};

const normalizeFilePart = (value: string, fallback: string): string => {
    const cleaned = normalizeUpper(value)
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return cleaned || fallback;
};

type DashboardExportSection = {
    title: string;
    filenamePart: string;
    rows: Array<Record<string, unknown>>;
    columns: DashboardExportColumn[];
};

const displayValue = (value: unknown): unknown => {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value;
    return normalize(value) || "Tidak ada";
};

const rowMatchesJobType = (row: DashboardExportRow, jobType: string): boolean => {
    const type = normalizeUpper(jobType);
    if (!type) return true;
    if (row._work_items?.length) return row._work_items.includes(type);
    if (type.includes("AREA TERBUKA")) return toNumber(row.pekerjaan_area_terbuka) !== 0;
    if (type.includes("BEANSPOT")) return toNumber(row.pekerjaan_beanspot) !== 0;
    return true;
};

const jobItemMatchesJobType = (row: DashboardJobItemExportRow, jobType: string): boolean => {
    const type = normalizeWorkItemLabel(jobType);
    return normalizeWorkItemLabel(row.kategori_pekerjaan) === type || normalizeWorkItemLabel(row.jenis_pekerjaan) === type;
};

// ---------------------------------------------------------------------------
// Row builders untuk jenis data baru
// ---------------------------------------------------------------------------

const buildIdentitasToko = (project: DashboardData, spk?: DashboardData["spk"][0] | null) => ({
    cabang: normalize(project.toko.cabang),
    nomor_ulok: normalize(project.toko.nomor_ulok),
    nama_toko: normalize(project.toko.nama_toko),
    kode_toko: normalize(project.toko.kode_toko),
    lingkup_pekerjaan: normalize(project.toko.lingkup_pekerjaan),
    kontraktor: normalize(spk?.nama_kontraktor ?? project.toko.nama_kontraktor),
    keterangan_toko: normalize(project.toko.proyek ?? spk?.proyek)
});

const buildPengawasanRows = (projects: DashboardData[]): Array<Record<string, unknown>> => {
    const rows: Array<Record<string, unknown>> = [];
    for (const project of projects) {
        const approvedSpks = project.spk.filter((s) => isApprovedSpk(s.status));
        const spk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (s) => s.created_at);
        const base = buildIdentitasToko(project, spk);
        for (const gantt of project.gantt) {
            for (const pengawasanGantt of gantt.pengawasan_gantt) {
                const details = gantt.pengawasan.filter(
                    (p) => p.id_pengawasan_gantt === pengawasanGantt.id
                );
                if (details.length === 0) {
                    rows.push({
                        ...base,
                        tanggal_pengawasan: normalize(pengawasanGantt.tanggal_pengawasan),
                        kategori_pekerjaan: "",
                        jenis_pekerjaan: "",
                        status: "",
                        catatan: ""
                    });
                } else {
                    for (const d of details) {
                        rows.push({
                            ...base,
                            tanggal_pengawasan: normalize(pengawasanGantt.tanggal_pengawasan),
                            kategori_pekerjaan: normalize(d.kategori_pekerjaan),
                            jenis_pekerjaan: normalize(d.jenis_pekerjaan),
                            status: normalize(d.status),
                            catatan: normalize(d.catatan)
                        });
                    }
                }
            }
        }
        if (project.gantt.length === 0 || project.gantt.every((g) => g.pengawasan_gantt.length === 0)) {
            // Jika tidak ada gantt/pengawasan, tetap sertakan baris kosong agar toko terlihat
        }
    }
    return rows;
};

const buildOpnameParsialRows = (projects: DashboardData[]): Array<Record<string, unknown>> => {
    const rows: Array<Record<string, unknown>> = [];
    for (const project of projects) {
        const approvedSpks = project.spk.filter((s) => isApprovedSpk(s.status));
        const spk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (s) => s.created_at);
        const base = buildIdentitasToko(project, spk);
        const parsialOpnames = project.opname_final.filter(
            (o) => normalizeUpper(o.tipe_opname) !== "OPNAME_FINAL"
        );
        for (const opname of parsialOpnames) {
            const noPpn = isNoPpnArea(project);
            const items = opname.items ?? [];
            const kerjaTambahRaw = sumBy(items, (item) => toNumber(item.total_selisih) > 0, (item) => item.total_selisih);
            const kerjaKurangRaw = sumBy(items, (item) => toNumber(item.total_selisih) < 0, (item) => item.total_selisih);
            const kerjaTambah = buildFinancialGrandTotal(kerjaTambahRaw, "up", noPpn);
            const kerjaKurang = Math.abs(buildFinancialGrandTotal(kerjaKurangRaw, "up", noPpn));
            const lateDays = Math.max(0, Number(opname.hari_denda ?? 0));
            const penalty = toNumber(opname.nilai_denda) || calculatePenalty(lateDays);
            rows.push({
                ...base,
                tipe_opname: normalize(opname.tipe_opname) || "Parsial",
                tanggal_serah_terima: toIsoDate(opname.tanggal_serah_terima_denda),
                status_opname: humanizeOpnameStatus(opname.status_opname_final),
                keterlambatan: lateDays,
                denda: penalty,
                kerja_tambah: kerjaTambah,
                kerja_kurang: kerjaKurang,
                grand_total_opname: toNumber(opname.grand_total_opname)
            });
        }
    }
    return rows;
};

const buildInstruksiLapanganRows = (projects: DashboardData[]): Array<Record<string, unknown>> => {
    const rows: Array<Record<string, unknown>> = [];
    for (const project of projects) {
        const approvedSpks = project.spk.filter((s) => isApprovedSpk(s.status));
        const spk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (s) => s.created_at);
        const base = buildIdentitasToko(project, spk);
        for (const il of project.instruksi_lapangan) {
            for (const item of il.items) {
                rows.push({
                    ...base,
                    kategori_pekerjaan: normalize(item.kategori_pekerjaan),
                    jenis_pekerjaan: normalize(item.jenis_pekerjaan),
                    satuan: normalize(item.satuan),
                    volume: item.volume ?? "",
                    harga_material: toNumber(item.harga_material),
                    harga_upah: toNumber(item.harga_upah),
                    total_material: toNumber(item.total_material),
                    total_upah: toNumber(item.total_upah),
                    total_harga: toNumber(item.total_harga),
                    status_il: normalize(il.status),
                    tanggal: toIsoDate(il.created_at)
                });
            }
        }
    }
    return rows;
};

const buildSerahTerimaRows = (projects: DashboardData[]): Array<Record<string, unknown>> => {
    const rows: Array<Record<string, unknown>> = [];
    for (const project of projects) {
        const approvedSpks = project.spk.filter((s) => isApprovedSpk(s.status));
        const spk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (s) => s.created_at);
        const base = buildIdentitasToko(project, spk);
        for (const st of project.berkas_serah_terima) {
            rows.push({
                ...base,
                tanggal_serah_terima: toIsoDate(st.created_at),
                link_dokumen: normalize(st.link_pdf)
            });
        }
    }
    return rows;
};

export const buildKtkOpnameFinalRows = (projects: DashboardData[]): Array<Record<string, unknown>> => {
    const rows: Array<Record<string, unknown>> = [];
    for (const project of projects) {
        const approvedSpks = project.spk.filter((s) => isApprovedSpk(s.status));
        const latestSpk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (s) => s.created_at);
        const base = buildIdentitasToko(project, latestSpk);
        const noPpn = isNoPpnArea(project);
        const finalOpnames = project.opname_final.filter(
            (o) => normalizeUpper(o.tipe_opname) === "OPNAME_FINAL"
        );
        for (const opname of finalOpnames) {
            const items = opname.items ?? [];
            const kerjaTambahRaw = sumBy(items, (item) => toNumber(item.total_selisih) > 0, (item) => item.total_selisih);
            const kerjaKurangRaw = sumBy(items, (item) => toNumber(item.total_selisih) < 0, (item) => item.total_selisih);
            const kerjaTambah = buildFinancialGrandTotal(kerjaTambahRaw, "up", noPpn);
            const kerjaKurang = Math.abs(buildFinancialGrandTotal(kerjaKurangRaw, "up", noPpn));
            const lateDays = Math.max(0, Number(opname.hari_denda ?? 0));
            const penalty = toNumber(opname.nilai_denda) || calculatePenalty(lateDays);
            const totalPenawaran = toNumber(opname.grand_total_rab);
            const grandTotalOpname = totalPenawaran + kerjaTambah - kerjaKurang;
            rows.push({
                ...base,
                status_opname_final: humanizeOpnameStatus(opname.status_opname_final),
                tanggal_opname_final: toIsoDate(opname.created_at),
                tanggal_serah_terima: toIsoDate(opname.tanggal_serah_terima_denda),
                keterlambatan: lateDays,
                denda: penalty,
                kerja_tambah: kerjaTambah,
                kerja_kurang: kerjaKurang,
                grand_total_opname: grandTotalOpname,
                nilai_toko: grandTotalOpname
            });
        }
    }
    return rows;
};

export const buildProjectPlanningRows = (
    input: DashboardProjectPlanningRow[] | DashboardData[]
): Array<Record<string, unknown>> => {
    const rawRows: DashboardProjectPlanningRow[] = (input.length > 0 && "toko" in input[0])
        ? (input as DashboardData[]).flatMap((p) => p.project_planning)
        : (input as DashboardProjectPlanningRow[]);

    const unifiedMap = new Map<string, Record<string, unknown>>();

    for (const pp of rawRows) {
        const rawUlok = String(pp.nomor_ulok ?? "").trim();
        const key = rawUlok ? rawUlok.toUpperCase() : `ID_${pp.id}`;

        const uses3D = Boolean(pp.butuh_desain_3d || pp.link_desain_3d || pp.waktu_send_3d);
        const statusDesain3D = uses3D ? "Pakai 3D" : "Tanpa 3D";
        const waktuSend3D = pp.waktu_send_3d ? formatIndonesianDate(pp.waktu_send_3d) : "";
        const linkDesain3D = normalize(pp.link_desain_3d);
        const awalSpk = pp.awal_spk ? formatIndonesianDate(pp.awal_spk) : "";
        const akhirSpk = pp.akhir_spk ? formatIndonesianDate(pp.akhir_spk) : "";
        const inputBbkTahap2 = pp.waktu_input_tahap_2 ? formatIndonesianDate(pp.waktu_input_tahap_2) : "";

        if (!unifiedMap.has(key)) {
            unifiedMap.set(key, {
                _id: pp.id,
                _created_time: toDate(pp.created_at)?.getTime() ?? 0,
                cabang: normalize(pp.cabang),
                nomor_ulok: normalize(pp.nomor_ulok),
                nama_toko: normalize(pp.nama_toko),
                kode_toko: normalize(pp.kode_toko),
                proyek: normalize(pp.proyek),
                lingkup_pekerjaan: normalize(pp.lingkup_pekerjaan),
                awal_spk: awalSpk,
                akhir_spk: akhirSpk,
                nama_pengaju: normalize(pp.nama_pengaju),
                nama_lokasi: normalize(pp.nama_lokasi),
                jenis_pengajuan: normalize(pp.jenis_pengajuan),
                status_desain_3d: statusDesain3D,
                link_desain_3d: linkDesain3D,
                estimasi_biaya: normalize(pp.estimasi_biaya),
                luas_bangunan: normalize(pp.luas_bangunan),
                luas_area_terbuka: normalize(pp.luas_area_terbuka),
                luas_area_terbangun: normalize(pp.luas_area_terbangun),
                luas_gudang: normalize(pp.luas_gudang),
                luas_area_parkir: normalize(pp.luas_area_parkir),
                luas_area_sales: normalize(pp.luas_area_sales),
                status: humanizePpStatus(pp.status),
                tanggal_pengajuan: formatIndonesianDate(pp.created_at),
                tanggal_persetujuan_bm: formatIndonesianDate(pp.bm_waktu_persetujuan),
                approver_bm: normalize(pp.bm_approver_email),
                revisi_bm_tahap_1: Number(pp.revisi_bm_tahap_1) || 0,
                tanggal_persetujuan_pp1: formatIndonesianDate(pp.pp1_waktu_persetujuan),
                approver_pp1: normalize(pp.pp1_approver_email),
                revisi_pp_tahap_1: Number(pp.revisi_pp_tahap_1) || 0,
                waktu_send_3d: waktuSend3D,
                input_branch_building_koordinator_tahap_2: inputBbkTahap2,
                tanggal_persetujuan_bm2: formatIndonesianDate(pp.bm2_waktu_persetujuan),
                approver_bm2: normalize(pp.bm2_approver_email),
                revisi_bm_tahap_2: Number(pp.revisi_bm_tahap_2) || 0,
                tanggal_persetujuan_bm_regional: formatIndonesianDate(pp.bm_regional_waktu_persetujuan),
                approver_bm_regional: normalize(pp.bm_regional_approver_email),
                revisi_bm_regional: Number(pp.revisi_bm_regional) || 0,
                tanggal_persetujuan_pp2: formatIndonesianDate(pp.pp2_waktu_persetujuan),
                approver_pp2: normalize(pp.pp2_approver_email),
                revisi_pp_tahap_2: Number(pp.revisi_pp_tahap_2) || 0,
                tanggal_persetujuan_pp_manager: formatIndonesianDate(pp.pp_manager_waktu_persetujuan),
                approver_pp_manager: normalize(pp.pp_manager_approver_email),
                revisi_pp_manager: Number(pp.revisi_pp_manager) || 0
            });
        } else {
            const existing = unifiedMap.get(key)!;

            // Gabungkan lingkup pekerjaan
            const existingScopes = String(existing.lingkup_pekerjaan || "")
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
            const newScopes = String(pp.lingkup_pekerjaan || "")
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
            const mergedScopes = Array.from(new Set([...existingScopes, ...newScopes]));
            if (mergedScopes.length > 0) {
                existing.lingkup_pekerjaan = mergedScopes.join(", ");
            }

            // Status 3D: jika salah satu pakai 3D, jadikan "Pakai 3D"
            if (uses3D) existing.status_desain_3d = "Pakai 3D";
            if (!existing.waktu_send_3d && waktuSend3D) existing.waktu_send_3d = waktuSend3D;
            if (!existing.link_desain_3d && linkDesain3D) existing.link_desain_3d = linkDesain3D;

            // SPK & Input Tahap 2: jika sebelumnya kosong, lengkapi
            if (!existing.awal_spk && awalSpk) existing.awal_spk = awalSpk;
            if (!existing.akhir_spk && akhirSpk) existing.akhir_spk = akhirSpk;
            if (!existing.input_branch_building_koordinator_tahap_2 && inputBbkTahap2) {
                existing.input_branch_building_koordinator_tahap_2 = inputBbkTahap2;
            }

            // Lengkapi field yang sebelumnya kosong
            if (!existing.nama_toko && pp.nama_toko) existing.nama_toko = normalize(pp.nama_toko);
            if ((!existing.kode_toko || existing.kode_toko === "Belum diisi") && pp.kode_toko && pp.kode_toko !== "Belum diisi") {
                existing.kode_toko = normalize(pp.kode_toko);
            }
            if (!existing.cabang && pp.cabang) existing.cabang = normalize(pp.cabang);
            if (!existing.proyek && pp.proyek) existing.proyek = normalize(pp.proyek);

            // Update status & persetujuan jika record ini lebih baru
            const rowTime = toDate(pp.created_at)?.getTime() ?? 0;
            if (rowTime > Number(existing._created_time)) {
                if (waktuSend3D) existing.waktu_send_3d = waktuSend3D;
                if (linkDesain3D) existing.link_desain_3d = linkDesain3D;
                if (awalSpk) existing.awal_spk = awalSpk;
                if (akhirSpk) existing.akhir_spk = akhirSpk;
                if (inputBbkTahap2) existing.input_branch_building_koordinator_tahap_2 = inputBbkTahap2;
                existing.status = humanizePpStatus(pp.status);
                existing.tanggal_persetujuan_bm = formatIndonesianDate(pp.bm_waktu_persetujuan);
                existing.approver_bm = normalize(pp.bm_approver_email);
                existing.tanggal_persetujuan_pp1 = formatIndonesianDate(pp.pp1_waktu_persetujuan);
                existing.approver_pp1 = normalize(pp.pp1_approver_email);
                existing.tanggal_persetujuan_bm2 = formatIndonesianDate(pp.bm2_waktu_persetujuan);
                existing.approver_bm2 = normalize(pp.bm2_approver_email);
                existing.tanggal_persetujuan_bm_regional = formatIndonesianDate(pp.bm_regional_waktu_persetujuan);
                existing.approver_bm_regional = normalize(pp.bm_regional_approver_email);
                existing.tanggal_persetujuan_pp2 = formatIndonesianDate(pp.pp2_waktu_persetujuan);
                existing.approver_pp2 = normalize(pp.pp2_approver_email);
                existing.tanggal_persetujuan_pp_manager = formatIndonesianDate(pp.pp_manager_waktu_persetujuan);
                existing.approver_pp_manager = normalize(pp.pp_manager_approver_email);
            }
        }
    }

    return Array.from(unifiedMap.values()).map(({ _id, _created_time, ...rest }) => rest);
};

const monthName = (date: Date): string => new Intl.DateTimeFormat("id-ID", {
    month: "long",
    timeZone: "Asia/Jakarta"
}).format(date);

const formatIndonesianDate = (value: unknown): string => {
    const date = toDate(value);
    if (!date) return "";
    const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" }).format(date);
    const month = monthName(date);
    const year = new Intl.DateTimeFormat("id-ID", { year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
    return `${day} ${month} ${year}`;
};

const formatFullLoginDate = (value: unknown): { tanggal_login_terakhir: string } => {
    return {
        tanggal_login_terakhir: formatIndonesianDate(value)
    };
};

const buildUserRows = (users: DashboardUserSourceRow[]): DashboardUserExportRow[] => users.map((user) => ({
    nama_user: normalize(user.nama_user),
    email_user: normalize(user.email_user),
    role: normalize(user.role),
    cabang: normalize(user.cabang),
    ...formatFullLoginDate(user.last_login_at)
}));

export const ktkOpnameFinalExportSection = (projects: DashboardData[]): DashboardExportSection => ({
    title: dataTypeLabels.KTK_OPNAME_FINAL,
    filenamePart: `jenis_data_${normalizeFilePart(dataTypeLabels.KTK_OPNAME_FINAL, "KTK_OPNAME_FINAL")}`,
    rows: buildKtkOpnameFinalRows(projects),
    columns: ktkOpnameFinalExportColumns
});

// ---------------------------------------------------------------------------
// Section builder — menggabungkan semua jenis data menjadi sections
// ---------------------------------------------------------------------------

const buildDashboardExportSections = (
    rows: DashboardExportRow[],
    dataTypes?: string,
    jobTypes?: string,
    projects?: DashboardData[],
    userRows?: DashboardUserSourceRow[],
    projectPlanningRows?: DashboardProjectPlanningRow[]
): DashboardExportSection[] => {
    const selectedDataTypes = [...parseCsvSet(dataTypes)];
    const selectedJobTypes = [...parseCsvSet(jobTypes)];
    const sections: DashboardExportSection[] = [];

    // Rows yang hanya muncul di sheet SPK dan Opname lama:
    // hanya lokasi yang sudah punya SPK (sudah berjalan).
    const rowsWithSpk = rows.filter((row) => Boolean(normalize(row.timestamp_spk)));

    const rowsByDataType: Record<string, DashboardExportRow[]> = {
        RAB: rows,
        SPK: rowsWithSpk,
        OPNAME: rowsWithSpk
    };

    selectedDataTypes.forEach((type) => {
        if (type === "USER") {
            sections.push({
                title: dataTypeLabels.USER,
                filenamePart: `jenis_data_${normalizeFilePart(dataTypeLabels.USER, "USER")}`,
                rows: buildUserRows(userRows ?? []),
                columns: userExportColumns
            });
            return;
        }

        // Jenis data lama yang masih menggunakan DashboardExportRow
        if (["RAB", "SPK", "OPNAME", "IDENTITAS"].includes(type)) {
            sections.push({
                title: dataTypeLabels[type] ?? type,
                filenamePart: `jenis_data_${normalizeFilePart(dataTypeLabels[type] ?? type, type)}`,
                rows: rowsByDataType[type] ?? rows,
                columns: resolveDataTypeColumns(type)
            });
            return;
        }

        if (type === "PROJECT_PLANNING") {
            const ppSource = projectPlanningRows ?? (projects ? buildProjectPlanningRows(projects) : []);
            const sectionRows = Array.isArray(ppSource) && ppSource.length > 0 && !("proyek" in ppSource[0]) && "toko" in ppSource[0]
                ? buildProjectPlanningRows(ppSource as DashboardData[])
                : (projectPlanningRows ? buildProjectPlanningRows(projectPlanningRows) : (projects ? buildProjectPlanningRows(projects) : []));
            sections.push({
                title: dataTypeLabels.PROJECT_PLANNING,
                filenamePart: `jenis_data_${normalizeFilePart(dataTypeLabels.PROJECT_PLANNING, "PROJECT_PLANNING")}`,
                rows: sectionRows,
                columns: projectPlanningExportColumns
            });
            return;
        }

        // Jenis data baru — build dari projects
        if (!projects) return;

        let sectionRows: Array<Record<string, unknown>> = [];
        let columns: DashboardExportColumn[] = [];

        if (type === "PENGAWASAN") {
            sectionRows = buildPengawasanRows(projects);
            columns = pengawasanExportColumns;
        } else if (type === "OPNAME_PARSIAL") {
            sectionRows = buildOpnameParsialRows(projects);
            columns = opnameParsialExportColumns;
        } else if (type === "INSTRUKSI_LAPANGAN") {
            sectionRows = buildInstruksiLapanganRows(projects);
            columns = instruksiLapanganExportColumns;
        } else if (type === "SERAH_TERIMA") {
            sectionRows = buildSerahTerimaRows(projects);
            columns = serahTerimaExportColumns;
        } else if (type === "KTK_OPNAME_FINAL") {
            sectionRows = buildKtkOpnameFinalRows(projects);
            columns = ktkOpnameFinalExportColumns;
        }

        if (columns.length > 0) {
            sections.push({
                title: dataTypeLabels[type] ?? type,
                filenamePart: `jenis_data_${normalizeFilePart(dataTypeLabels[type] ?? type, type)}`,
                rows: sectionRows,
                columns
            });
        }
    });

    selectedJobTypes.forEach((jobType) => {
        const jobRows = rows
            .filter((row) => rowMatchesJobType(row, jobType))
            .flatMap((row) => row._job_items ?? [])
            .filter((row) => jobItemMatchesJobType(row, jobType));
        sections.push({
            title: jobType,
            filenamePart: `pekerjaan_${normalizeFilePart(jobType, "ITEM")}`,
            rows: jobRows,
            columns: jobItemExportColumns
        });
    });

    if (sections.length === 0) {
        sections.push({
            title: "Dashboard Export",
            filenamePart: "dashboard_export",
            rows,
            columns: dashboardExportColumns
        });
    }

    return sections;
};

const htmlEscape = (value: unknown): string => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const filterDashboardExportAccess = (projects: DashboardData[], query: DashboardExportQueryInput): DashboardData[] => {
    const actorRole = normalizeUpper(query.actor_role);
    const actorCabang = normalizeUpper(query.actor_cabang);

    if (actorRole.includes("KONTRAKTOR")) {
        throw new AppError("Role kontraktor tidak diizinkan mengunduh export dashboard", 403);
    }

    const cabangFilter = normalizeUpper(query.cabang);
    const selectedCabangs = parseCsvSet(query.cabangs);
    const selectedJobTypes = parseCsvSet(query.job_types);
    const selectedTokoIds = parseSelectedTokoIds(query.toko_ids);

    // Safety: jika cabangs kosong dan actor bukan HEAD OFFICE,
    // isSameBranchScope (baris di bawah) sudah menjadi defense layer —
    // hanya project dalam branch group actor yang akan lolos.
    // FE seharusnya selalu mengirim cabangs=allowedBranches agar filter lebih ketat.
    const strictCabangs = selectedCabangs.size > 0
        ? selectedCabangs
        : null; // null = andalkan isSameBranchScope sebagai safety net

    return projects.filter((project) => {
        const projectCabang = normalizeUpper(project.toko.cabang);
        const projectWorkItems = collectProjectWorkItems(project);
        if (isHeadOfficeCabang(projectCabang)) return false;
        // Guard utama: project harus dalam branch scope actor (menggunakan injected cabang_array jika ada)
        if (query.cabang_array) {
            if (!query.cabang_array.includes(projectCabang)) return false;
        } else if (actorCabang !== "HEAD OFFICE" && !isSameBranchScope(projectCabang, actorCabang)) {
            return false;
        }
        if (cabangFilter && cabangFilter !== "ALL" && projectCabang !== cabangFilter) return false;
        // Jika FE mengirim cabangs, filter lebih ketat per cabang spesifik
        if (strictCabangs !== null && !strictCabangs.has(projectCabang)) return false;
        if (selectedJobTypes.size > 0 && ![...selectedJobTypes].some((item) => projectWorkItems.has(item))) return false;
        if (query.beanspot === "yes" || query.beanspot === "no") {
            const hasBeanspotJob = [...projectWorkItems].some((item) => item.includes("BEANSPOT"));
            if (query.beanspot === "yes" && !hasBeanspotJob) return false;
            if (query.beanspot === "no" && hasBeanspotJob) return false;
        }
        if (selectedTokoIds.size > 0 && !selectedTokoIds.has(Number(project.toko.id))) return false;
        if (query.spk_status === "with_spk" && !hasSpk(project)) return false;
        if (query.spk_status === "without_spk" && hasSpk(project)) return false;

        if (query.jenis_proyek === "reguler") {
            const isReguler = String(project.toko.proyek || "").toUpperCase() === "REGULER";
            if (!isReguler) return false;
        } else if (query.jenis_proyek === "renovasi") {
            const isRenovasi = String(project.toko.proyek || "").toUpperCase().includes("RENOVASI");
            if (!isRenovasi) return false;
        }

        if (!matchesPeriodFilter(project, query)) return false;
        return true;
    });
};

export const isKtkOpnameFinalOnlyExport = (dataTypes?: string, jobTypes?: string): boolean => {
    const selectedDataTypes = parseCsvSet(dataTypes);
    const selectedJobTypes = parseCsvSet(jobTypes);
    return selectedDataTypes.size === 1
        && selectedDataTypes.has("KTK_OPNAME_FINAL")
        && selectedJobTypes.size === 0;
};

export const buildDokumentasiIndex = (rows: Array<{
    nomor_ulok: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    tanggal_go: string | null;
    created_at: string | null;
}>) => {
    const index = new Map<string, { tanggal_go: string | null; created_at: string | null }>();
    const setLatest = (key: string, row: { tanggal_go: string | null; created_at: string | null }) => {
        if (!key.endsWith(":") && !key.includes(":|")) {
            const existing = index.get(key);
            const existingTime = toDate(existing?.created_at)?.getTime() ?? 0;
            const rowTime = toDate(row.created_at)?.getTime() ?? 0;
            if (!existing || rowTime >= existingTime) index.set(key, row);
        }
    };

    for (const row of rows) {
        setLatest(`kode:${normalizeUpper(row.kode_toko)}`, row);
        setLatest(`ulok:${normalizeUpper(row.nomor_ulok)}`, row);
        setLatest(`toko:${normalizeUpper(row.cabang)}|${normalizeUpper(row.nama_toko)}`, row);
    }

    return index;
};

export const buildDashboardExportRows = (
    projects: DashboardData[],
    dokumentasiByKey: Map<string, { tanggal_go: string | null; created_at: string | null }>
): DashboardExportRow[] => {
    return projects.map((project) => {
        const rab = latestByDate(project.rab, (item) => item.created_at);
        const approvedSpks = project.spk.filter((item) => isApprovedSpk(item.status));
        const spk = latestByDate(approvedSpks.length > 0 ? approvedSpks : project.spk, (item) => item.created_at);
        const latestExtension = spk ? latestByDate(
            spk.pertambahan_spk.filter((item) => isApprovedExtension(item.status_persetujuan)),
            (item) => item.created_at
        ) : null;
        const finalOpnames = project.opname_final.filter((item) => normalizeUpper(item.tipe_opname) === "OPNAME_FINAL");
        const opname = latestByDate(finalOpnames, (item) => item.created_at);
        const st = latestByDate(project.berkas_serah_terima, (item) => item.created_at);
        const items = opname?.items ?? [];

        const totalPenawaran = toNumber(rab?.grand_total_final ?? rab?.grand_total ?? 0);
        const noPpn = isNoPpnArea(project);
        const kerjaTambahRaw = sumBy(items, (item) => toNumber(item.total_selisih) > 0, (item) => item.total_selisih);
        const kerjaKurangRaw = sumBy(items, (item) => toNumber(item.total_selisih) < 0, (item) => item.total_selisih);
        const kerjaTambah = buildFinancialGrandTotal(kerjaTambahRaw, "up", noPpn);
        const kerjaKurang = Math.abs(buildFinancialGrandTotal(kerjaKurangRaw, "up", noPpn));
        const areaTerbuka = sumBy(items, isAreaTerbuka, (item) => item.total_harga_opname);
        const beanspot = sumBy(items, isBeanspot, (item) => item.total_harga_opname);
        const grandTotalOpname = opname ? totalPenawaran + kerjaTambah - kerjaKurang : 0;
        const spkEndDate = toDate(latestExtension?.tanggal_spk_akhir_setelah_perpanjangan) ?? toDate(spk?.waktu_selesai);
        const realSpk = Math.max(0, toNumber(spk?.durasi) + toNumber(latestExtension?.pertambahan_hari));
        const stDate = toDate(st?.created_at ?? opname?.tanggal_serah_terima_denda);
        const lateDaysFromDb = Number(opname?.hari_denda ?? NaN);
        const lateDays = Number.isFinite(lateDaysFromDb) && (opname?.tanggal_akhir_spk_denda || opname?.tanggal_serah_terima_denda)
            ? Math.max(0, lateDaysFromDb)
            : (spkEndDate && stDate ? countWeekdaysAfter(nextBusinessDayAfter(spkEndDate), stDate) : 0);
        const penalty = toNumber(opname?.nilai_denda) || calculatePenalty(lateDays);

        const rabAreaTerbuka = sumBy(rab?.items ?? [], isAreaTerbuka, (item: any) => item.total_harga);
        const luasBangunanNum = toNumber(rab?.luas_bangunan) || toNumber(rab?.luas_terbangun);
        const luasAreaTerbukaNum = toNumber(rab?.luas_area_terbuka);

        // Cost m2 di sheet SPK murni menggunakan data kontrak awal (SPK / RAB)
        const costM2Bangunan = luasBangunanNum > 0 ? (toNumber(spk?.grand_total) - rabAreaTerbuka) / luasBangunanNum : 0;
        const costM2Terbuka = luasAreaTerbukaNum > 0 ? rabAreaTerbuka / luasAreaTerbukaNum : 0;
        const luasTerbangunNum = toNumber(rab?.luas_terbangun);
        const grandTotalKtk = opname ? grandTotalOpname : toNumber(spk?.grand_total);
        const costM2Terbangun = luasTerbangunNum > 0 ? grandTotalKtk / luasTerbangunNum : 0;

        const row: DashboardExportRow = {
            timestamp: formatDateTime(rab?.created_at),
            cabang: normalize(project.toko.cabang),
            nomor_ulok: normalize(project.toko.nomor_ulok),
            status_rab: normalize(rab?.status),
            proyek: normalize(project.toko.proyek ?? spk?.proyek),
            lingkup_pekerjaan: normalize(project.toko.lingkup_pekerjaan ?? spk?.lingkup_pekerjaan),
            kontraktor: normalize(spk?.nama_kontraktor ?? rab?.nama_pt ?? project.toko.nama_kontraktor),
            nama_toko: normalize(project.toko.nama_toko),
            kode_toko: normalize(project.toko.kode_toko),
            luas_bangunan: normalize(rab?.luas_bangunan),
            luas_terbangunan: normalize(rab?.luas_terbangun),
            luas_area_terbuka: normalize(rab?.luas_area_terbuka),
            luas_area_parkir: normalize(rab?.luas_area_parkir),
            luas_area_sales: normalize(rab?.luas_area_sales),
            luas_gudang: normalize(rab?.luas_gudang),
            pekerjaan_area_terbuka: areaTerbuka,
            pekerjaan_beanspot: beanspot,
            total_penawaran_final: totalPenawaran,
            kategori: normalize(rab?.kategori_lokasi ?? project.pic_pengawasan?.kategori_lokasi),
            timestamp_acc_koordinator: formatDateTime(rab?.waktu_persetujuan_koordinator),
            timestamp_acc_manager: formatDateTime(rab?.waktu_persetujuan_manager),
            pic: normalize(project.pic_pengawasan?.plc_building_support),
            status_spk: humanizeSpkStatus(spk?.status),
            timestamp_spk: formatDateTime(spk?.created_at),
            durasi_spk: spk?.durasi ?? "",
            waktu_persetujuan_bm: formatDateTime(spk?.waktu_persetujuan),
            nominal_spk: toNumber(spk?.grand_total),
            cost_m2_bangunan: costM2Bangunan,
            cost_m2_terbuka: costM2Terbuka,
            cost_m2_terbangun: costM2Terbangun,
            awal_spk: toIsoDate(spk?.waktu_mulai),
            akhir_spk: toIsoDate(spk?.waktu_selesai),
            tambah_spk: normalize(latestExtension?.pertambahan_hari),
            akhir_spk_setelah: toIsoDate(latestExtension?.tanggal_spk_akhir_setelah_perpanjangan),
            real_spk: realSpk,
            tanggal_serah_terima: toIsoDate(st?.created_at ?? opname?.tanggal_serah_terima_denda),
            keterlambatan: lateDays,
            denda: penalty,
            tanggal_grand_opening: toIsoDate(findTanggalGo(project, dokumentasiByKey)),
            kerja_tambah: kerjaTambah,
            kerja_kurang: kerjaKurang,
            grand_total_opname_final: grandTotalOpname,
            tanggal_opname_final: toIsoDate(opname?.created_at),
            status_opname_final: normalize(opname?.status_opname_final),
            nilai_toko: grandTotalOpname,
            keterangan_toko: normalize(project.toko.proyek ?? spk?.proyek),
            _work_items: [...collectProjectWorkItems(project)],
            _job_items: collectProjectJobItems(project)
        };

        return row;
    });
};

const rowsToAoA = (rows: Array<Record<string, unknown>>, columns: DashboardExportColumn[]) => [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => displayValue(row[column.key])))
];

const applyWorksheetFormatting = (
    worksheet: XLSX.WorkSheet,
    rows: Array<Record<string, unknown>>,
    columns: DashboardExportColumn[]
) => {
    const colWidths = columns.map((column) => {
        const headerLen = column.label.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
        let maxDataLen = headerLen;
        for (const row of rows) {
            const val = String(row[column.key] || "");
            maxDataLen = Math.max(maxDataLen, val.length);
        }
        return { wch: Math.min(Math.max(maxDataLen + 2, 12), 40) };
    });
    worksheet["!cols"] = colWidths;

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
            const cell = worksheet[cellRef];
            if (!cell || cell.t !== "n") continue;

            const colKey = columns[C]?.key;
            if (colKey && (colKey.includes("nominal") || colKey.includes("penawaran") || colKey.includes("denda") || colKey.includes("kerja_") || colKey.includes("total_") || colKey.includes("nilai_") || colKey.includes("pekerjaan_"))) {
                cell.z = "#,##0";
            }
        }
    }
};

const appendDashboardWorksheet = (
    workbook: XLSX.WorkBook,
    sheetName: string,
    rows: Array<Record<string, unknown>>,
    columns: DashboardExportColumn[]
) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rowsToAoA(rows, columns));
    applyWorksheetFormatting(worksheet, rows, columns);
    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheetName, "Export"));
};

export const buildDashboardExcelBuffer = (rows: DashboardExportRow[], columns: DashboardExportColumn[]): Buffer => {
    const workbook = XLSX.utils.book_new();
    appendDashboardWorksheet(workbook, "Dashboard Export", rows as unknown as Array<Record<string, unknown>>, columns);
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

export const buildDashboardExcelMultiSheetBuffer = (sections: DashboardExportSection[]): Buffer => {
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    sections.forEach((section, index) => {
        const baseName = normalizeSheetName(section.title || `Sheet ${index + 1}`, "Export");
        let sheetName = baseName;
        let duplicate = 2;
        while (usedNames.has(sheetName)) {
            const suffix = ` ${duplicate}`;
            sheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
            duplicate += 1;
        }
        usedNames.add(sheetName);
        appendDashboardWorksheet(workbook, sheetName, section.rows, section.columns);
    });
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

export const buildDashboardCsvBuffer = (rows: Array<Record<string, unknown>>, columns: DashboardExportColumn[]): Buffer => {
    const worksheet = XLSX.utils.aoa_to_sheet(rowsToAoA(rows, columns));
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return Buffer.from(csv, "utf8");
};

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buffer: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const writeZipDateTime = (target: Buffer, offset: number) => {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    target.writeUInt16LE(dosTime, offset);
    target.writeUInt16LE(dosDate, offset + 2);
};

const buildZipBuffer = (files: Array<{ name: string; content: Buffer }>): Buffer => {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    files.forEach((file) => {
        const name = Buffer.from(file.name, "utf8");
        const crc = crc32(file.content);

        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        writeZipDateTime(local, 10);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(file.content.length, 18);
        local.writeUInt32LE(file.content.length, 22);
        local.writeUInt16LE(name.length, 26);
        name.copy(local, 30);
        localParts.push(local, file.content);

        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        writeZipDateTime(central, 12);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(file.content.length, 20);
        central.writeUInt32LE(file.content.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        name.copy(central, 46);
        centralParts.push(central);

        offset += local.length + file.content.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);

    return Buffer.concat([...localParts, ...centralParts, end]);
};

export const buildDashboardCsvZipBuffer = (sections: DashboardExportSection[]): Buffer => {
    const usedNames = new Set<string>();
    const files = sections.map((section, index) => {
        const base = normalizeFilePart(section.filenamePart, `SHEET_${index + 1}`).toLowerCase();
        let name = `${base}.csv`;
        let duplicate = 2;
        while (usedNames.has(name)) {
            name = `${base}_${duplicate}.csv`;
            duplicate += 1;
        }
        usedNames.add(name);
        return {
            name,
            content: buildDashboardCsvBuffer(section.rows, section.columns)
        };
    });
    return buildZipBuffer(files);
};

export const buildDashboardPdfBuffer = async (
    sections: Array<{ title: string; rows: Array<Record<string, unknown>>; columns: DashboardExportColumn[] }>,
    meta: { cabang: string; generatedBy: string }
): Promise<Buffer> => {
    const generatedAt = new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
    }).format(new Date());

    const renderSection = (section: { title: string; rows: Array<Record<string, unknown>>; columns: DashboardExportColumn[] }) => `
  <div class="section-header">
    <span class="section-icon">&#9632;</span> ${htmlEscape(section.title)}
    <span class="section-count">${section.rows.length} data</span>
  </div>
  <table class="data">
    <thead>
      <tr>
        <th style="width:24px;">No</th>
        ${section.columns.map((column) => `<th>${htmlEscape(column.label).replace(/\n/g, "<br/>")}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${section.rows.map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          ${section.columns.map((column) => `<td>${htmlEscape(displayValue(row[column.key]))}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  </table>`;

    const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
    const html = `
<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <style>
    ${""}
    @page { size: A2 landscape; margin: 15mm; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; font-size: 9px; margin: 0; line-height: 1.3; }
    .header { background: #d71920; color: #fff; padding: 12px 18px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .brand { font-size: 20px; font-weight: 900; letter-spacing: 1px; }
    .subtitle { font-size: 10px; opacity: .9; margin-top: 2px; }
    .title { text-align: right; font-size: 14px; font-weight: 800; text-transform: uppercase; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 9.5px; border-radius: 4px; overflow: hidden; }
    .meta td { border: 1px solid #e2e8f0; padding: 6px 10px; }
    .meta .label { width: 120px; background: #f8fafc; font-weight: bold; color: #475569; }
    .summary { display: flex; gap: 10px; margin: 10px 0 15px; }
    .summary-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; min-width: 140px; background: #f8fafc; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
    .summary-box .k { color: #64748b; font-size: 8px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
    .summary-box .v { font-size: 14px; font-weight: 800; margin-top: 4px; color: #0f172a; }
    .section-header { background: #1e3a5f; color: #fff; padding: 8px 12px; border-radius: 5px 5px 0 0; font-size: 11px; font-weight: 800; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
    .section-icon { color: #f97316; margin-right: 6px; }
    .section-count { font-size: 9px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 10px; }
    table.data th, table.data td { border: 1px solid #cbd5e1; padding: 6px 5px; vertical-align: top; overflow-wrap: break-word; word-break: break-all; }
    table.data th { background: #f1f5f9; color: #334155; font-weight: 800; text-align: center; border-bottom: 2px solid #94a3b8; }
    table.data tr:nth-child(even) td { background: #f8fafc; }
    table.data tr:hover td { background: #f1f5f9; }
    .num { text-align: right; white-space: nowrap; }
    .center { text-align: center; }
    .footer { margin-top: 15px; text-align: center; color: #94a3b8; font-size: 8px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SPARTA</div>
      <div class="subtitle">Building Dashboard Export</div>
    </div>
    <div class="title">Laporan Monitoring<br/>RAB, SPK, Opname, Pengawasan &amp; lainnya</div>
  </div>
  <table class="meta">
    <tr><td class="label">Cabang</td><td>${meta.cabang || "Semua Cabang"}</td><td class="label">Dibuat Oleh</td><td>${meta.generatedBy || "-"}</td></tr>
    <tr><td class="label">Tanggal Export</td><td>${generatedAt}</td><td class="label">Total Data</td><td>${totalRows}</td></tr>
  </table>
  <div class="summary">
    <div class="summary-box"><div class="k">Jumlah Jenis Data</div><div class="v">${sections.length}</div></div>
    <div class="summary-box"><div class="k">Total Baris</div><div class="v">${totalRows}</div></div>
  </div>
  ${sections.map(renderSection).join("")}
  <div class="footer">Dokumen ini di-generate otomatis oleh sistem SPARTA Building pada ${generatedAt}</div>
</body>
</html>`;

    return renderPdfFromHtml(html);
};

export const buildDashboardExportFile = async (
    format: DashboardExportQueryInput["format"],
    rows: DashboardExportRow[],
    meta: { cabang: string; generatedBy: string },
    dataTypes?: string,
    jobTypes?: string,
    projects?: DashboardData[],
    userRows?: DashboardUserSourceRow[],
    projectPlanningRows?: DashboardProjectPlanningRow[]
): Promise<{ buffer: Buffer; filename: string; contentType: string }> => {
    const columns = resolveDashboardExportColumns(dataTypes, jobTypes);
    const sections = buildDashboardExportSections(rows, dataTypes, jobTypes, projects, userRows, projectPlanningRows);
    const hasSegmentedSelection = parseCsvSet(dataTypes).size > 0 || parseCsvSet(jobTypes).size > 0;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cabang = normalizeUpper(meta.cabang || "ALL").replace(/[^A-Z0-9]+/g, "_") || "ALL";

    if (format === "csv") {
        return {
            buffer: buildDashboardCsvZipBuffer(sections),
            filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.zip`,
            contentType: "application/zip"
        };
    }

    if (format === "pdf") {
        // PDF selalu multi-section menggunakan semua sections yang dibangun
        const pdfSections = sections.length > 0 ? sections : [{
            title: "Dashboard Export",
            rows: rows as unknown as Array<Record<string, unknown>>,
            columns
        }];
        return {
            buffer: await buildDashboardPdfBuffer(pdfSections, meta),
            filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.pdf`,
            contentType: "application/pdf"
        };
    }

    return {
        buffer: hasSegmentedSelection ? buildDashboardExcelMultiSheetBuffer(sections) : buildDashboardExcelBuffer(rows, columns),
        filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
};

export const buildKtkOpnameFinalExportFile = async (
    format: DashboardExportQueryInput["format"],
    projects: DashboardData[],
    meta: { cabang: string; generatedBy: string }
): Promise<{ buffer: Buffer; filename: string; contentType: string }> => {
    const section = ktkOpnameFinalExportSection(projects);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cabang = normalizeUpper(meta.cabang || "ALL").replace(/[^A-Z0-9]+/g, "_") || "ALL";

    if (format === "csv") {
        return {
            buffer: buildDashboardCsvZipBuffer([section]),
            filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.zip`,
            contentType: "application/zip"
        };
    }

    if (format === "pdf") {
        return {
            buffer: await buildDashboardPdfBuffer([section], meta),
            filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.pdf`,
            contentType: "application/pdf"
        };
    }

    return {
        buffer: buildDashboardExcelMultiSheetBuffer([section]),
        filename: `SPARTA_DASHBOARD_EXPORT_${cabang}_${stamp}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
};
