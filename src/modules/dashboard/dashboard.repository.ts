import { pool } from "../../db/pool";
import { calculateEffectiveStDate, toIsoDateString } from "../../common/national-holidays";
import type { DashboardAllQueryInput, DashboardExportQueryInput, DashboardQueryInput } from "./dashboard.schema";

export type DashboardTokoRow = {
    id: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

export type DashboardUserExportRow = {
    id: number;
    nama_user: string | null;
    email_user: string;
    role: string | null;
    cabang: string | null;
    last_login_at: string | null;
};

export type DashboardRabRow = {
    id: number;
    id_toko: number;
    no_sph: number | null;
    status: string | null;
    proyek: string | null;  // ✅ ADD: Missing field
    lingkup_pekerjaan: string | null;  // ✅ ADD: Missing field
    nama_pt: string | null;
    link_pdf_gabungan: string | null;
    link_pdf_non_sbo: string | null;
    link_pdf_rekapitulasi: string | null;
    link_pdf_sph: string | null;
    logo: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    nama_persetujuan_koordinator: string | null;
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    nama_persetujuan_manager: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    alasan_penolakan: string | null;
    waktu_penolakan: string | null;
    ditolak_oleh: string | null;
    durasi_pekerjaan: string | null;
    kategori_lokasi: string | null;
    no_polis: string | null;
    berlaku_polis: string | null;
    file_asuransi: string | null;
    luas_bangunan: string | null;
    luas_terbangun: string | null;
    luas_area_terbuka: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    luas_gudang: string | null;
    grand_total: string | null;
    grand_total_non_sbo: string | null;
    grand_total_final: string | null;
    created_at: string | null;
    cost_terbuka?: string;
    cost_beanspot?: string;
    cost_bangunan?: string;
};

export type DashboardRabItemRow = {
    id: number;
    id_rab: number;
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    volume: string | null;
    harga_material: string | null;
    harga_upah: string | null;
    total_material: string | null;
    total_upah: string | null;
    total_harga: string | null;
    catatan: string | null;
};

export type DashboardGanttRow = {
    id: number;
    id_toko: number;
    status: string | null;
    email_pembuat: string | null;
    timestamp: string | null;
};

export type DashboardKategoriGanttRow = {
    id: number;
    id_gantt: number;
    kategori_pekerjaan: string | null;
};

export type DashboardDayGanttRow = {
    id: number;
    id_gantt: number;
    id_kategori_pekerjaan_gantt: number | null;
    h_awal: string | null;
    h_akhir: string | null;
    keterlambatan: string | null;
    kecepatan: string | null;
};

export type DashboardPengawasanGanttRow = {
    id: number;
    id_gantt: number;
    id_pic_pengawasan: number | null;
    tanggal_pengawasan: string | null;
};

export type DashboardPengawasanRow = {
    id: number;
    id_gantt: number;
    id_pengawasan_gantt: number | null;
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    catatan: string | null;
    dokumentasi: string | null;
    status: string | null;
    created_at: string | null;
};

export type DashboardDependencyGanttRow = {
    id: number;
    id_gantt: number;
    id_kategori: number | null;
    id_kategori_terikat: number | null;
};

export type DashboardBerkasPengawasanRow = {
    id: number;
    id_pengawasan_gantt: number;
    link_pdf_pengawasan: string | null;
    created_at: string | null;
};

export type DashboardPengawasanPdfPendingRow = {
    id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    h_day: number;
    tanggal_pengawasan: string | null;
    link_pdf_pengawasan: string;
    source_sheet: string;
    source_row: number;
    status: string;
    created_at: string | null;
};

export type DashboardSpkRow = {
    id: number;
    id_toko: number;
    nomor_ulok: string;
    email_pembuat: string;
    lingkup_pekerjaan: string;
    nama_kontraktor: string;
    proyek: string;
    waktu_mulai: string;
    durasi: number;
    waktu_selesai: string;
    grand_total: string | number;
    terbilang: string;
    nomor_spk: string;
    par: string | null;
    spk_manual_1: string | null;
    spk_manual_2: string | null;
    status: string;
    link_pdf: string | null;
    approver_email: string | null;
    approver_name?: string | null;
    waktu_persetujuan: string | null;
    alasan_penolakan: string | null;
    created_at: string | null;
};

export type DashboardSpkApprovalLogRow = {
    id: number;
    pengajuan_spk_id: number;
    approver_email: string;
    tindakan: string;
    alasan_penolakan: string | null;
    waktu_tindakan: string | null;
};

export type DashboardPertambahanSpkRow = {
    id: number;
    id_spk: number;
    pertambahan_hari: string;
    tanggal_spk_akhir: string;
    tanggal_spk_akhir_setelah_perpanjangan: string;
    target_st_setelah_perpanjangan?: string | null;
    alasan_perpanjangan: string;
    dibuat_oleh: string;
    status_persetujuan: string;
    disetujui_oleh: string | null;
    waktu_persetujuan: string | null;
    alasan_penolakan: string | null;
    link_pdf: string | null;
    link_lampiran_pendukung: string | null;
    created_at: string | null;
};

export type DashboardPicPengawasanRow = {
    id: number;
    id_toko: number;
    nomor_ulok: string;
    id_rab: number;
    id_spk: number;
    kategori_lokasi: string;
    durasi: string;
    tanggal_mulai_spk: string;
    plc_building_support: string;
    created_at: string | null;
};

export type DashboardInstruksiLapanganRow = {
    id: number;
    id_toko: number;
    status: string | null;
    link_pdf_gabungan: string | null;
    link_pdf_non_sbo: string | null;
    link_pdf_rekapitulasi: string | null;
    link_lampiran: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_koordinator: string | null;
    nama_persetujuan_koordinator?: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    nama_persetujuan_manager?: string | null;
    waktu_persetujuan_manager: string | null;
    pemberi_persetujuan_kontraktor: string | null;
    nama_persetujuan_kontraktor?: string | null;
    waktu_persetujuan_kontraktor: string | null;
    alasan_penolakan: string | null;
    grand_total: string | null;
    grand_total_non_sbo: string | null;
    grand_total_final: string | null;
    created_at: string | null;
};

export type DashboardInstruksiLapanganItemRow = {
    id: number;
    id_instruksi_lapangan: number;
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    volume: number | null;
    harga_material: number | null;
    harga_upah: number | null;
    total_material: number | null;
    total_upah: number | null;
    total_harga: number | null;
};

export type DashboardOpnameFinalRow = {
    id: number;
    id_toko: number;
    tipe_opname: string | null;
    aksi: string | null;
    status_opname_final: string | null;
    link_pdf_opname: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    pemberi_persetujuan_kontraktor: string | null;
    waktu_persetujuan_kontraktor: string | null;
    alasan_penolakan: string | null;
    catatan_opname_final: string | null;
    grand_total_opname: string | null;
    grand_total_opname_non_sbo: string | null;
    grand_total_rab: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    created_at: string | null;
    grand_total_final: string | null;
    cost_terbuka?: string;
    cost_beanspot?: string;
    cost_bangunan?: string;
};

export type DashboardOpnameItemRow = {
    id: number;
    id_toko: number;
    id_opname_final: number;
    id_rab_item: number;
    id_instruksi_lapangan_item?: number | null;
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    status: string | null;
    volume_akhir: number | null;
    selisih_volume: number | null;
    total_selisih: number | null;
    total_harga_opname: number | null;
    desain: string | null;
    kualitas: string | null;
    spesifikasi: string | null;
    foto: string | null;
    catatan: string | null;
    created_at: string | null;
};

export type DashboardBerkasSerahTerimaRow = {
    id: number;
    id_toko: number;
    link_pdf: string | null;
    created_at: string | null;
};

export type DashboardProjectPlanningRow = {
    id: number;
    id_toko: number | null;
    nomor_ulok: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    proyek: string | null;
    lingkup_pekerjaan: string | null;
    jenis_proyek: string | null;
    estimasi_biaya: string | null;
    nama_pengaju: string | null;
    nama_lokasi: string | null;
    jenis_pengajuan: string | null;
    jenis_pengajuan_lainnya?: string | null;
    status: string | null;
    luas_bangunan: string | null;
    luas_area_terbuka: string | null;
    luas_area_terbangun: string | null;
    luas_gudang: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    p_bangunan?: string | null;
    l_bangunan?: string | null;
    p_area_parkir?: string | null;
    l_area_parkir?: string | null;
    is_ruko?: boolean | null;
    jumlah_lantai?: number | null;
    beanspot_tipe?: string | null;
    is_head_to_head?: boolean | null;
    jarak_head_to_head?: string | null;
    is_seating_area?: boolean | null;
    is_dark_store?: boolean | null;
    akhir_masa_sewa?: string | null;
    spd?: string | null;
    keterangan?: string | null;
    link_pdf?: string | null;
    link_fpd?: string | null;
    link_gambar_kerja?: string | null;
    link_siteplan?: string | null;
    link_google_maps?: string | null;
    link_rab_sipil?: string | null;
    link_rab_me?: string | null;
    link_gambar_kerja_final_sipil?: string | null;
    link_gambar_kerja_final_me?: string | null;
    link_ba_tidak_sesuai_standar?: string | null;
    link_desain_3d?: string | null;
    link_gambar_kompetitor?: string | null;
    link_fpd_approved?: string | null;
    total_foto_dokumentasi?: number | null;
    butuh_desain_3d?: boolean | null;
    waktu_send_3d?: string | null;
    uploader_3d?: string | null;
    bm_approver_email: string | null;
    bm_approver_name?: string | null;
    bm_waktu_persetujuan: string | null;
    pp1_approver_email: string | null;
    pp1_approver_name?: string | null;
    pp1_waktu_persetujuan: string | null;
    bm2_approver_email: string | null;
    bm2_approver_name?: string | null;
    bm2_waktu_persetujuan: string | null;
    bm_regional_approver_email: string | null;
    bm_regional_approver_name?: string | null;
    bm_regional_waktu_persetujuan: string | null;
    pp2_approver_email: string | null;
    pp2_approver_name?: string | null;
    pp2_waktu_persetujuan: string | null;
    pp_manager_approver_email: string | null;
    pp_manager_approver_name?: string | null;
    pp_manager_waktu_persetujuan: string | null;
    created_at: string | null;
    revisi_bm_tahap_1: string | null;
    revisi_pp_tahap_1: string | null;
    revisi_bm_tahap_2: string | null;
    revisi_bm_regional: string | null;
    revisi_pp_tahap_2: string | null;
    revisi_pp_manager: string | null;
    waktu_input_tahap_2?: string | Date | null;
    awal_spk?: string | Date | null;
    akhir_spk?: string | Date | null;
};

export type DashboardDokumentasiBangunanItemRow = {
    id: number;
    id_dokumentasi_bangunan: number;
    link_foto: string | null;
    sudut_foto: string | null;
    item_index: number | null;
    created_at?: string | null;
};

export type DashboardDokumentasiBangunanRow = {
    id?: number;
    nomor_ulok: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    cabang: string | null;
    tanggal_go: string | null;
    tanggal_serah_terima?: string | null;
    tanggal_ambil_foto?: string | null;
    spk_awal?: string | null;
    spk_akhir?: string | null;
    kontraktor_sipil?: string | null;
    kontraktor_me?: string | null;
    link_pdf?: string | null;
    email_pengirim?: string | null;
    status_validasi?: string | null;
    alasan_revisi?: string | null;
    pic_dokumentasi?: string | null;
    jenis_toko?: string | null;
    jenis_dokumentasi?: string | null;
    created_at: string | null;
};

export type DashboardData = {
    toko: DashboardTokoRow;
    rab: Array<DashboardRabRow & { items: DashboardRabItemRow[] }>;
    gantt: Array<DashboardGanttRow & {
        kategori_pekerjaan: DashboardKategoriGanttRow[];
        day_items: DashboardDayGanttRow[];
        pengawasan_gantt: DashboardPengawasanGanttRow[];
        pengawasan: DashboardPengawasanRow[];
        dependencies: DashboardDependencyGanttRow[];
        berkas_pengawasan: DashboardBerkasPengawasanRow[];
    }>;
    spk: Array<DashboardSpkRow & {
        approval_logs: DashboardSpkApprovalLogRow[];
        pertambahan_spk: DashboardPertambahanSpkRow[];
    }>;
    pic_pengawasan: DashboardPicPengawasanRow | null;
    pengawasan_pdf_pending: DashboardPengawasanPdfPendingRow[];
    instruksi_lapangan: Array<DashboardInstruksiLapanganRow & { items: DashboardInstruksiLapanganItemRow[] }>;
    opname_final: Array<DashboardOpnameFinalRow & { items: DashboardOpnameItemRow[] }>;
    berkas_serah_terima: DashboardBerkasSerahTerimaRow[];
    project_planning: DashboardProjectPlanningRow[];
    dokumentasi_bangunan: Array<DashboardDokumentasiBangunanRow & { items: DashboardDokumentasiBangunanItemRow[] }>;
};

const toArrayParam = (values: number[]) => values.length > 0 ? values : [0];
const toStringArrayParam = (values: string[]) => values.length > 0 ? values : [''];

const pushMapArray = <T>(map: Map<number, T[]>, key: number | string, value: T) => {
    const numericKey = Number(key);
    const items = map.get(numericKey) ?? [];
    items.push(value);
    map.set(numericKey, items);
};

const normalizeDashboardUlok = (value: string | null | undefined) => String(value || "").trim().toUpperCase();
const normalizeDashboardScope = (value: string | null | undefined) => String(value || "").trim().toUpperCase();
const dashboardScopeKey = (nomorUlok: string | null | undefined, lingkup: string | null | undefined) =>
    `${normalizeDashboardUlok(nomorUlok)}\u0000${normalizeDashboardScope(lingkup)}`;

const parseNumberCsv = (value?: string): number[] => String(value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

const parseTextCsv = (value?: string): string[] => String(value ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

export const dashboardRepository = {
    async findTokoByQuery(query: DashboardQueryInput): Promise<DashboardTokoRow | null> {
        const filters: string[] = [];
        const values: Array<string | number | string[]> = [];

        if (query.id) {
            values.push(query.id);
            filters.push(`id = $${values.length}`);
        } else if (query.search) {
            values.push(`%${query.search}%`);
            const idx = values.length;
            filters.push(
                `(nomor_ulok ILIKE $${idx} OR nama_toko ILIKE $${idx} OR kode_toko ILIKE $${idx} OR cabang ILIKE $${idx} OR CAST(id AS TEXT) ILIKE $${idx})`
            );
        }

        if (filters.length === 0) {
            return null;
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const result = await pool.query<DashboardTokoRow>(
            `
            SELECT id, nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
            FROM toko
            ${whereClause}
            ORDER BY id DESC
            LIMIT 1
            `,
            values
        );

        return result.rows[0] ?? null;
    },

    async findDashboardByTokoId(tokoId: number): Promise<DashboardData> {
        const tokoResult = await pool.query<DashboardTokoRow>(
            `
            SELECT id, nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
            FROM toko
            WHERE id = $1
            LIMIT 1
            `,
            [tokoId]
        );

        const toko = tokoResult.rows[0];

        const rabResult = await pool.query<DashboardRabRow>(
            `
            SELECT r.id, r.id_toko, r.no_sph, r.status, t.proyek,
                   t.lingkup_pekerjaan, r.nama_pt, r.link_pdf_gabungan, r.link_pdf_non_sbo, r.link_pdf_rekapitulasi,
                   r.link_pdf_sph, r.logo, r.email_pembuat, r.pemberi_persetujuan_direktur, r.waktu_persetujuan_direktur,
                   r.pemberi_persetujuan_koordinator, r.waktu_persetujuan_koordinator, r.pemberi_persetujuan_manager,
                   r.waktu_persetujuan_manager, r.alasan_penolakan, r.waktu_penolakan, r.ditolak_oleh, r.durasi_pekerjaan,
                   r.kategori_lokasi, r.no_polis, r.berlaku_polis, r.file_asuransi, r.luas_bangunan, r.luas_terbangun,
                   r.luas_area_terbuka, r.luas_area_parkir, r.luas_area_sales, r.luas_gudang, r.grand_total,
                   r.grand_total_non_sbo, r.grand_total_final, r.created_at,
                       uc_koor.nama_lengkap AS nama_persetujuan_koordinator,
                       uc_mgr.nama_lengkap AS nama_persetujuan_manager, dcv.full_name AS nama_persetujuan_direktur
            FROM rab r
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_koor ON uc_koor.email_sat = r.pemberi_persetujuan_koordinator
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_mgr ON uc_mgr.email_sat = r.pemberi_persetujuan_manager
                LEFT JOIN (SELECT email, MAX(full_name) as full_name FROM dc_vendor_user GROUP BY email) dcv ON dcv.email = r.pemberi_persetujuan_direktur
            LEFT JOIN toko t ON t.id = r.id_toko
            WHERE r.id_toko = $1
            ORDER BY r.created_at DESC, r.id DESC
            `,
            [tokoId]
        );

        const ganttResult = await pool.query<DashboardGanttRow>(
            `
            SELECT id, id_toko, status, email_pembuat, timestamp
            FROM gantt_chart
            WHERE id_toko = $1
            ORDER BY id DESC
            `,
            [tokoId]
        );

        const ganttIds = ganttResult.rows.map((row) => row.id);
        const rabIds = rabResult.rows.map((row) => row.id);

        const [
            kategoriResult,
            dayResult,
            pengawasanGanttResult,
            pengawasanResult,
            dependencyResult
        ] = await Promise.all([
            pool.query<DashboardKategoriGanttRow>(
                `
                SELECT id, id_gantt, kategori_pekerjaan
                FROM kategori_pekerjaan_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardDayGanttRow>(
                `
                SELECT id, id_gantt, id_kategori_pekerjaan_gantt, h_awal, h_akhir, keterlambatan, kecepatan
                FROM day_gantt_chart
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardPengawasanGanttRow>(
                `
                SELECT id, id_gantt, id_pic_pengawasan, tanggal_pengawasan
                FROM pengawasan_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardPengawasanRow>(
                `
                SELECT id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan,
                       dokumentasi, status, created_at
                FROM pengawasan
                WHERE id_gantt = ANY($1::int[])
                ORDER BY created_at ASC, id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardDependencyGanttRow>(
                `
                SELECT id, id_gantt, id_kategori, id_kategori_terikat
                FROM dependency_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            )
        ]);

        const pengawasanGanttIds = pengawasanGanttResult.rows.map((row) => row.id);
        const berkasPengawasanResult = await pool.query<DashboardBerkasPengawasanRow>(
            `
            SELECT id, id_pengawasan_gantt, link_pdf_pengawasan, created_at
            FROM berkas_pengawasan
            WHERE id_pengawasan_gantt = ANY($1::int[])
            ORDER BY id ASC
            `,
            [toArrayParam(pengawasanGanttIds)]
        );

        const spkResult = await pool.query<DashboardSpkRow>(
            `
            SELECT p.id, p.id_toko, p.nomor_ulok, p.email_pembuat, p.lingkup_pekerjaan, p.nama_kontraktor, p.proyek,
                   p.waktu_mulai, p.durasi, p.waktu_selesai, p.grand_total, p.terbilang, p.nomor_spk, p.par,
                   p.spk_manual_1, p.spk_manual_2, p.status, p.link_pdf, p.approver_email, p.waktu_persetujuan,
                   p.alasan_penolakan, p.created_at, uc.nama_lengkap AS approver_name
            FROM pengajuan_spk p
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc ON uc.email_sat = p.approver_email
            WHERE p.id_toko = $1
               OR (
                   p.id_toko IS NULL
                   AND $2::text IS NOT NULL
                   AND p.nomor_ulok = $2::text
                   AND LOWER(COALESCE(p.lingkup_pekerjaan, '')) = LOWER(COALESCE($3::text, ''))
               )
            ORDER BY p.created_at DESC, p.id DESC
            `,
            [tokoId, toko?.nomor_ulok ?? null, toko?.lingkup_pekerjaan ?? null]
        );

        const spkIds = spkResult.rows.map((row) => row.id);

        const [spkLogResult, pertambahanResult] = await Promise.all([
            pool.query<DashboardSpkApprovalLogRow>(
                `
                SELECT id, pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, waktu_tindakan
                FROM spk_approval_log
                WHERE pengajuan_spk_id = ANY($1::int[])
                ORDER BY waktu_tindakan DESC, id DESC
                `,
                [toArrayParam(spkIds)]
            ),
            pool.query<DashboardPertambahanSpkRow>(
                `
                SELECT id, id_spk, pertambahan_hari, tanggal_spk_akhir, tanggal_spk_akhir_setelah_perpanjangan,
                       alasan_perpanjangan, dibuat_oleh, status_persetujuan, disetujui_oleh, waktu_persetujuan,
                       alasan_penolakan, link_pdf, link_lampiran_pendukung, created_at
                FROM pertambahan_spk
                WHERE id_spk = ANY($1::int[])
                ORDER BY created_at DESC, id DESC
                `,
                [toArrayParam(spkIds)]
            )
        ]);

        const picResult = await pool.query<DashboardPicPengawasanRow>(
            `
            SELECT id, id_toko, nomor_ulok, id_rab, id_spk, kategori_lokasi, durasi, tanggal_mulai_spk,
                   plc_building_support, created_at
            FROM pic_pengawasan
            WHERE id_toko = $1
            LIMIT 1
            `,
            [tokoId]
        );

        const instruksiResult = await pool.query<DashboardInstruksiLapanganRow>(
            `
            SELECT il.id, il.id_toko, il.status, il.link_pdf_gabungan, il.link_pdf_non_sbo, il.link_pdf_rekapitulasi, il.link_lampiran,
                   il.email_pembuat, il.pemberi_persetujuan_koordinator, il.waktu_persetujuan_koordinator,
                   il.pemberi_persetujuan_manager, il.waktu_persetujuan_manager, il.pemberi_persetujuan_kontraktor,
                   il.waktu_persetujuan_kontraktor, il.alasan_penolakan, il.grand_total, il.grand_total_non_sbo,
                   il.grand_total_final, il.created_at,
                       uc_koor.nama_lengkap AS nama_persetujuan_koordinator,
                       uc_mgr.nama_lengkap AS nama_persetujuan_manager, dcv.full_name AS nama_persetujuan_kontraktor
            FROM instruksi_lapangan il
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_koor ON uc_koor.email_sat = il.pemberi_persetujuan_koordinator
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_mgr ON uc_mgr.email_sat = il.pemberi_persetujuan_manager
                LEFT JOIN (SELECT email, MAX(full_name) as full_name FROM dc_vendor_user GROUP BY email) dcv ON dcv.email = il.pemberi_persetujuan_kontraktor
            WHERE il.id_toko = $1
            ORDER BY il.created_at DESC, il.id DESC
            `,
            [tokoId]
        );

        const instruksiIds = instruksiResult.rows.map((row) => row.id);
        const instruksiItemResult = await pool.query<DashboardInstruksiLapanganItemRow>(
            `
            SELECT id, id_instruksi_lapangan, kategori_pekerjaan, jenis_pekerjaan, satuan, volume,
                   harga_material, harga_upah, total_material, total_upah, total_harga
            FROM instruksi_lapangan_item
            WHERE id_instruksi_lapangan = ANY($1::int[])
            ORDER BY id ASC
            `,
            [toArrayParam(instruksiIds)]
        );

        const opnameFinalResult = await pool.query<DashboardOpnameFinalRow>(
            `
            SELECT id, id_toko, tipe_opname, aksi, status_opname_final, link_pdf_opname, email_pembuat,
                   pemberi_persetujuan_direktur, waktu_persetujuan_direktur, pemberi_persetujuan_koordinator,
                   waktu_persetujuan_koordinator, pemberi_persetujuan_manager, waktu_persetujuan_manager,
                   alasan_penolakan, grand_total_opname, grand_total_rab, hari_denda, nilai_denda,
                   tanggal_akhir_spk_denda, tanggal_serah_terima_denda, created_at, grand_total_final
            FROM opname_final
            WHERE id_toko = $1
            ORDER BY created_at DESC, id DESC
            `,
            [tokoId]
        );

        const opnameFinalIds = opnameFinalResult.rows.map((row) => row.id);
        const opnameItemResult = await pool.query<DashboardOpnameItemRow>(
            `
            SELECT oi.id, oi.id_toko, oi.id_opname_final, oi.id_rab_item,
                   ri.kategori_pekerjaan, ri.jenis_pekerjaan, ri.satuan,
                   oi.status, oi.volume_akhir, oi.selisih_volume, oi.total_selisih,
                   oi.total_harga_opname, oi.desain, oi.kualitas, oi.spesifikasi,
                   oi.foto, oi.catatan, oi.created_at
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            WHERE oi.id_opname_final = ANY($1::int[])
            ORDER BY oi.id ASC
            `,
            [toArrayParam(opnameFinalIds)]
        );

        const berkasSerahTerimaResult = await pool.query<DashboardBerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id_toko = $1
            ORDER BY created_at DESC, id DESC
            `,
            [tokoId]
        );

        const projectPlanningResult = await pool.query<DashboardProjectPlanningRow>(
            `
            SELECT pp.id, pp.id_toko, pp.nomor_ulok, pp.nama_toko, pp.kode_toko, pp.cabang, pp.proyek, pp.lingkup_pekerjaan,
                   pp.jenis_proyek, pp.estimasi_biaya, pp.nama_pengaju, pp.nama_lokasi, pp.jenis_pengajuan, pp.jenis_pengajuan_lainnya,
                   pp.status, pp.luas_bangunan, pp.luas_area_terbuka, pp.luas_area_terbangun, pp.luas_gudang,
                   pp.luas_area_parkir, pp.luas_area_sales, pp.p_bangunan, pp.l_bangunan, pp.p_area_parkir, pp.l_area_parkir,
                   pp.is_ruko, pp.jumlah_lantai, pp.beanspot_tipe, pp.is_head_to_head, pp.jarak_head_to_head,
                   pp.is_seating_area, pp.is_dark_store, pp.akhir_masa_sewa, pp.spd, pp.keterangan,
                   pp.link_pdf, pp.link_fpd, pp.link_gambar_kerja, pp.link_siteplan, pp.link_google_maps,
                   pp.link_rab_sipil, pp.link_rab_me,
                   pp.link_gambar_kerja_final_sipil, pp.link_gambar_kerja_final_me,
                   pp.link_ba_tidak_sesuai_standar, pp.link_desain_3d, pp.link_gambar_kompetitor,
                   pp.link_fpd_approved,
                   COALESCE(foto_count.total_foto, 0)::int AS total_foto_dokumentasi,
                   pp.bm_waktu_persetujuan, pp.bm_approver_email, u_bm.nama_lengkap AS bm_approver_name,
                   pp.pp1_waktu_persetujuan, pp.pp1_approver_email, u_pp1.nama_lengkap AS pp1_approver_name,
                   pp.bm2_waktu_persetujuan, pp.bm2_approver_email, u_bm2.nama_lengkap AS bm2_approver_name, 
                   pp.bm_regional_waktu_persetujuan, pp.bm_regional_approver_email, u_reg.nama_lengkap AS bm_regional_approver_name,
                   pp.pp2_waktu_persetujuan, pp.pp2_approver_email, u_pp2.nama_lengkap AS pp2_approver_name,
                   pp.pp_manager_waktu_persetujuan, pp.pp_manager_approver_email, u_ppm.nama_lengkap AS pp_manager_approver_name,
                   pp.created_at,
                   revisi_log.revisi_bm_tahap_1, revisi_log.revisi_pp_tahap_1, revisi_log.revisi_bm_tahap_2,
                   revisi_log.revisi_bm_regional, revisi_log.revisi_pp_tahap_2, revisi_log.revisi_pp_manager
            FROM projek_planning pp
            LEFT JOIN (
                SELECT id_projek_planning, COUNT(id) AS total_foto
                FROM projek_planning_foto_item
                GROUP BY id_projek_planning
            ) foto_count ON foto_count.id_projek_planning = pp.id
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm ON u_bm.email_sat = pp.bm_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp1 ON u_pp1.email_sat = pp.pp1_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm2 ON u_bm2.email_sat = pp.bm2_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_reg ON u_reg.email_sat = pp.bm_regional_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp2 ON u_pp2.email_sat = pp.pp2_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_ppm ON u_ppm.email_sat = pp.pp_manager_approver_email
            LEFT JOIN (
                SELECT 
                    projek_planning_id,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL' THEN 1 END) as revisi_bm_tahap_1,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_1' THEN 1 END) as revisi_pp_tahap_1,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL_2' THEN 1 END) as revisi_bm_tahap_2,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_REGIONAL_APPROVAL' THEN 1 END) as revisi_bm_regional,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_2' THEN 1 END) as revisi_pp_tahap_2,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_MANAGER_APPROVAL' THEN 1 END) as revisi_pp_manager
                FROM projek_planning_log
                WHERE aksi = 'REJECT'
                GROUP BY projek_planning_id
            ) revisi_log ON revisi_log.projek_planning_id = pp.id
            WHERE pp.id_toko = $1 OR UPPER(pp.nomor_ulok) = (SELECT UPPER(nomor_ulok) FROM toko WHERE id = $1)
            ORDER BY pp.created_at DESC, pp.id DESC
            `,
            [tokoId]
        );

        const rabSummaryResult = await pool.query<{ id_rab: number; cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>(
            `
            SELECT id_rab,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) = 'PEKERJAAN AREA TERBUKA' THEN total_harga ELSE 0 END) as cost_terbuka,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) = 'PEKERJAAN BEANSPOT' THEN total_harga ELSE 0 END) as cost_beanspot,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) NOT IN ('PEKERJAAN AREA TERBUKA', 'PEKERJAAN BEANSPOT') THEN total_harga ELSE 0 END) as cost_bangunan
            FROM rab_item
            WHERE id_rab = ANY($1::int[])
            GROUP BY id_rab
            `,
            [toArrayParam(rabIds)]
        );

        const opnameSummaryResult = await pool.query<{ id_opname_final: number; cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>(
            `
            SELECT oi.id_opname_final,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) = 'PEKERJAAN AREA TERBUKA' THEN oi.total_harga_opname ELSE 0 END) as cost_terbuka,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) = 'PEKERJAAN BEANSPOT' THEN oi.total_harga_opname ELSE 0 END) as cost_beanspot,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) NOT IN ('PEKERJAAN AREA TERBUKA', 'PEKERJAAN BEANSPOT') THEN oi.total_harga_opname ELSE 0 END) as cost_bangunan
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            WHERE oi.id_opname_final = ANY($1::int[])
            GROUP BY oi.id_opname_final
            `,
            [toArrayParam(opnameFinalIds)]
        );

        const pengawasanPdfPendingResult = await pool.query<DashboardPengawasanPdfPendingRow>(
            `
            SELECT id, nomor_ulok, lingkup_pekerjaan, h_day, tanggal_pengawasan,
                   link_pdf_pengawasan, source_sheet, source_row, status, created_at
            FROM pengawasan_pdf_migration_pending
            WHERE status = 'PENDING'
              AND UPPER(nomor_ulok) = UPPER($1)
            ORDER BY created_at DESC, id DESC
            `,
            [toko?.nomor_ulok ?? ""]
        );

        const dokumentasiResult = await pool.query<DashboardDokumentasiBangunanRow>(
            `
            SELECT id, nomor_ulok, nama_toko, kode_toko, cabang, tanggal_go,
                   tanggal_serah_terima, tanggal_ambil_foto, spk_awal, spk_akhir,
                   kontraktor_sipil, kontraktor_me, link_pdf, email_pengirim,
                   status_validasi, alasan_revisi, pic_dokumentasi, jenis_toko, jenis_dokumentasi, created_at
            FROM dokumentasi_bangunan
            WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM($1))
            ORDER BY created_at DESC, id DESC
            `,
            [toko?.nomor_ulok ?? ""]
        );

        const dokIds = dokumentasiResult.rows.map((r) => r.id).filter((id): id is number => typeof id === "number");
        const dokItemsResult = await pool.query<DashboardDokumentasiBangunanItemRow>(
            `
            SELECT id, id_dokumentasi_bangunan, link_foto, sudut_foto, item_index, created_at
            FROM dokumentasi_bangunan_item
            WHERE id_dokumentasi_bangunan = ANY($1::int[])
            ORDER BY item_index ASC NULLS LAST, id ASC
            `,
            [toArrayParam(dokIds)]
        );

        const dokItemsMap = new Map<number, DashboardDokumentasiBangunanItemRow[]>();
        for (const item of dokItemsResult.rows) {
            pushMapArray(dokItemsMap, item.id_dokumentasi_bangunan, item);
        }

        const dokumentasi_bangunan = dokumentasiResult.rows.map((row) => ({
            ...row,
            items: row.id ? (dokItemsMap.get(row.id) ?? []) : []
        }));

        const rabSummaryMap = new Map<number, { cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>();
        for (const row of rabSummaryResult.rows) {
            rabSummaryMap.set(row.id_rab, row);
        }

        const rab = rabResult.rows.map((row) => {
            const summary = rabSummaryMap.get(row.id);
            return {
                ...row,
                items: [],
                cost_terbuka: summary?.cost_terbuka ?? "0",
                cost_beanspot: summary?.cost_beanspot ?? "0",
                cost_bangunan: summary?.cost_bangunan ?? "0"
            };
        });

        const kategoriByGanttId = new Map<number, DashboardKategoriGanttRow[]>();
        for (const row of kategoriResult.rows) {
            const items = kategoriByGanttId.get(row.id_gantt) ?? [];
            items.push(row);
            kategoriByGanttId.set(row.id_gantt, items);
        }

        const dayByGanttId = new Map<number, DashboardDayGanttRow[]>();
        for (const row of dayResult.rows) {
            const items = dayByGanttId.get(row.id_gantt) ?? [];
            items.push(row);
            dayByGanttId.set(row.id_gantt, items);
        }

        const pengawasanGanttByGanttId = new Map<number, DashboardPengawasanGanttRow[]>();
        for (const row of pengawasanGanttResult.rows) {
            const items = pengawasanGanttByGanttId.get(row.id_gantt) ?? [];
            items.push(row);
            pengawasanGanttByGanttId.set(row.id_gantt, items);
        }

        const pengawasanByGanttId = new Map<number, DashboardPengawasanRow[]>();
        for (const row of pengawasanResult.rows) {
            const items = pengawasanByGanttId.get(row.id_gantt) ?? [];
            items.push(row);
            pengawasanByGanttId.set(row.id_gantt, items);
        }

        const dependencyByGanttId = new Map<number, DashboardDependencyGanttRow[]>();
        for (const row of dependencyResult.rows) {
            const items = dependencyByGanttId.get(row.id_gantt) ?? [];
            items.push(row);
            dependencyByGanttId.set(row.id_gantt, items);
        }

        const berkasByPengawasanGanttId = new Map<number, DashboardBerkasPengawasanRow[]>();
        for (const row of berkasPengawasanResult.rows) {
            const items = berkasByPengawasanGanttId.get(row.id_pengawasan_gantt) ?? [];
            items.push(row);
            berkasByPengawasanGanttId.set(row.id_pengawasan_gantt, items);
        }

        const gantt = ganttResult.rows.map((row) => ({
            ...row,
            kategori_pekerjaan: kategoriByGanttId.get(row.id) ?? [],
            day_items: dayByGanttId.get(row.id) ?? [],
            pengawasan_gantt: pengawasanGanttByGanttId.get(row.id) ?? [],
            pengawasan: pengawasanByGanttId.get(row.id) ?? [],
            dependencies: dependencyByGanttId.get(row.id) ?? [],
            berkas_pengawasan: (pengawasanGanttByGanttId.get(row.id) ?? [])
                .flatMap((item) => berkasByPengawasanGanttId.get(item.id) ?? [])
        }));

        const spkLogsBySpkId = new Map<number, DashboardSpkApprovalLogRow[]>();
        for (const row of spkLogResult.rows) {
            const items = spkLogsBySpkId.get(row.pengajuan_spk_id) ?? [];
            items.push(row);
            spkLogsBySpkId.set(row.pengajuan_spk_id, items);
        }

        const pertambahanBySpkId = new Map<number, DashboardPertambahanSpkRow[]>();
        for (const row of pertambahanResult.rows) {
            const mappedRow = {
                ...row,
                target_st_setelah_perpanjangan: row.tanggal_spk_akhir_setelah_perpanjangan ? toIsoDateString(calculateEffectiveStDate(new Date(row.tanggal_spk_akhir_setelah_perpanjangan)).effectiveStDate) : null
            };
            const items = pertambahanBySpkId.get(row.id_spk) ?? [];
            items.push(mappedRow);
            pertambahanBySpkId.set(row.id_spk, items);
        }

        const spk = spkResult.rows.map((row) => ({
            ...row,
            approval_logs: spkLogsBySpkId.get(row.id) ?? [],
            pertambahan_spk: pertambahanBySpkId.get(row.id) ?? []
        }));

        const instruksiItemsById = new Map<number, DashboardInstruksiLapanganItemRow[]>();
        for (const row of instruksiItemResult.rows) {
            const items = instruksiItemsById.get(row.id_instruksi_lapangan) ?? [];
            items.push(row);
            instruksiItemsById.set(row.id_instruksi_lapangan, items);
        }

        const instruksi_lapangan = instruksiResult.rows.map((row) => ({
            ...row,
            items: instruksiItemsById.get(row.id) ?? []
        }));

        const opnameItemsByFinalId = new Map<number, DashboardOpnameItemRow[]>();
        for (const row of opnameItemResult.rows) {
            const items = opnameItemsByFinalId.get(row.id_opname_final) ?? [];
            items.push(row);
            opnameItemsByFinalId.set(row.id_opname_final, items);
        }

        const opnameSummaryMap = new Map<number, { cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>();
        for (const row of opnameSummaryResult.rows) {
            opnameSummaryMap.set(row.id_opname_final, row);
        }

        const opname_final = opnameFinalResult.rows.map((row) => {
            const summary = opnameSummaryMap.get(row.id);
            return {
                ...row,
                items: opnameItemsByFinalId.get(row.id) ?? [],
                cost_terbuka: summary?.cost_terbuka ?? "0",
                cost_beanspot: summary?.cost_beanspot ?? "0",
                cost_bangunan: summary?.cost_bangunan ?? "0"
            };
        });

        return {
            toko,
            rab,
            gantt,
            spk,
            pic_pengawasan: picResult.rows[0] ?? null,
            pengawasan_pdf_pending: pengawasanPdfPendingResult.rows,
            instruksi_lapangan,
            opname_final,
            berkas_serah_terima: berkasSerahTerimaResult.rows,
            project_planning: projectPlanningResult.rows,
            dokumentasi_bangunan
        };
    },

    async findAllDashboard(query: DashboardAllQueryInput): Promise<DashboardData[]> {
        const filters: string[] = [];
        const values: Array<string | number | string[]> = [];

        if (query.search) {
            values.push(`%${query.search}%`);
            const idx = values.length;
            filters.push(
                `(nomor_ulok ILIKE $${idx} OR nama_toko ILIKE $${idx} OR kode_toko ILIKE $${idx} OR cabang ILIKE $${idx} OR CAST(id AS TEXT) ILIKE $${idx})`
            );
        }

        if (query.cabang_array && query.cabang_array.length > 0) {
            values.push(query.cabang_array.map((item) => item.toUpperCase()));
            const idx = values.length;
            filters.push(`UPPER(TRIM(cabang)) = ANY($${idx}::text[])`);
        } else if (!query._is_global_access && !query.cabang_array) {
            filters.push(`1 = 0`);
        }

        if (query.tipe_bangunan && query.tipe_bangunan !== "ALL") {
            if (query.tipe_bangunan === "NON_RUKO") {
                filters.push(`(
                    EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = toko.id AND (UPPER(r.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(r.kategori_lokasi) LIKE '%NON_RUKO%'))
                    OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = toko.id AND (UPPER(p.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(p.kategori_lokasi) LIKE '%NON_RUKO%'))
                )`);
            } else if (query.tipe_bangunan === "RUKO") {
                filters.push(`(
                    EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = toko.id AND UPPER(r.kategori_lokasi) LIKE '%RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON_RUKO%')
                    OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = toko.id AND UPPER(p.kategori_lokasi) LIKE '%RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON_RUKO%')
                )`);
            }
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const tokoResult = await pool.query<DashboardTokoRow>(
            `
            SELECT id, nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko, proyek, cabang, alamat, nama_kontraktor
            FROM toko
            ${whereClause}
            ORDER BY id DESC
            `,
            values
        );

        if (tokoResult.rows.length === 0) {
            return [];
        }

        const tokoIds = tokoResult.rows.map((row) => row.id);
        const tokoIdsByUlok = new Map<string, number[]>();
        const tokoIdsByScopeKey = new Map<string, number[]>();
        for (const row of tokoResult.rows) {
            const ulokKey = normalizeDashboardUlok(row.nomor_ulok);
            if (ulokKey) {
                const ids = tokoIdsByUlok.get(ulokKey) ?? [];
                ids.push(row.id);
                tokoIdsByUlok.set(ulokKey, ids);
            }

            const scopeKey = dashboardScopeKey(row.nomor_ulok, row.lingkup_pekerjaan);
            const scopedIds = tokoIdsByScopeKey.get(scopeKey) ?? [];
            scopedIds.push(row.id);
            tokoIdsByScopeKey.set(scopeKey, scopedIds);
        }

        // --- Batch 1: all queries depend only on tokoIds, run in parallel ---
        const ulokKeys = [...new Set(
            tokoResult.rows.map((row) => normalizeDashboardUlok(row.nomor_ulok)).filter(Boolean)
        )];
        const [
            rabResult,
            ganttResult,
            spkResult,
            picResult,
            instruksiResult,
            opnameFinalResult,
            berkasSerahTerimaResult,
            projectPlanningResult,
            pengawasanPdfPendingResult,
            dokumentasiBangunanResult
        ] = await Promise.all([
            pool.query<DashboardRabRow>(
                `
                SELECT r.id, r.id_toko, r.no_sph, r.status, t.proyek,
                       t.lingkup_pekerjaan, r.nama_pt, r.link_pdf_gabungan, r.link_pdf_non_sbo, r.link_pdf_rekapitulasi,
                       r.link_pdf_sph, r.logo, r.email_pembuat, r.pemberi_persetujuan_direktur, r.waktu_persetujuan_direktur,
                       r.pemberi_persetujuan_koordinator, r.waktu_persetujuan_koordinator, r.pemberi_persetujuan_manager,
                       r.waktu_persetujuan_manager, r.alasan_penolakan, r.waktu_penolakan, r.ditolak_oleh, r.durasi_pekerjaan,
                       r.kategori_lokasi, r.no_polis, r.berlaku_polis, r.file_asuransi, r.luas_bangunan, r.luas_terbangun,
                       r.luas_area_terbuka, r.luas_area_parkir, r.luas_area_sales, r.luas_gudang, r.grand_total,
                       r.grand_total_non_sbo, r.grand_total_final, r.created_at,
                       uc_koor.nama_lengkap AS nama_persetujuan_koordinator,
                       uc_mgr.nama_lengkap AS nama_persetujuan_manager, dcv.full_name AS nama_persetujuan_direktur
                FROM rab r
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_koor ON uc_koor.email_sat = r.pemberi_persetujuan_koordinator
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_mgr ON uc_mgr.email_sat = r.pemberi_persetujuan_manager
                LEFT JOIN (SELECT email, MAX(full_name) as full_name FROM dc_vendor_user GROUP BY email) dcv ON dcv.email = r.pemberi_persetujuan_direktur
                LEFT JOIN toko t ON t.id = r.id_toko
                WHERE r.id_toko = ANY($1::int[])
                ORDER BY r.created_at DESC, r.id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardGanttRow>(
                `
                SELECT id, id_toko, status, email_pembuat, timestamp
                FROM gantt_chart
                WHERE id_toko = ANY($1::int[])
                ORDER BY id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardSpkRow>(
                `
                SELECT p.id,
                       COALESCE(p.id_toko, t.id) AS id_toko,
                       p.nomor_ulok,
                       p.email_pembuat,
                       p.lingkup_pekerjaan,
                       p.nama_kontraktor,
                       p.proyek,
                       p.waktu_mulai,
                       p.durasi,
                       p.waktu_selesai,
                       p.grand_total,
                       p.terbilang,
                       p.nomor_spk,
                       p.par,
                       p.spk_manual_1,
                       p.spk_manual_2,
                       p.status,
                       p.link_pdf,
                       p.approver_email,
                       p.waktu_persetujuan,
                       p.alasan_penolakan,
                       p.created_at, uc.nama_lengkap AS approver_name
                FROM pengajuan_spk p
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc ON uc.email_sat = p.approver_email
                LEFT JOIN toko t
                  ON t.nomor_ulok = p.nomor_ulok
                 AND LOWER(COALESCE(t.lingkup_pekerjaan, '')) = LOWER(COALESCE(p.lingkup_pekerjaan, ''))
                WHERE COALESCE(p.id_toko, t.id) = ANY($1::int[])
                ORDER BY p.created_at DESC, p.id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardPicPengawasanRow>(
                `
                SELECT p.id,
                       COALESCE(p.id_toko, t.id) AS id_toko,
                       p.nomor_ulok,
                       p.id_rab,
                       p.id_spk,
                       p.kategori_lokasi,
                       p.durasi,
                       p.tanggal_mulai_spk,
                       p.plc_building_support,
                       p.created_at
                FROM pic_pengawasan p
                LEFT JOIN toko t ON t.nomor_ulok = p.nomor_ulok
                WHERE COALESCE(p.id_toko, t.id) = ANY($1::int[])
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardInstruksiLapanganRow>(
                `
                SELECT il.id, il.id_toko, il.status, il.link_pdf_gabungan, il.link_pdf_non_sbo, il.link_pdf_rekapitulasi, il.link_lampiran,
                       il.email_pembuat, il.pemberi_persetujuan_koordinator, il.waktu_persetujuan_koordinator,
                       il.pemberi_persetujuan_manager, il.waktu_persetujuan_manager, il.pemberi_persetujuan_kontraktor,
                       il.waktu_persetujuan_kontraktor, il.alasan_penolakan, il.grand_total, il.grand_total_non_sbo,
                       il.grand_total_final, il.created_at,
                       uc_koor.nama_lengkap AS nama_persetujuan_koordinator,
                       uc_mgr.nama_lengkap AS nama_persetujuan_manager, dcv.full_name AS nama_persetujuan_kontraktor
                FROM instruksi_lapangan il
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_koor ON uc_koor.email_sat = il.pemberi_persetujuan_koordinator
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc_mgr ON uc_mgr.email_sat = il.pemberi_persetujuan_manager
                LEFT JOIN (SELECT email, MAX(full_name) as full_name FROM dc_vendor_user GROUP BY email) dcv ON dcv.email = il.pemberi_persetujuan_kontraktor
                WHERE il.id_toko = ANY($1::int[])
                ORDER BY il.created_at DESC, il.id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardOpnameFinalRow>(
                `
                SELECT id, id_toko, tipe_opname, aksi, status_opname_final, link_pdf_opname, email_pembuat,
                       pemberi_persetujuan_direktur, waktu_persetujuan_direktur, pemberi_persetujuan_koordinator,
                       waktu_persetujuan_koordinator, pemberi_persetujuan_manager, waktu_persetujuan_manager,
                       alasan_penolakan, grand_total_opname, grand_total_rab, hari_denda, nilai_denda,
                       tanggal_akhir_spk_denda, tanggal_serah_terima_denda, created_at, grand_total_final
                FROM opname_final
                WHERE id_toko = ANY($1::int[])
                ORDER BY created_at DESC, id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardBerkasSerahTerimaRow>(
                `
                SELECT id, id_toko, link_pdf, created_at
                FROM berkas_serah_terima
                WHERE id_toko = ANY($1::int[])
                ORDER BY created_at DESC, id DESC
                `,
                [toArrayParam(tokoIds)]
            ),
            pool.query<DashboardProjectPlanningRow>(
                `
                SELECT pp.id, pp.id_toko, pp.nomor_ulok, pp.nama_toko, pp.kode_toko, pp.cabang, pp.proyek, pp.lingkup_pekerjaan,
                       pp.jenis_proyek, pp.estimasi_biaya, pp.nama_pengaju, pp.nama_lokasi, pp.jenis_pengajuan, pp.jenis_pengajuan_lainnya,
                       pp.status, pp.luas_bangunan, pp.luas_area_terbuka, pp.luas_area_terbangun, pp.luas_gudang,
                       pp.luas_area_parkir, pp.luas_area_sales, pp.p_bangunan, pp.l_bangunan, pp.p_area_parkir, pp.l_area_parkir,
                       pp.is_ruko, pp.jumlah_lantai, pp.beanspot_tipe, pp.is_head_to_head, pp.jarak_head_to_head,
                       pp.is_seating_area, pp.is_dark_store, pp.akhir_masa_sewa, pp.spd, pp.keterangan,
                       pp.link_pdf, pp.link_fpd, pp.link_gambar_kerja, pp.link_siteplan, pp.link_google_maps,
                       pp.link_rab_sipil, pp.link_rab_me,
                    pp.link_gambar_kerja_final_sipil, pp.link_gambar_kerja_final_me,
                    pp.link_ba_tidak_sesuai_standar, pp.link_desain_3d, pp.link_gambar_kompetitor,
                    pp.link_fpd_approved,
                    COALESCE(foto_count.total_foto, 0)::int AS total_foto_dokumentasi,
                       pp.bm_waktu_persetujuan, pp.bm_approver_email, u_bm.nama_lengkap AS bm_approver_name,
                       pp.pp1_waktu_persetujuan, pp.pp1_approver_email, u_pp1.nama_lengkap AS pp1_approver_name,
                       pp.bm2_waktu_persetujuan, pp.bm2_approver_email, u_bm2.nama_lengkap AS bm2_approver_name, 
                       pp.bm_regional_waktu_persetujuan, pp.bm_regional_approver_email, u_reg.nama_lengkap AS bm_regional_approver_name,
                       pp.pp2_waktu_persetujuan, pp.pp2_approver_email, u_pp2.nama_lengkap AS pp2_approver_name,
                       pp.pp_manager_waktu_persetujuan, pp.pp_manager_approver_email, u_ppm.nama_lengkap AS pp_manager_approver_name,
                       pp.created_at,
                       revisi_log.revisi_bm_tahap_1, revisi_log.revisi_pp_tahap_1, revisi_log.revisi_bm_tahap_2,
                       revisi_log.revisi_bm_regional, revisi_log.revisi_pp_tahap_2, revisi_log.revisi_pp_manager
                FROM projek_planning pp
                LEFT JOIN (
                    SELECT id_projek_planning, COUNT(id) AS total_foto
                    FROM projek_planning_foto_item
                    GROUP BY id_projek_planning
                ) foto_count ON foto_count.id_projek_planning = pp.id
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm ON u_bm.email_sat = pp.bm_approver_email
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp1 ON u_pp1.email_sat = pp.pp1_approver_email
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm2 ON u_bm2.email_sat = pp.bm2_approver_email
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_reg ON u_reg.email_sat = pp.bm_regional_approver_email
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp2 ON u_pp2.email_sat = pp.pp2_approver_email
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_ppm ON u_ppm.email_sat = pp.pp_manager_approver_email
                LEFT JOIN (
                    SELECT 
                        projek_planning_id,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL' THEN 1 END) as revisi_bm_tahap_1,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_1' THEN 1 END) as revisi_pp_tahap_1,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL_2' THEN 1 END) as revisi_bm_tahap_2,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_BM_REGIONAL_APPROVAL' THEN 1 END) as revisi_bm_regional,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_2' THEN 1 END) as revisi_pp_tahap_2,
                        COUNT(CASE WHEN status_sebelum = 'WAITING_PP_MANAGER_APPROVAL' THEN 1 END) as revisi_pp_manager
                    FROM projek_planning_log
                    WHERE aksi = 'REJECT'
                    GROUP BY projek_planning_id
                ) revisi_log ON revisi_log.projek_planning_id = pp.id
                WHERE pp.id_toko = ANY($1::int[]) OR UPPER(pp.nomor_ulok) = ANY($2::text[])
                ORDER BY pp.created_at DESC, pp.id DESC
                `,
                [toArrayParam(tokoIds), toStringArrayParam(ulokKeys)]
            ),
            pool.query<DashboardPengawasanPdfPendingRow>(
                `
                SELECT id, nomor_ulok, lingkup_pekerjaan, h_day, tanggal_pengawasan,
                       link_pdf_pengawasan, source_sheet, source_row, status, created_at
                FROM pengawasan_pdf_migration_pending
                WHERE status = 'PENDING'
                  AND UPPER(nomor_ulok) = ANY($1::text[])
                ORDER BY created_at DESC, id DESC
                `,
                [ulokKeys]
            ),
            pool.query<DashboardDokumentasiBangunanRow>(
                `
                SELECT id, nomor_ulok, nama_toko, kode_toko, cabang, tanggal_go,
                       tanggal_serah_terima, tanggal_ambil_foto, spk_awal, spk_akhir,
                       kontraktor_sipil, kontraktor_me, link_pdf, email_pengirim,
                       status_validasi, alasan_revisi, pic_dokumentasi, jenis_toko, jenis_dokumentasi, created_at
                FROM dokumentasi_bangunan
                WHERE UPPER(TRIM(nomor_ulok)) = ANY($1::text[])
                ORDER BY created_at DESC, id DESC
                `,
                [toStringArrayParam(ulokKeys)]
            )
        ]);

        const rabIds = rabResult.rows.map((row) => row.id);
        const ganttIds = ganttResult.rows.map((row) => row.id);
        const dokIds = dokumentasiBangunanResult.rows.map((row) => row.id).filter((id): id is number => typeof id === "number");

        // --- Batch 2: queries depending on ganttIds + rabIds + dokIds, run in parallel ---
        const [
            kategoriResult,
            dayResult,
            pengawasanGanttResult,
            pengawasanResult,
            dependencyResult,
            spkLogResult,
            pertambahanResult,
            dokItemsResult
        ] = await Promise.all([
            pool.query<DashboardKategoriGanttRow>(
                `
                SELECT id, id_gantt, kategori_pekerjaan
                FROM kategori_pekerjaan_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardDayGanttRow>(
                `
                SELECT id, id_gantt, id_kategori_pekerjaan_gantt, h_awal, h_akhir, keterlambatan, kecepatan
                FROM day_gantt_chart
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardPengawasanGanttRow>(
                `
                SELECT id, id_gantt, id_pic_pengawasan, tanggal_pengawasan
                FROM pengawasan_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardPengawasanRow>(
                `
                SELECT id, id_gantt, id_pengawasan_gantt, kategori_pekerjaan, jenis_pekerjaan, catatan,
                       dokumentasi, status, created_at
                FROM pengawasan
                WHERE id_gantt = ANY($1::int[])
                ORDER BY created_at ASC, id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardDependencyGanttRow>(
                `
                SELECT id, id_gantt, id_kategori, id_kategori_terikat
                FROM dependency_gantt
                WHERE id_gantt = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(ganttIds)]
            ),
            pool.query<DashboardSpkApprovalLogRow>(
                `
                SELECT id, pengajuan_spk_id, approver_email, tindakan, alasan_penolakan, waktu_tindakan
                FROM spk_approval_log
                WHERE pengajuan_spk_id = ANY($1::int[])
                ORDER BY waktu_tindakan DESC, id DESC
                `,
                [toArrayParam(spkResult.rows.map((r) => r.id))]
            ),
            pool.query<DashboardPertambahanSpkRow>(
                `
                SELECT id, id_spk, pertambahan_hari, tanggal_spk_akhir, tanggal_spk_akhir_setelah_perpanjangan,
                       alasan_perpanjangan, dibuat_oleh, status_persetujuan, disetujui_oleh, waktu_persetujuan,
                       alasan_penolakan, link_pdf, link_lampiran_pendukung, created_at
                FROM pertambahan_spk
                WHERE id_spk = ANY($1::int[])
                ORDER BY created_at DESC, id DESC
                `,
                [toArrayParam(spkResult.rows.map((r) => r.id))]
            ),
            pool.query<DashboardDokumentasiBangunanItemRow>(
                `
                SELECT id, id_dokumentasi_bangunan, link_foto, sudut_foto, item_index, created_at
                FROM dokumentasi_bangunan_item
                WHERE id_dokumentasi_bangunan = ANY($1::int[])
                ORDER BY item_index ASC NULLS LAST, id ASC
                `,
                [toArrayParam(dokIds)]
            )
        ]);

        const rabSummaryResult = await pool.query<{ id_rab: number; cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>(
            `
            SELECT id_rab,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) = 'PEKERJAAN AREA TERBUKA' THEN total_harga ELSE 0 END) as cost_terbuka,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) = 'PEKERJAAN BEANSPOT' THEN total_harga ELSE 0 END) as cost_beanspot,
                   SUM(CASE WHEN UPPER(kategori_pekerjaan) NOT IN ('PEKERJAAN AREA TERBUKA', 'PEKERJAAN BEANSPOT') THEN total_harga ELSE 0 END) as cost_bangunan
            FROM rab_item
            WHERE id_rab = ANY($1::int[])
            GROUP BY id_rab
            `,
            [toArrayParam(rabIds)]
        );

        const opnameSummaryResult = await pool.query<{ id_opname_final: number; cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>(
            `
            SELECT oi.id_opname_final,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) = 'PEKERJAAN AREA TERBUKA' THEN oi.total_harga_opname ELSE 0 END) as cost_terbuka,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) = 'PEKERJAAN BEANSPOT' THEN oi.total_harga_opname ELSE 0 END) as cost_beanspot,
                   SUM(CASE WHEN UPPER(ri.kategori_pekerjaan) NOT IN ('PEKERJAAN AREA TERBUKA', 'PEKERJAAN BEANSPOT') THEN oi.total_harga_opname ELSE 0 END) as cost_bangunan
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            WHERE oi.id_opname_final = ANY($1::int[])
            GROUP BY oi.id_opname_final
            `,
            [toArrayParam(opnameFinalResult.rows.map(r => r.id))]
        );

        // --- Batch 3: berkas_pengawasan depends on pengawasanGanttIds from batch 2 ---
        const pengawasanGanttIds = pengawasanGanttResult.rows.map((row) => row.id);
        const berkasPengawasanResult = await pool.query<DashboardBerkasPengawasanRow>(
            `
            SELECT id, id_pengawasan_gantt, link_pdf_pengawasan, created_at
            FROM berkas_pengawasan
            WHERE id_pengawasan_gantt = ANY($1::int[])
            ORDER BY id ASC
            `,
            [toArrayParam(pengawasanGanttIds)]
        );

        const spkIds = spkResult.rows.map((row) => row.id);

        const rabSummaryMap = new Map<number, { cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>();
        for (const row of rabSummaryResult.rows) {
            rabSummaryMap.set(Number(row.id_rab), row);
        }

        const opnameSummaryMap = new Map<number, { cost_terbuka: string; cost_beanspot: string; cost_bangunan: string }>();
        for (const row of opnameSummaryResult.rows) {
            opnameSummaryMap.set(Number(row.id_opname_final), row);
        }

        const rabByTokoId = new Map<number, Array<DashboardRabRow & { items: DashboardRabItemRow[] }>>();
        for (const row of rabResult.rows) {
            const summary = rabSummaryMap.get(row.id);
            pushMapArray(rabByTokoId, row.id_toko, {
                ...row,
                items: [],
                cost_terbuka: summary?.cost_terbuka ?? '0',
                cost_beanspot: summary?.cost_beanspot ?? '0',
                cost_bangunan: summary?.cost_bangunan ?? '0'
            });
        }

        const kategoriByGanttId = new Map<number, DashboardKategoriGanttRow[]>();
        for (const row of kategoriResult.rows) {
            pushMapArray(kategoriByGanttId, row.id_gantt, row);
        }

        const dayByGanttId = new Map<number, DashboardDayGanttRow[]>();
        for (const row of dayResult.rows) {
            pushMapArray(dayByGanttId, row.id_gantt, row);
        }

        const pengawasanGanttByGanttId = new Map<number, DashboardPengawasanGanttRow[]>();
        for (const row of pengawasanGanttResult.rows) {
            pushMapArray(pengawasanGanttByGanttId, row.id_gantt, row);
        }

        const pengawasanByGanttId = new Map<number, DashboardPengawasanRow[]>();
        for (const row of pengawasanResult.rows) {
            pushMapArray(pengawasanByGanttId, row.id_gantt, row);
        }

        const dependencyByGanttId = new Map<number, DashboardDependencyGanttRow[]>();
        for (const row of dependencyResult.rows) {
            pushMapArray(dependencyByGanttId, row.id_gantt, row);
        }

        const berkasByPengawasanGanttId = new Map<number, DashboardBerkasPengawasanRow[]>();
        for (const row of berkasPengawasanResult.rows) {
            pushMapArray(berkasByPengawasanGanttId, row.id_pengawasan_gantt, row);
        }

        const ganttByTokoId = new Map<number, Array<DashboardGanttRow & {
            kategori_pekerjaan: DashboardKategoriGanttRow[];
            day_items: DashboardDayGanttRow[];
            pengawasan_gantt: DashboardPengawasanGanttRow[];
            pengawasan: DashboardPengawasanRow[];
            dependencies: DashboardDependencyGanttRow[];
            berkas_pengawasan: DashboardBerkasPengawasanRow[];
        }>>();

        for (const row of ganttResult.rows) {
            const pengawasanGantt = pengawasanGanttByGanttId.get(row.id) ?? [];
            const berkasPengawasan = pengawasanGantt.flatMap((item) => berkasByPengawasanGanttId.get(item.id) ?? []);
            const mapped = {
                ...row,
                kategori_pekerjaan: kategoriByGanttId.get(row.id) ?? [],
                day_items: dayByGanttId.get(row.id) ?? [],
                pengawasan_gantt: pengawasanGantt,
                pengawasan: pengawasanByGanttId.get(row.id) ?? [],
                dependencies: dependencyByGanttId.get(row.id) ?? [],
                berkas_pengawasan: berkasPengawasan
            };
            pushMapArray(ganttByTokoId, row.id_toko, mapped);
        }

        const spkLogsBySpkId = new Map<number, DashboardSpkApprovalLogRow[]>();
        for (const row of spkLogResult.rows) {
            pushMapArray(spkLogsBySpkId, row.pengajuan_spk_id, row);
        }

        const pertambahanBySpkId = new Map<number, DashboardPertambahanSpkRow[]>();
        for (const row of pertambahanResult.rows) {
            const mappedRow = {
                ...row,
                target_st_setelah_perpanjangan: row.tanggal_spk_akhir_setelah_perpanjangan ? toIsoDateString(calculateEffectiveStDate(new Date(row.tanggal_spk_akhir_setelah_perpanjangan)).effectiveStDate) : null
            };
            pushMapArray(pertambahanBySpkId, row.id_spk, mappedRow);
        }

        const spkByTokoId = new Map<number, Array<DashboardSpkRow & {
            approval_logs: DashboardSpkApprovalLogRow[];
            pertambahan_spk: DashboardPertambahanSpkRow[];
        }>>();

        for (const row of spkResult.rows) {
            const mapped = {
                ...row,
                approval_logs: spkLogsBySpkId.get(row.id) ?? [],
                pertambahan_spk: pertambahanBySpkId.get(row.id) ?? []
            };
            const explicitTokoId = Number(row.id_toko);
            const targetTokoIds = tokoIds.includes(explicitTokoId)
                ? [explicitTokoId]
                : (tokoIdsByScopeKey.get(dashboardScopeKey(row.nomor_ulok, row.lingkup_pekerjaan)) ?? []);
            for (const targetTokoId of targetTokoIds) {
                pushMapArray(spkByTokoId, targetTokoId, mapped);
            }
        }

        const picByTokoId = new Map<number, DashboardPicPengawasanRow>();
        for (const row of picResult.rows) {
            if (!picByTokoId.has(row.id_toko)) {
                picByTokoId.set(row.id_toko, row);
            }
        }

        const instruksiByTokoId = new Map<number, Array<DashboardInstruksiLapanganRow & { items: DashboardInstruksiLapanganItemRow[] }>>();
        for (const row of instruksiResult.rows) {
            const mapped = {
                ...row,
                items: []
            };
            pushMapArray(instruksiByTokoId, row.id_toko, mapped);
        }

        const opnameFinalByTokoId = new Map<number, Array<DashboardOpnameFinalRow & { items: DashboardOpnameItemRow[] }>>();
        for (const row of opnameFinalResult.rows) {
            const summary = opnameSummaryMap.get(row.id);
            const mapped = {
                ...row,
                items: [],
                cost_terbuka: summary?.cost_terbuka ?? '0',
                cost_beanspot: summary?.cost_beanspot ?? '0',
                cost_bangunan: summary?.cost_bangunan ?? '0'
            };
            pushMapArray(opnameFinalByTokoId, row.id_toko, mapped);
        }

        const berkasSerahByTokoId = new Map<number, DashboardBerkasSerahTerimaRow[]>();
        for (const row of berkasSerahTerimaResult.rows) {
            pushMapArray(berkasSerahByTokoId, row.id_toko, row);
        }

        const ppByTokoId = new Map<number, DashboardProjectPlanningRow[]>();
        const ppByUlok = new Map<string, DashboardProjectPlanningRow[]>();
        for (const row of projectPlanningResult.rows) {
            if (row.id_toko && row.id_toko !== 0) pushMapArray(ppByTokoId, row.id_toko, row);
            const key = normalizeDashboardUlok(row.nomor_ulok);
            if (key) {
                const items = ppByUlok.get(key) ?? [];
                items.push(row);
                ppByUlok.set(key, items);
            }
        }

        const pendingPdfByUlok = new Map<string, DashboardPengawasanPdfPendingRow[]>();
        for (const row of pengawasanPdfPendingResult.rows) {
            const key = normalizeDashboardUlok(row.nomor_ulok);
            const items = pendingPdfByUlok.get(key) ?? [];
            items.push(row);
            pendingPdfByUlok.set(key, items);
        }

        const dokItemsMap = new Map<number, DashboardDokumentasiBangunanItemRow[]>();
        for (const row of dokItemsResult.rows) {
            pushMapArray(dokItemsMap, row.id_dokumentasi_bangunan, row);
        }

        const dokByUlok = new Map<string, Array<DashboardDokumentasiBangunanRow & { items: DashboardDokumentasiBangunanItemRow[] }>>();
        for (const row of dokumentasiBangunanResult.rows) {
            const key = normalizeDashboardUlok(row.nomor_ulok);
            if (key) {
                const items = dokByUlok.get(key) ?? [];
                items.push({
                    ...row,
                    items: row.id ? (dokItemsMap.get(row.id) ?? []) : []
                });
                dokByUlok.set(key, items);
            }
        }

        return tokoResult.rows.map((toko) => ({
            toko,
            rab: rabByTokoId.get(toko.id) ?? [],
            gantt: ganttByTokoId.get(toko.id) ?? [],
            spk: spkByTokoId.get(toko.id) ?? [],
            pic_pengawasan: picByTokoId.get(toko.id) ?? null,
            pengawasan_pdf_pending: pendingPdfByUlok.get(normalizeDashboardUlok(toko.nomor_ulok)) ?? [],
            instruksi_lapangan: instruksiByTokoId.get(toko.id) ?? [],
            opname_final: opnameFinalByTokoId.get(toko.id) ?? [],
            berkas_serah_terima: berkasSerahByTokoId.get(toko.id) ?? [],
            project_planning: [...(ppByTokoId.get(toko.id) ?? []), ...(ppByUlok.get(normalizeDashboardUlok(toko.nomor_ulok)) ?? [])].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i),
            dokumentasi_bangunan: dokByUlok.get(normalizeDashboardUlok(toko.nomor_ulok)) ?? []
        }));

    },

    async hydrateDashboardExportItems(projects: DashboardData[]): Promise<DashboardData[]> {
        const rabIds = projects.flatMap((project) => project.rab.map((row) => row.id));
        const instruksiIds = projects.flatMap((project) => project.instruksi_lapangan.map((row) => row.id));
        const opnameFinalIds = projects.flatMap((project) => project.opname_final.map((row) => row.id));

        const [rabItemResult, instruksiItemResult, opnameItemResult] = await Promise.all([
            pool.query<DashboardRabItemRow>(
                `
                SELECT id, id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan, volume,
                       harga_material, harga_upah, total_material, total_upah, total_harga, catatan
                FROM rab_item
                WHERE id_rab = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(rabIds)]
            ),
            pool.query<DashboardInstruksiLapanganItemRow>(
                `
                SELECT id, id_instruksi_lapangan, kategori_pekerjaan, jenis_pekerjaan, satuan, volume,
                       harga_material, harga_upah, total_material, total_upah, total_harga
                FROM instruksi_lapangan_item
                WHERE id_instruksi_lapangan = ANY($1::int[])
                ORDER BY id ASC
                `,
                [toArrayParam(instruksiIds)]
            ),
            pool.query<DashboardOpnameItemRow>(
                `
                SELECT oi.id, oi.id_toko, oi.id_opname_final, oi.id_rab_item, oi.id_instruksi_lapangan_item,
                       COALESCE(ri.kategori_pekerjaan, ili.kategori_pekerjaan) AS kategori_pekerjaan,
                       COALESCE(ri.jenis_pekerjaan, ili.jenis_pekerjaan) AS jenis_pekerjaan,
                       COALESCE(ri.satuan, ili.satuan) AS satuan,
                       oi.status, oi.volume_akhir, oi.selisih_volume, oi.total_selisih,
                       oi.total_harga_opname, oi.desain, oi.kualitas, oi.spesifikasi,
                       oi.foto, oi.catatan, oi.created_at
                FROM opname_item oi
                LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                WHERE oi.id_opname_final = ANY($1::int[])
                ORDER BY oi.id ASC
                `,
                [toArrayParam(opnameFinalIds)]
            )
        ]);

        const rabItemsByRabId = new Map<number, DashboardRabItemRow[]>();
        for (const row of rabItemResult.rows) {
            pushMapArray(rabItemsByRabId, row.id_rab, row);
        }

        const instruksiItemsById = new Map<number, DashboardInstruksiLapanganItemRow[]>();
        for (const row of instruksiItemResult.rows) {
            pushMapArray(instruksiItemsById, row.id_instruksi_lapangan, row);
        }

        const opnameItemsByFinalId = new Map<number, DashboardOpnameItemRow[]>();
        for (const row of opnameItemResult.rows) {
            pushMapArray(opnameItemsByFinalId, row.id_opname_final, row);
        }

        return projects.map((project) => ({
            ...project,
            rab: project.rab.map((row) => ({
                ...row,
                items: rabItemsByRabId.get(row.id) ?? []
            })),
            instruksi_lapangan: project.instruksi_lapangan.map((row) => ({
                ...row,
                items: instruksiItemsById.get(row.id) ?? []
            })),
            opname_final: project.opname_final.map((row) => ({
                ...row,
                items: opnameItemsByFinalId.get(row.id) ?? []
            }))
        }));
    },

    async hydrateOpnameItemsOnly(projects: DashboardData[]): Promise<DashboardData[]> {
        const opnameFinalIds = projects.flatMap((project) => project.opname_final.map((row) => row.id));
        if (opnameFinalIds.length === 0) return projects;

        const opnameItemResult = await pool.query<DashboardOpnameItemRow>(
            `
            SELECT oi.id, oi.id_toko, oi.id_opname_final, oi.id_rab_item, oi.id_instruksi_lapangan_item,
                   COALESCE(ri.kategori_pekerjaan, ili.kategori_pekerjaan) AS kategori_pekerjaan,
                   COALESCE(ri.jenis_pekerjaan, ili.jenis_pekerjaan) AS jenis_pekerjaan,
                   COALESCE(ri.satuan, ili.satuan) AS satuan,
                   oi.status, oi.volume_akhir, oi.selisih_volume, oi.total_selisih,
                   oi.total_harga_opname, oi.desain, oi.kualitas, oi.spesifikasi,
                   oi.foto, oi.catatan, oi.created_at
            FROM opname_item oi
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
            WHERE oi.id_opname_final = ANY($1::int[])
            ORDER BY oi.id ASC
            `,
            [toArrayParam(opnameFinalIds)]
        );

        const opnameItemsByFinalId = new Map<number, DashboardOpnameItemRow[]>();
        for (const row of opnameItemResult.rows) {
            pushMapArray(opnameItemsByFinalId, row.id_opname_final, row);
        }

        return projects.map((project) => ({
            ...project,
            opname_final: project.opname_final.map((row) => ({
                ...row,
                items: opnameItemsByFinalId.get(row.id) ?? []
            }))
        }));
    },

    async findKtkOpnameFinalDashboard(query: DashboardExportQueryInput): Promise<DashboardData[]> {
        const filters: string[] = [
            `EXISTS (
                SELECT 1
                FROM opname_final ofn
                WHERE ofn.id_toko = t.id
                  AND UPPER(COALESCE(ofn.tipe_opname, '')) = 'OPNAME_FINAL'
            )`
        ];
        const values: Array<string | number | number[] | string[]> = [];

        if (query.search) {
            values.push(`%${query.search}%`);
            const idx = values.length;
            filters.push(
                `(t.nomor_ulok ILIKE $${idx} OR t.nama_toko ILIKE $${idx} OR t.kode_toko ILIKE $${idx} OR t.cabang ILIKE $${idx} OR CAST(t.id AS TEXT) ILIKE $${idx})`
            );
        }

        const tokoIds = parseNumberCsv(query.toko_ids);
        if (tokoIds.length > 0) {
            values.push(tokoIds);
            filters.push(`t.id = ANY($${values.length}::int[])`);
        }

        const cabangs = parseTextCsv(query.cabangs);
        if (cabangs.length > 0) {
            values.push(cabangs);
            filters.push(`UPPER(COALESCE(t.cabang, '')) = ANY($${values.length}::text[])`);
        }

        if (query.cabang_array && query.cabang_array.length > 0) {
            values.push(query.cabang_array.map((item) => item.toUpperCase()));
            filters.push(`UPPER(COALESCE(t.cabang, '')) = ANY($${values.length}::text[])`);
        }

        if (query.cabang && query.cabang.toUpperCase() !== "ALL") {
            values.push(query.cabang.toUpperCase());
            filters.push(`UPPER(COALESCE(t.cabang, '')) = $${values.length}`);
        }

        if (query.tipe_bangunan && query.tipe_bangunan !== "ALL") {
            if (query.tipe_bangunan === "NON_RUKO") {
                filters.push(`(
                    EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = t.id AND (UPPER(r.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(r.kategori_lokasi) LIKE '%NON_RUKO%'))
                    OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = t.id AND (UPPER(p.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(p.kategori_lokasi) LIKE '%NON_RUKO%'))
                )`);
            } else if (query.tipe_bangunan === "RUKO") {
                filters.push(`(
                    EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = t.id AND UPPER(r.kategori_lokasi) LIKE '%RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON_RUKO%')
                    OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = t.id AND UPPER(p.kategori_lokasi) LIKE '%RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON_RUKO%')
                )`);
            }
        }

        const tokoResult = await pool.query<DashboardTokoRow>(
            `
            SELECT t.id, t.nomor_ulok, t.lingkup_pekerjaan, t.nama_toko, t.kode_toko, t.proyek,
                   t.cabang, t.alamat, t.nama_kontraktor
            FROM toko t
            WHERE ${filters.join(" AND ")}
            ORDER BY t.id DESC
            `,
            values
        );

        if (tokoResult.rows.length === 0) {
            return [];
        }

        const selectedTokoIds = tokoResult.rows.map((row) => row.id);
        const tokoIdsByScopeKey = new Map<string, number[]>();
        for (const row of tokoResult.rows) {
            const scopeKey = dashboardScopeKey(row.nomor_ulok, row.lingkup_pekerjaan);
            const scopedIds = tokoIdsByScopeKey.get(scopeKey) ?? [];
            scopedIds.push(row.id);
            tokoIdsByScopeKey.set(scopeKey, scopedIds);
        }

        const opnameFinalResult = await pool.query<DashboardOpnameFinalRow>(
            `
            SELECT id, id_toko, tipe_opname, aksi, status_opname_final, link_pdf_opname, email_pembuat,
                   pemberi_persetujuan_direktur, waktu_persetujuan_direktur, pemberi_persetujuan_koordinator,
                   waktu_persetujuan_koordinator, pemberi_persetujuan_manager, waktu_persetujuan_manager,
                   alasan_penolakan, grand_total_opname, grand_total_rab, hari_denda, nilai_denda,
                   tanggal_akhir_spk_denda, tanggal_serah_terima_denda, created_at, grand_total_final
            FROM opname_final
            WHERE id_toko = ANY($1::int[])
              AND UPPER(COALESCE(tipe_opname, '')) = 'OPNAME_FINAL'
            ORDER BY created_at DESC, id DESC
            `,
            [toArrayParam(selectedTokoIds)]
        );

        const spkResult = await pool.query<DashboardSpkRow>(
            `
            SELECT p.id,
                   COALESCE(p.id_toko, t.id) AS id_toko,
                   p.nomor_ulok,
                   p.email_pembuat,
                   p.lingkup_pekerjaan,
                   p.nama_kontraktor,
                   p.proyek,
                   p.waktu_mulai,
                   p.durasi,
                   p.waktu_selesai,
                   p.grand_total,
                   p.terbilang,
                   p.nomor_spk,
                   p.par,
                   p.spk_manual_1,
                   p.spk_manual_2,
                   p.status,
                   p.link_pdf,
                   p.approver_email,
                   p.waktu_persetujuan,
                   p.alasan_penolakan,
                   p.created_at, uc.nama_lengkap AS approver_name
            FROM pengajuan_spk p
                LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) uc ON uc.email_sat = p.approver_email
            LEFT JOIN toko t
              ON t.nomor_ulok = p.nomor_ulok
             AND LOWER(COALESCE(t.lingkup_pekerjaan, '')) = LOWER(COALESCE(p.lingkup_pekerjaan, ''))
            WHERE COALESCE(p.id_toko, t.id) = ANY($1::int[])
            ORDER BY p.created_at DESC, p.id DESC
            `,
            [toArrayParam(selectedTokoIds)]
        );

        const berkasSerahTerimaResult = await pool.query<DashboardBerkasSerahTerimaRow>(
            `
            SELECT id, id_toko, link_pdf, created_at
            FROM berkas_serah_terima
            WHERE id_toko = ANY($1::int[])
            ORDER BY created_at DESC, id DESC
            `,
            [toArrayParam(selectedTokoIds)]
        );

        const opnameFinalByTokoId = new Map<number, Array<DashboardOpnameFinalRow & { items: DashboardOpnameItemRow[] }>>();
        for (const row of opnameFinalResult.rows) {
            pushMapArray(opnameFinalByTokoId, row.id_toko, {
                ...row,
                // Keep parity with the existing dashboard export path, which
                // builds KTK rows from header values without item detail rows.
                items: []
            });
        }

        const spkByTokoId = new Map<number, Array<DashboardSpkRow & {
            approval_logs: DashboardSpkApprovalLogRow[];
            pertambahan_spk: DashboardPertambahanSpkRow[];
        }>>();

        for (const row of spkResult.rows) {
            const mapped = {
                ...row,
                approval_logs: [],
                pertambahan_spk: []
            };
            const explicitTokoId = Number(row.id_toko);
            const targetTokoIds = selectedTokoIds.includes(explicitTokoId)
                ? [explicitTokoId]
                : (tokoIdsByScopeKey.get(dashboardScopeKey(row.nomor_ulok, row.lingkup_pekerjaan)) ?? []);
            for (const targetTokoId of targetTokoIds) {
                pushMapArray(spkByTokoId, targetTokoId, mapped);
            }
        }

        const berkasSerahByTokoId = new Map<number, DashboardBerkasSerahTerimaRow[]>();
        for (const row of berkasSerahTerimaResult.rows) {
            pushMapArray(berkasSerahByTokoId, row.id_toko, row);
        }

        return tokoResult.rows.map((toko) => ({
            toko,
            rab: [],
            gantt: [],
            spk: spkByTokoId.get(toko.id) ?? [],
            pic_pengawasan: null,
            pengawasan_pdf_pending: [],
            instruksi_lapangan: [],
            opname_final: opnameFinalByTokoId.get(toko.id) ?? [],
            berkas_serah_terima: berkasSerahByTokoId.get(toko.id) ?? [],
            project_planning: [],
            dokumentasi_bangunan: []
        }));
    },

    async findUserExportRows(query: DashboardExportQueryInput): Promise<DashboardUserExportRow[]> {
        const filters: string[] = [];
        const values: Array<string | string[]> = [];

        const cabangs = parseTextCsv(query.cabangs);
        if (cabangs.length > 0) {
            values.push(cabangs);
            filters.push(`UPPER(COALESCE(uc.cabang, '')) = ANY($${values.length}::text[])`);
        }

        if (query.cabang_array && query.cabang_array.length > 0) {
            values.push(query.cabang_array.map((item) => item.toUpperCase()));
            filters.push(`UPPER(COALESCE(uc.cabang, '')) = ANY($${values.length}::text[])`);
        }

        if (query.cabang && query.cabang.toUpperCase() !== "ALL") {
            values.push(query.cabang.toUpperCase());
            filters.push(`UPPER(COALESCE(uc.cabang, '')) = $${values.length}`);
        }

        if (query.search) {
            values.push(`%${query.search}%`);
            const idx = values.length;
            filters.push(`(
                uc.nama_lengkap ILIKE $${idx}
                OR uc.email_sat ILIKE $${idx}
                OR uc.jabatan ILIKE $${idx}
                OR uc.cabang ILIKE $${idx}
                OR uc.nama_pt ILIKE $${idx}
            )`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        const result = await pool.query<DashboardUserExportRow>(
            `
            SELECT
                uc.id,
                uc.nama_lengkap AS nama_user,
                uc.email_sat AS email_user,
                uc.jabatan AS role,
                uc.cabang,
                uc.last_login_at::text
            FROM user_cabang uc
            ${whereClause}
            ORDER BY uc.cabang ASC, uc.nama_lengkap ASC NULLS LAST, uc.email_sat ASC
            `,
            values
        );

        return result.rows;
    },

    async findDokumentasiBangunanForExport(): Promise<DashboardDokumentasiBangunanRow[]> {
        const result = await pool.query<DashboardDokumentasiBangunanRow>(
            `
            SELECT nomor_ulok, nama_toko, kode_toko, cabang, tanggal_go, created_at
            FROM dokumentasi_bangunan
            WHERE tanggal_go IS NOT NULL
              AND TRIM(COALESCE(tanggal_go, '')) <> ''
            ORDER BY created_at DESC, id DESC
            `
        );

        return result.rows;
    },

    async findProjectPlanningExportRows(query: DashboardExportQueryInput): Promise<DashboardProjectPlanningRow[]> {
        const filters: string[] = [];
        const values: Array<string | number | string[]> = [];

        if (query.cabang_array && query.cabang_array.length > 0) {
            values.push(query.cabang_array.map((item) => item.toUpperCase()));
            const idx = values.length;
            filters.push(`UPPER(TRIM(COALESCE(pp.cabang, t.cabang))) = ANY($${idx}::text[])`);
        } else if (!query._is_global_access && query.actor_cabang && query.actor_cabang.toUpperCase() !== "HEAD OFFICE") {
            values.push(query.actor_cabang.toUpperCase());
            const idx = values.length;
            filters.push(`UPPER(TRIM(COALESCE(pp.cabang, t.cabang))) = $${idx}`);
        }

        if (query.cabang && query.cabang.toUpperCase() !== "ALL") {
            values.push(query.cabang.toUpperCase());
            const idx = values.length;
            filters.push(`UPPER(TRIM(COALESCE(pp.cabang, t.cabang))) = $${idx}`);
        }

        if (query.search) {
            values.push(`%${query.search.trim()}%`);
            const idx = values.length;
            filters.push(`(
                pp.nomor_ulok ILIKE $${idx} OR
                COALESCE(pp.nama_toko, t.nama_toko) ILIKE $${idx} OR
                COALESCE(pp.kode_toko, t.kode_toko) ILIKE $${idx} OR
                COALESCE(pp.cabang, t.cabang) ILIKE $${idx}
            )`);
        }

        if (query.jenis_proyek === "reguler") {
            filters.push(`UPPER(TRIM(COALESCE(pp.proyek, t.proyek))) = 'REGULER'`);
        } else if (query.jenis_proyek === "renovasi") {
            filters.push(`UPPER(TRIM(COALESCE(pp.proyek, t.proyek))) LIKE '%RENOVASI%'`);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

        const result = await pool.query<DashboardProjectPlanningRow>(
            `
            SELECT pp.id, pp.id_toko, pp.nomor_ulok, pp.email_pembuat,
                   COALESCE(NULLIF(pp.nama_toko, ''), NULLIF(pp.nama_toko, 'Belum diisi'), t.nama_toko) AS nama_toko,
                   COALESCE(NULLIF(pp.kode_toko, ''), NULLIF(pp.kode_toko, 'Belum diisi'), t.kode_toko) AS kode_toko,
                   COALESCE(NULLIF(pp.cabang, ''), t.cabang) AS cabang,
                   COALESCE(pp.proyek, t.proyek) AS proyek,
                   pp.lingkup_pekerjaan, pp.jenis_proyek, pp.estimasi_biaya, pp.keterangan,
                   pp.nama_pengaju, pp.nama_lokasi, pp.jenis_pengajuan, pp.jenis_pengajuan_lainnya,
                   pp.status,
                   pp.luas_bangunan, pp.luas_area_terbuka, pp.luas_area_terbangun, pp.luas_gudang,
                   pp.luas_area_parkir, pp.luas_area_sales,
                   pp.butuh_desain_3d, pp.link_desain_3d,
                   log_3d.waktu_send_3d, log_3d.uploader_3d,
                   log_tahap2.waktu_input_tahap_2,
                   spk_info.awal_spk, spk_info.akhir_spk,
                   pp.bm_waktu_persetujuan, pp.bm_approver_email, u_bm.nama_lengkap AS bm_approver_name,
                   pp.pp1_waktu_persetujuan, pp.pp1_approver_email, u_pp1.nama_lengkap AS pp1_approver_name,
                   pp.bm2_waktu_persetujuan, pp.bm2_approver_email, u_bm2.nama_lengkap AS bm2_approver_name, 
                   pp.bm_regional_waktu_persetujuan, pp.bm_regional_approver_email, u_reg.nama_lengkap AS bm_regional_approver_name,
                   pp.pp2_waktu_persetujuan, pp.pp2_approver_email, u_pp2.nama_lengkap AS pp2_approver_name,
                   pp.pp_manager_waktu_persetujuan, pp.pp_manager_approver_email, u_ppm.nama_lengkap AS pp_manager_approver_name,
                   pp.created_at,
                   revisi_log.revisi_bm_tahap_1, revisi_log.revisi_pp_tahap_1, revisi_log.revisi_bm_tahap_2,
                   revisi_log.revisi_bm_regional, revisi_log.revisi_pp_tahap_2, revisi_log.revisi_pp_manager
            FROM projek_planning pp
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm ON u_bm.email_sat = pp.bm_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp1 ON u_pp1.email_sat = pp.pp1_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_bm2 ON u_bm2.email_sat = pp.bm2_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_reg ON u_reg.email_sat = pp.bm_regional_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_pp2 ON u_pp2.email_sat = pp.pp2_approver_email
            LEFT JOIN (SELECT email_sat, MAX(nama_lengkap) as nama_lengkap FROM user_cabang GROUP BY email_sat) u_ppm ON u_ppm.email_sat = pp.pp_manager_approver_email
            LEFT JOIN (
                SELECT 
                    projek_planning_id,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL' THEN 1 END) as revisi_bm_tahap_1,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_1' THEN 1 END) as revisi_pp_tahap_1,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_APPROVAL_2' THEN 1 END) as revisi_bm_tahap_2,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_BM_REGIONAL_APPROVAL' THEN 1 END) as revisi_bm_regional,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_APPROVAL_2' THEN 1 END) as revisi_pp_tahap_2,
                    COUNT(CASE WHEN status_sebelum = 'WAITING_PP_MANAGER_APPROVAL' THEN 1 END) as revisi_pp_manager
                FROM projek_planning_log
                WHERE aksi = 'REJECT'
                GROUP BY projek_planning_id
            ) revisi_log ON revisi_log.projek_planning_id = pp.id
            LEFT JOIN (
                SELECT 
                    projek_planning_id,
                    MAX(created_at) AS waktu_send_3d,
                    (ARRAY_AGG(actor_email ORDER BY created_at DESC))[1] AS uploader_3d
                FROM projek_planning_log
                WHERE aksi = 'UPLOAD_3D'
                GROUP BY projek_planning_id
            ) log_3d ON log_3d.projek_planning_id = pp.id
            LEFT JOIN (
                SELECT 
                    projek_planning_id,
                    MAX(created_at) AS waktu_input_tahap_2
                FROM projek_planning_log
                WHERE aksi = 'UPLOAD_RAB'
                GROUP BY projek_planning_id
            ) log_tahap2 ON log_tahap2.projek_planning_id = pp.id
            LEFT JOIN LATERAL (
                SELECT 
                    ps.waktu_mulai AS awal_spk,
                    ps.waktu_selesai AS akhir_spk
                FROM pengajuan_spk ps
                WHERE UPPER(TRIM(ps.nomor_ulok)) = UPPER(TRIM(pp.nomor_ulok))
                  AND ps.status != 'SPK_REJECTED'
                ORDER BY 
                    CASE 
                        WHEN UPPER(TRIM(ps.lingkup_pekerjaan)) = 'SIPIL' THEN 1 
                        WHEN UPPER(TRIM(ps.lingkup_pekerjaan)) = 'ME' THEN 2 
                        ELSE 3 
                    END ASC,
                    ps.id DESC
                LIMIT 1
            ) spk_info ON true
            LEFT JOIN LATERAL (
                SELECT nama_toko, kode_toko, cabang, proyek
                FROM toko
                WHERE UPPER(TRIM(nomor_ulok)) = UPPER(TRIM(pp.nomor_ulok))
                ORDER BY id ASC
                LIMIT 1
            ) t ON true
            ${whereClause}
            ORDER BY pp.created_at DESC, pp.id DESC
            `,
            values
        );

        return result.rows;
    }
};
