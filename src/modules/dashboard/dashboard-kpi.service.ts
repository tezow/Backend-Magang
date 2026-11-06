import { pool } from "../../db/pool";
import type { DashboardKpiDrilldownQueryInput, DashboardKpiQueryInput } from "./dashboard.schema";
import {
    buildDashboardKpiFacts,
    metricValueForKpiType,
    summarizeDashboardKpiFacts,
} from "./dashboard-kpi.facts";
import type { DashboardKpiDrilldownRow, DashboardKpiFact, DashboardKpiSourceRow } from "./dashboard-kpi.types";

const normalize = (value: unknown) => String(value ?? "").trim();
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();

const pushParam = (params: unknown[], value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
};

const buildScopeWhere = (query: DashboardKpiQueryInput, alias = "t") => {
    const params: unknown[] = [];
    const where = [`COALESCE(${alias}.nomor_ulok, '') <> ''`];

    if (query.cabang_array && query.cabang_array.length > 0) {
        where.push(`UPPER(${alias}.cabang) = ANY(${pushParam(params, query.cabang_array.map((item) => item.toUpperCase()))})`);
    } else if (normalizeUpper(query.actor_cabang) !== "HEAD OFFICE") {
        where.push(`UPPER(${alias}.cabang) = ${pushParam(params, normalizeUpper(query.actor_cabang))}`);
    }

    if (query.cabang && normalizeUpper(query.cabang) !== "ALL" && normalizeUpper(query.cabang) !== "SEMUA CABANG") {
        where.push(`UPPER(${alias}.cabang) = ${pushParam(params, normalizeUpper(query.cabang))}`);
    }

    if (query.search) {
        const search = `%${query.search}%`;
        where.push(`(${alias}.nomor_ulok ILIKE ${pushParam(params, search)} OR ${alias}.nama_toko ILIKE ${pushParam(params, search)})`);
    }

    if (query.job_type && normalizeUpper(query.job_type) !== "ALL") {
        where.push(`UPPER(${alias}.lingkup_pekerjaan) = ${pushParam(params, normalizeUpper(query.job_type))}`);
    }

    if (query.tipe_bangunan && normalizeUpper(query.tipe_bangunan) !== "ALL") {
        if (normalizeUpper(query.tipe_bangunan) === "NON_RUKO") {
            where.push(`(
                EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = ${alias}.id AND (UPPER(r.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(r.kategori_lokasi) LIKE '%NON_RUKO%'))
                OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = ${alias}.id AND (UPPER(p.kategori_lokasi) LIKE '%NON RUKO%' OR UPPER(p.kategori_lokasi) LIKE '%NON_RUKO%'))
            )`);
        } else if (normalizeUpper(query.tipe_bangunan) === "RUKO") {
            where.push(`(
                EXISTS (SELECT 1 FROM rab r WHERE r.id_toko = ${alias}.id AND UPPER(r.kategori_lokasi) LIKE '%RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(r.kategori_lokasi) NOT LIKE '%NON_RUKO%')
                OR EXISTS (SELECT 1 FROM pic_pengawasan p WHERE p.id_toko = ${alias}.id AND UPPER(p.kategori_lokasi) LIKE '%RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON RUKO%' AND UPPER(p.kategori_lokasi) NOT LIKE '%NON_RUKO%')
            )`);
        }
    }

    return { where: where.join(" AND "), params };
};

const loadKpiRows = async (query: DashboardKpiQueryInput): Promise<DashboardKpiSourceRow[]> => {
    const scoped = buildScopeWhere(query, "t");
    const filters = [scoped.where];
    const params = [...scoped.params];

    if (query.coordinator && normalizeUpper(query.coordinator) !== "ALL") {
        filters.push(`EXISTS (
            SELECT 1 FROM rab rf
            WHERE rf.id_toko = t.id
              AND UPPER(rf.pemberi_persetujuan_koordinator) = ${pushParam(params, normalizeUpper(query.coordinator))}
        )`);
    }

    if (query.support && normalizeUpper(query.support) !== "ALL") {
        filters.push(`EXISTS (
            SELECT 1 FROM pic_pengawasan pf
            WHERE pf.id_toko = t.id
              AND UPPER(pf.plc_building_support) = ${pushParam(params, normalizeUpper(query.support))}
        )`);
    }

    const sql = `
        WITH latest_rab AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, status, grand_total_final, luas_bangunan, created_at,
                waktu_persetujuan_koordinator, waktu_persetujuan_manager, waktu_persetujuan_direktur,
                pemberi_persetujuan_koordinator
            FROM rab
            WHERE UPPER(COALESCE(status, '')) IN ('DISETUJUI', 'APPROVED')
            ORDER BY id_toko, COALESCE(waktu_persetujuan_direktur::text, waktu_persetujuan_manager::text, waktu_persetujuan_koordinator::text, created_at::text) DESC NULLS LAST, id DESC
        ),
        valid_spk AS (
            SELECT DISTINCT ON (id_toko)
                ps.id, ps.id_toko, ps.status, ps.durasi, ps.waktu_mulai, ps.waktu_selesai,
                (
                    SELECT MAX(pt.tanggal_spk_akhir_setelah_perpanjangan)
                    FROM pertambahan_spk pt
                    WHERE pt.id_spk = ps.id
                      AND UPPER(COALESCE(pt.status_persetujuan, '')) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
                ) AS pertambahan_akhir_setelah_perpanjangan
            FROM pengajuan_spk ps
            WHERE UPPER(COALESCE(ps.status, '')) IN ('SPK_APPROVED', 'ACTIVE', 'SELESAI', 'APPROVED', 'DISETUJUI', 'AKTIF')
            ORDER BY id_toko, COALESCE(waktu_selesai::text, waktu_mulai::text, created_at::text) DESC NULLS LAST, id DESC
        ),
        latest_opname AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, status_opname_final, created_at, grand_total_final, grand_total_opname, grand_total_rab,
                tanggal_akhir_spk_denda, tanggal_serah_terima_denda, hari_denda, nilai_denda
            FROM opname_final
            ORDER BY id_toko,
                CASE WHEN UPPER(COALESCE(status_opname_final, '')) LIKE '%SETUJU%' THEN 0 ELSE 1 END,
                COALESCE(waktu_persetujuan_direktur::text, created_at::text) DESC NULLS LAST,
                id DESC
        ),
        latest_st AS (
            SELECT DISTINCT ON (id_toko)
                id_toko, created_at, link_pdf
            FROM berkas_serah_terima
            WHERE COALESCE(link_pdf, '') <> ''
            ORDER BY id_toko, created_at DESC NULLS LAST, id DESC
        ),
        latest_pic AS (
            SELECT DISTINCT ON (id_toko)
                id_toko, plc_building_support
            FROM pic_pengawasan
            WHERE COALESCE(plc_building_support, '') <> ''
            ORDER BY id_toko, id DESC
        )
        SELECT
            t.id AS toko_id,
            t.nomor_ulok,
            t.nama_toko,
            t.kode_toko,
            t.cabang,
            t.lingkup_pekerjaan,
            r.id AS rab_id,
            r.status AS rab_status,
            r.grand_total_final AS rab_grand_total_final,
            r.luas_bangunan AS rab_luas_bangunan,
            r.created_at AS rab_created_at,
            r.waktu_persetujuan_koordinator AS rab_waktu_persetujuan_koordinator,
            r.waktu_persetujuan_manager AS rab_waktu_persetujuan_manager,
            r.waktu_persetujuan_direktur AS rab_waktu_persetujuan_direktur,
            r.pemberi_persetujuan_koordinator AS rab_pemberi_persetujuan_koordinator,
            s.id AS spk_id,
            s.status AS spk_status,
            s.durasi AS spk_durasi,
            s.waktu_mulai AS spk_waktu_mulai,
            s.waktu_selesai AS spk_waktu_selesai,
            s.pertambahan_akhir_setelah_perpanjangan,
            o.id AS opname_id,
            o.status_opname_final AS opname_status,
            o.created_at AS opname_created_at,
            o.grand_total_final AS opname_grand_total_final,
            o.grand_total_opname AS opname_grand_total_opname,
            o.grand_total_rab AS opname_grand_total_rab,
            o.tanggal_akhir_spk_denda AS opname_tanggal_akhir_spk_denda,
            o.tanggal_serah_terima_denda AS opname_tanggal_serah_terima_denda,
            o.hari_denda AS opname_hari_denda,
            o.nilai_denda AS opname_nilai_denda,
            st.created_at AS st_created_at,
            st.link_pdf AS st_link_pdf,
            pic.plc_building_support
        FROM toko t
        LEFT JOIN latest_rab r ON r.id_toko = t.id
        LEFT JOIN valid_spk s ON s.id_toko = t.id
        LEFT JOIN latest_opname o ON o.id_toko = t.id
        LEFT JOIN latest_st st ON st.id_toko = t.id
        LEFT JOIN latest_pic pic ON pic.id_toko = t.id
        WHERE ${filters.join(" AND ")}
    `;

    const result = await pool.query(sql, params);
    return result.rows;
};

const formatNumber = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const labelFor = (type: string, value: number | null) => {
    if (value === null) return "-";
    if (["cost_m2", "denda", "kerja_tambah", "kerja_kurang"].includes(type)) return rupiah(value);
    if (type === "total_ulok") return `${formatNumber(value)} ULOK`;
    return `${value.toFixed(1)} hari`;
};

const toDrilldownRow = (fact: DashboardKpiFact, type: DashboardKpiDrilldownQueryInput["kpi_type"]): DashboardKpiDrilldownRow => {
    const value = metricValueForKpiType(fact, type);
    return {
        nomor_ulok: fact.nomor_ulok,
        proyek: fact.nama_toko,
        kode_toko: fact.kode_toko,
        cabang: fact.cabang,
        job_types: fact.job_types,
        value,
        value_label: labelFor(type, value),
        secondary_label: `${fact.job_types.join(" + ") || "-"} | ${fact.scope_breakdown.length} lingkup`,
        coordinators: fact.coordinators,
        building_supports: fact.building_supports,
        data_quality_flags: fact.data_quality_flags,
        scope_breakdown: fact.scope_breakdown,
        detail: {
            rab_approved_total: fact.rab_approved_total,
            luas_bangunan: fact.luas_bangunan,
            spk_start_date: fact.spk_start_date,
            spk_end_date_after_extension: fact.spk_end_date_after_extension,
            st_date: fact.st_date,
            opname_final_date: fact.opname_final_date,
            rab_created_date: fact.rab_created_date,
            rab_coord_approved_date: fact.rab_coord_approved_date,
            rab_bm_approved_date: fact.rab_bm_approved_date,
            rab_branch_manager_approved_date: fact.rab_branch_manager_approved_date,
            official_late_days: fact.official_late_days,
            official_penalty_amount: fact.official_penalty_amount,
            opname_total: fact.opname_total,
            kerja_tambah_amount: fact.kerja_tambah_amount,
            kerja_kurang_amount: fact.kerja_kurang_amount,
            avg_sla_coord: fact.avg_sla_coord,
            avg_sla_bm: fact.avg_sla_bm,
            avg_sla_branch_manager: fact.avg_sla_branch_manager,
            avg_sla_approval_total: fact.avg_sla_approval_total,
        },
    };
};

export const dashboardKpiService = {
    async getKpiPerformance(query: DashboardKpiQueryInput) {
        const rows = await loadKpiRows(query);
        const facts = buildDashboardKpiFacts(rows);
        return summarizeDashboardKpiFacts(facts);
    },

    async getKpiFilters(query: DashboardKpiQueryInput) {
        const scoped = buildScopeWhere(query, "t");

        const coordinatorParams = [...scoped.params];
        const coordinatorFilters = [scoped.where, "COALESCE(r.pemberi_persetujuan_koordinator, '') <> ''"];
        if (query.support && normalizeUpper(query.support) !== "ALL") {
            coordinatorFilters.push(`EXISTS (
                SELECT 1 FROM pic_pengawasan pf
                WHERE pf.id_toko = t.id
                  AND UPPER(pf.plc_building_support) = ${pushParam(coordinatorParams, normalizeUpper(query.support))}
            )`);
        }

        const supportParams = [...scoped.params];
        const supportFilters = [scoped.where, "COALESCE(p.plc_building_support, '') <> ''"];
        if (query.coordinator && normalizeUpper(query.coordinator) !== "ALL") {
            supportFilters.push(`EXISTS (
                SELECT 1 FROM rab rf
                WHERE rf.id_toko = t.id
                  AND UPPER(rf.pemberi_persetujuan_koordinator) = ${pushParam(supportParams, normalizeUpper(query.coordinator))}
            )`);
        }

        const cabangParams = [...scoped.params];
        const cabangFilters = [scoped.where, "COALESCE(t.cabang, '') <> ''"];
        if (query.coordinator && normalizeUpper(query.coordinator) !== "ALL") {
            cabangFilters.push(`EXISTS (
                SELECT 1 FROM rab rf
                WHERE rf.id_toko = t.id
                  AND UPPER(rf.pemberi_persetujuan_koordinator) = ${pushParam(cabangParams, normalizeUpper(query.coordinator))}
            )`);
        }
        if (query.support && normalizeUpper(query.support) !== "ALL") {
            cabangFilters.push(`EXISTS (
                SELECT 1 FROM pic_pengawasan pf
                WHERE pf.id_toko = t.id
                  AND UPPER(pf.plc_building_support) = ${pushParam(cabangParams, normalizeUpper(query.support))}
            )`);
        }

        const [cabangs, coordinators, supports] = await Promise.all([
            pool.query(`
                SELECT DISTINCT t.cabang AS name
                FROM toko t
                WHERE ${cabangFilters.join(" AND ")}
                ORDER BY 1
            `, cabangParams),
            pool.query(`
                SELECT DISTINCT r.pemberi_persetujuan_koordinator AS name
                FROM rab r
                JOIN toko t ON t.id = r.id_toko
                WHERE ${coordinatorFilters.join(" AND ")}
                ORDER BY 1
            `, coordinatorParams),
            pool.query(`
                SELECT DISTINCT p.plc_building_support AS name
                FROM pic_pengawasan p
                JOIN toko t ON t.id = p.id_toko
                WHERE ${supportFilters.join(" AND ")}
                ORDER BY 1
            `, supportParams),
        ]);

        return {
            cabangs: cabangs.rows.map((row) => row.name),
            coordinators: coordinators.rows.map((row) => row.name),
            supports: supports.rows.map((row) => row.name),
        };
    },

    async getKpiDrilldown(query: DashboardKpiDrilldownQueryInput) {
        const rows = await loadKpiRows(query);
        const facts = buildDashboardKpiFacts(rows);
        const sorted = facts
            .map((fact) => toDrilldownRow(fact, query.kpi_type))
            .sort((a, b) => (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY));

        const page = query.page;
        const limit = query.limit;
        const total = sorted.length;
        const data = sorted.slice((page - 1) * limit, page * limit);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                basis: "ULOK_GABUNGAN" as const,
            },
        };
    },
};
