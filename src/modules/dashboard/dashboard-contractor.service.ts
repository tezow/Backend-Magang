import { pool } from "../../db/pool";

export const NORM_KONTRAKTOR = (col1: string, col2: string = 'NULL') => 
    `TRIM(REGEXP_REPLACE(UPPER(COALESCE(NULLIF(TRIM(${col1}), ''), NULLIF(TRIM(${col2}), ''))), '(^(CV|PT)[. ,]+|[. ,]+(CV|PT)$)', '', 'ig'))`;

import type { 
    ContractorPerformanceFilters, 
    ContractorGlobalSummary, 
    ContractorChartPoint,
    ContractorLeaderboardRow,
    ContractorRankingRow
} from "./dashboard-contractor.types";
import { branchGroupSql } from "../surat-peringatan/sp.repository";

// Helpers for period filtering
const getPeriodDateRange = (period?: string): { start: Date | null, end: Date | null } => {
    const now = new Date();
    switch (period) {
        case "THIS_MONTH":
            return {
                start: new Date(now.getFullYear(), now.getMonth(), 1),
                end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
            };
        case "LAST_MONTH":
            return {
                start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
            };
        case "THIS_YEAR":
            return {
                start: new Date(now.getFullYear(), 0, 1),
                end: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
            };
        case "YTD":
            return {
                start: new Date(now.getFullYear(), 0, 1),
                end: now
            };
        default:
            return { start: null, end: null };
    }
};

export const contractorPerformanceService = {
    async getSummary(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<ContractorGlobalSummary> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        
        let branchFilter = " AND 1=1";
        const values: any[] = [];
        
        // Allowed branches
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = ANY($${values.length}) OR UPPER(t.cabang) = ANY($${values.length}))`;
        }
        
        // Specific cabang filter
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = $${values.length} OR UPPER(t.cabang) = $${values.length})`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilterSpk = "";
        let periodFilterOpname = "";
        let periodFilterSp = "";
        
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterSpk = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
            periodFilterOpname = `AND ofn.created_at >= $${values.length - 1} AND ofn.created_at <= $${values.length}`;
            periodFilterSp = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
        }
        
        // 1. Avg Denda & Avg Keterlambatan
        const dendaQuery = `
            WITH penalty_data AS (
                SELECT 
                    MIN(ofn.nilai_denda) as denda_value
                FROM opname_final ofn
                JOIN toko t ON t.id = ofn.id_toko
                WHERE ofn.nilai_denda > 0
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter}
                ${periodFilterOpname}
                GROUP BY COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)
            ),
            base_keterlambatan AS (
                SELECT 
                    COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as ulok_id,
                    EXTRACT(DAY FROM (
                        CURRENT_DATE::timestamp
                        - (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval)
                    )) as late_days
                FROM pengajuan_spk ps
                JOIN toko t ON t.id = ps.id_toko
                LEFT JOIN opname_final ofn ON ofn.id_toko = t.id
                WHERE ofn.id IS NULL
                  AND (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') IS NULL
                  AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ${branchFilter.replace(/UPPER\(t.cabang\)/g, "UPPER(t.cabang)")}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter}
                ${periodFilterSpk}
            ),
            keterlambatan_data AS (
                SELECT ulok_id, MAX(late_days) as late_days
                FROM base_keterlambatan
                WHERE late_days > 0
                GROUP BY ulok_id
            )
            SELECT 
                (SELECT COALESCE(AVG(denda_value), 0) FROM penalty_data) as avg_denda,
                (SELECT COALESCE(SUM(denda_value), 0) FROM penalty_data) as total_denda,
                (SELECT COALESCE(AVG(late_days), 0) FROM keterlambatan_data) as avg_keterlambatan,
                (SELECT COUNT(*) FROM keterlambatan_data) as total_keterlambatan
        `;
        
        // 2. SP Aktif
        const spAktifQuery = `
            SELECT COUNT(DISTINCT dka.nama_kontraktor) as count
            FROM denda_keterlambatan_action dka
            JOIN toko t ON t.id = dka.id_toko
            WHERE dka.action_type = 'SP'
              AND dka.status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
              AND (dka.expires_at IS NULL OR dka.expires_at >= timezone('Asia/Jakarta', now()))
            ${branchFilter.replace(/t\.cabang/g, "dka.cabang")}
            ${jobTypeFilter}
            ${searchFilter}
            ${proyekFilter}
            ${bangunanFilter}
            ${dkaKontraktorFilter}
            ${periodFilterSp}
        `;
        
        // 3. Avg Kerja Tambah & Kurang
        // Kerja Tambah = opname > spk
        // Kerja Kurang = spk > opname
        const selisihQuery = `
            WITH latest_spk AS (
                SELECT DISTINCT ON (id_toko)
                    id_toko, grand_total, nama_kontraktor
                FROM pengajuan_spk
                WHERE UPPER(COALESCE(status, '')) IN ('SPK_APPROVED', 'ACTIVE', 'SELESAI', 'APPROVED', 'DISETUJUI', 'AKTIF')
                ORDER BY id_toko, COALESCE(waktu_persetujuan, waktu_selesai, created_at) DESC NULLS LAST, id DESC
            ),
            latest_opname AS (
                SELECT DISTINCT ON (id_toko)
                    id, id_toko, grand_total_final, grand_total_opname, created_at
                FROM opname_final
                ORDER BY id_toko, 
                    CASE WHEN UPPER(COALESCE(status_opname_final, '')) LIKE '%SETUJU%' THEN 0 ELSE 1 END,
                    COALESCE(NULLIF(waktu_persetujuan_direktur, '')::timestamp, created_at) DESC NULLS LAST,
                    id DESC
            ),
            scope_data AS (
                SELECT 
                    COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as ulok_id,
                    (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) as selisih
                FROM latest_opname ofn
                JOIN toko t ON t.id = ofn.id_toko
                JOIN latest_spk ps ON ps.id_toko = t.id 
                WHERE 1=1
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${dkaKontraktorFilter}
                ${periodFilterOpname}
            ),
            ulok_data AS (
                SELECT 
                    ulok_id,
                    AVG(selisih) FILTER (WHERE selisih > 0) as kerja_tambah,
                    AVG(ABS(selisih)) FILTER (WHERE selisih < 0) as kerja_kurang
                FROM scope_data
                GROUP BY ulok_id
            )
            SELECT 
                COALESCE(AVG(kerja_tambah), 0) as avg_kerja_tambah,
                COALESCE(AVG(kerja_kurang), 0) as avg_kerja_kurang,
                COALESCE(SUM(kerja_tambah), 0) as total_kerja_tambah,
                COALESCE(SUM(kerja_kurang), 0) as total_kerja_kurang
            FROM ulok_data
        `;
        
        const [dendaResult, spResult, selisihResult] = await Promise.all([
            pool.query(dendaQuery, values),
            pool.query(spAktifQuery, values),
            pool.query(selisihQuery, values)
        ]);
        
        return {
            avg_denda: Number(dendaResult.rows[0]?.avg_denda || 0),
            total_denda: Number(dendaResult.rows[0]?.total_denda || 0),
            avg_keterlambatan: Number(dendaResult.rows[0]?.avg_keterlambatan || 0),
            total_keterlambatan: Number(dendaResult.rows[0]?.total_keterlambatan || 0),
            sp_aktif_count: Number(spResult.rows[0]?.count || 0),
            avg_kerja_tambah: Number(selisihResult.rows[0]?.avg_kerja_tambah || 0),
            avg_kerja_kurang: Number(selisihResult.rows[0]?.avg_kerja_kurang || 0),
            total_kerja_tambah: Number(selisihResult.rows[0]?.total_kerja_tambah || 0),
            total_kerja_kurang: Number(selisihResult.rows[0]?.total_kerja_kurang || 0)
        };
    },
    
    async getCharts(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<ContractorChartPoint[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        
        let branchFilter = " AND 1=1";
        const values: any[] = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND UPPER(t.cabang) = ANY($${values.length})`;
        }
        
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND UPPER(t.cabang) = $${values.length}`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilter = "";
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilter = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
        } else {
            // Default 12 months if no period
            values.push(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1));
            values.push(new Date());
            periodFilter = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
        }
        
        const query = `
            WITH monthly_data AS (
                SELECT 
                    to_char(ps.created_at, 'YYYY-MM') as month,
                    SUM(COALESCE(NULLIF(rab.grand_total_final, '')::numeric, 0)) as total_penawaran,
                    SUM(COALESCE(ps.grand_total, 0)) as total_spk,
                    SUM(COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric) as total_opname
                FROM pengajuan_spk ps
                JOIN toko t ON t.id = ps.id_toko
                LEFT JOIN opname_final ofn ON ofn.id_toko = t.id
                LEFT JOIN rab ON rab.id_toko = t.id AND UPPER(TRIM(COALESCE(rab.status, ''))) = 'APPROVED'
                WHERE UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter}
                ${periodFilter}
                GROUP BY to_char(ps.created_at, 'YYYY-MM')
            )
            SELECT month, total_penawaran as penawaran, total_spk as spk, total_opname as opname
            FROM monthly_data
            ORDER BY month ASC
        `;
        
        const result = await pool.query(query, values);
        return result.rows.map(row => ({
            month: row.month,
            penawaran: Number(row.penawaran || 0),
            spk: Number(row.spk || 0),
            opname: Number(row.opname || 0)
        }));
    },
    
    async getLeaderboard(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<ContractorLeaderboardRow[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        
        let branchFilter = " AND 1=1";
        let dkaBranchFilter = " AND 1=1";
        const values: any[] = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = ANY($${values.length}) OR UPPER(t.cabang) = ANY($${values.length}))`;
            dkaBranchFilter += ` AND (${branchGroupSql('dka.cabang')} = ANY($${values.length}) OR UPPER(dka.cabang) = ANY($${values.length}))`;
        }
        
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = $${values.length} OR UPPER(t.cabang) = $${values.length})`;
            dkaBranchFilter += ` AND (${branchGroupSql('dka.cabang')} = $${values.length} OR UPPER(dka.cabang) = $${values.length})`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilterSpk = "";
        let periodFilterOpname = "";
        let periodFilterSp = "";
        
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterSpk = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
            periodFilterOpname = `AND ofn.created_at >= $${values.length - 1} AND ofn.created_at <= $${values.length}`;
            periodFilterSp = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
        }
        
        const query = `
            WITH kontraktor_list AS (
                SELECT DISTINCT ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor
                FROM pengajuan_spk ps
                JOIN toko t ON t.id = ps.id_toko
                WHERE UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter}
                ${periodFilterSpk}
            ),
            sp_history AS (
                SELECT 
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    COUNT(*) as sp_count,
                    SUM(CASE WHEN dka.status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR') 
                             AND (dka.expires_at IS NULL OR dka.expires_at >= timezone('Asia/Jakarta', now())) THEN 1 ELSE 0 END) as active_sp_count
                FROM denda_keterlambatan_action dka
                JOIN toko t ON t.id = dka.id_toko
                WHERE dka.action_type = 'SP'
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${dkaKontraktorFilter}
                ${periodFilterSp}
                GROUP BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}
            ),
            opname_stats AS (
                SELECT 
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    COUNT(oi.id) as total_items,
                    SUM(CASE WHEN oi.desain = 'Sesuai' THEN 1 ELSE 0 END) as total_desain_sesuai,
                    SUM(CASE WHEN oi.kualitas = 'Baik' THEN 1 ELSE 0 END) as total_kualitas_baik,
                    SUM(CASE WHEN oi.spesifikasi = 'Sesuai' THEN 1 ELSE 0 END) as total_spek_sesuai
                FROM opname_final ofn
                JOIN toko t ON t.id = ofn.id_toko
                JOIN opname_item oi ON oi.id_opname_final = ofn.id
                JOIN pengajuan_spk ps ON ps.id_toko = t.id AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                WHERE 1=1
                ${branchFilter}
                ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter}
                ${periodFilterOpname}
                GROUP BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}
            ),
            raw_data AS (
                SELECT 
                    kl.nama_kontraktor,
                    COALESCE(sp.sp_count, 0)::int as history_sp_count,
                    COALESCE(sp.active_sp_count, 0)::int as active_sp_count,
                    CASE WHEN COALESCE(os.total_items, 0) > 0 THEN (os.total_desain_sesuai::numeric / os.total_items) * 100 ELSE 0 END as avg_design,
                    CASE WHEN COALESCE(os.total_items, 0) > 0 THEN (os.total_kualitas_baik::numeric / os.total_items) * 100 ELSE 0 END as avg_kualitas,
                    CASE WHEN COALESCE(os.total_items, 0) > 0 THEN (os.total_spek_sesuai::numeric / os.total_items) * 100 ELSE 0 END as avg_spek
                FROM kontraktor_list kl
                LEFT JOIN sp_history sp ON LOWER(TRIM(kl.nama_kontraktor)) = LOWER(TRIM(sp.nama_kontraktor))
                LEFT JOIN opname_stats os ON LOWER(TRIM(kl.nama_kontraktor)) = LOWER(TRIM(os.nama_kontraktor))
                WHERE kl.nama_kontraktor IS NOT NULL
            )
            SELECT 
                nama_kontraktor,
                history_sp_count,
                active_sp_count,
                avg_design,
                avg_kualitas,
                avg_spek,
                ((avg_kualitas / 100 * 35) + (avg_design / 100 * 35) + (avg_spek / 100 * 30)) as avg_nilai_toko
            FROM raw_data
            ORDER BY ((avg_kualitas / 100 * 35) + (avg_design / 100 * 35) + (avg_spek / 100 * 30)) DESC
        `;
        
        const result = await pool.query(query, values);
        
        return result.rows.map(row => ({
            nama_kontraktor: row.nama_kontraktor,
            history_sp_count: Number(row.history_sp_count || 0),
            active_sp_count: Number(row.active_sp_count || 0),
            avg_design: Number(row.avg_design || 0),
            avg_kualitas: Number(row.avg_kualitas || 0),
            avg_spek: Number(row.avg_spek || 0),
            avg_nilai_toko: Number(row.avg_nilai_toko || 0)
        }));
    },

    async getDrilldownRanking(metric: string, filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<ContractorRankingRow[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        let branchFilter = " AND 1=1";
        let dkaBranchFilter = " AND 1=1";
        const values: any[] = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = ANY($${values.length}) OR UPPER(t.cabang) = ANY($${values.length}))`;
            dkaBranchFilter += ` AND (${branchGroupSql('dka.cabang')} = ANY($${values.length}) OR UPPER(dka.cabang) = ANY($${values.length}))`;
        }
        
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = $${values.length} OR UPPER(t.cabang) = $${values.length})`;
            dkaBranchFilter += ` AND (${branchGroupSql('dka.cabang')} = $${values.length} OR UPPER(dka.cabang) = $${values.length})`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilterOpname = "";
        let periodFilterSp = "";
        let periodFilterSpk = "";
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterOpname = `AND ofn.created_at >= $${values.length - 1} AND ofn.created_at <= $${values.length}`;
            periodFilterSp = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
            periodFilterSpk = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
        }

        let query = "";
        
        if (metric === "avg_denda" || metric === "total_denda") {
            query = `
                WITH denda_toko AS (
                    SELECT 
                        MAX(${NORM_KONTRAKTOR('t.nama_kontraktor')}) AS nama_kontraktor,
                        MAX(${branchGroupSql('t.cabang')}) AS cabang,
                        COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as ulok_id,
                        MIN(ofn.nilai_denda) as denda_value
                    FROM opname_final ofn
                    JOIN toko t ON t.id = ofn.id_toko
                    LEFT JOIN pengajuan_spk ps ON ps.id_toko = t.id AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                    WHERE ofn.nilai_denda > 0
                    ${branchFilter} ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter} ${periodFilterOpname}
                    GROUP BY COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)
                )
                SELECT 
                    nama_kontraktor,
                    cabang,
                    ROUND(AVG(denda_value)) as metric_value,
                    'Rupiah' as metric_label,
                    COUNT(DISTINCT ulok_id) as total_toko
                FROM denda_toko
                WHERE nama_kontraktor IS NOT NULL
                GROUP BY nama_kontraktor, cabang
                ORDER BY metric_value DESC
            `;
        } else if (metric === "avg_keterlambatan") {
            query = `
                WITH base_keterlambatan AS (
                    SELECT 
                        COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as ulok_id,
                        ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                        ${branchGroupSql('t.cabang')} AS cabang,
                        EXTRACT(DAY FROM (
                            CURRENT_DATE::timestamp
                            - (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval)
                        )) as late_days
                    FROM pengajuan_spk ps
                    JOIN toko t ON t.id = ps.id_toko
                    LEFT JOIN opname_final ofn ON ofn.id_toko = t.id
                    WHERE ofn.id IS NULL
                      AND (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') IS NULL
                      AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                    ${branchFilter} ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter} ${periodFilterSpk}
                ),
                keterlambatan_toko AS (
                    SELECT 
                        ulok_id,
                        MAX(nama_kontraktor) as nama_kontraktor,
                        MAX(cabang) as cabang,
                        MAX(late_days) as late_days
                    FROM base_keterlambatan
                    WHERE late_days > 0
                    GROUP BY ulok_id
                )
                SELECT 
                    nama_kontraktor,
                    cabang,
                    ROUND(AVG(late_days)) as metric_value,
                    'Hari' as metric_label,
                    COUNT(DISTINCT ulok_id) as total_toko
                FROM keterlambatan_toko
                WHERE nama_kontraktor IS NOT NULL
                GROUP BY nama_kontraktor, cabang
                ORDER BY metric_value DESC
            `;
        } else if (metric === "sp_aktif") {
            query = `
                SELECT 
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    ${branchGroupSql('dka.cabang')} AS cabang,
                    COUNT(*) as metric_value,
                    'SP Aktif' as metric_label,
                    COUNT(DISTINCT COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)) as total_toko
                FROM denda_keterlambatan_action dka
                JOIN toko t ON t.id = dka.id_toko
                WHERE dka.action_type = 'SP'
                  AND dka.status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                  AND (dka.expires_at IS NULL OR dka.expires_at >= timezone('Asia/Jakarta', now()))
                ${dkaBranchFilter} ${periodFilterSp}
                GROUP BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')}
                ORDER BY metric_value DESC
            `;
        } else if (metric === "kerja_tambah" || metric === "kerja_kurang") {
            query = `
                WITH latest_spk AS (
                    SELECT DISTINCT ON (id_toko)
                        id_toko, grand_total, nama_kontraktor
                    FROM pengajuan_spk
                    WHERE UPPER(COALESCE(status, '')) IN ('SPK_APPROVED', 'ACTIVE', 'SELESAI', 'APPROVED', 'DISETUJUI', 'AKTIF')
                    ORDER BY id_toko, COALESCE(waktu_persetujuan, waktu_selesai, created_at) DESC NULLS LAST, id DESC
                ),
                latest_opname AS (
                    SELECT DISTINCT ON (id_toko)
                        id, id_toko, grand_total_final, grand_total_opname, created_at
                    FROM opname_final
                    ORDER BY id_toko, 
                        CASE WHEN UPPER(COALESCE(status_opname_final, '')) LIKE '%SETUJU%' THEN 0 ELSE 1 END,
                        COALESCE(NULLIF(waktu_persetujuan_direktur, '')::timestamp, created_at) DESC NULLS LAST,
                        id DESC
                ),
                scope_data AS (
                    SELECT 
                        COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as ulok_id,
                        MAX(${NORM_KONTRAKTOR('t.nama_kontraktor')}) AS nama_kontraktor,
                        MAX(${branchGroupSql('t.cabang')}) AS cabang,
                        (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) as selisih
                    FROM latest_opname ofn
                    JOIN toko t ON t.id = ofn.id_toko
                    JOIN latest_spk ps ON ps.id_toko = t.id 
                    WHERE 1=1 ${branchFilter} ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${dkaKontraktorFilter} ${periodFilterOpname}
                    GROUP BY COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text), (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total)
                ),
                ulok_data AS (
                    SELECT 
                        ulok_id,
                        MAX(nama_kontraktor) as nama_kontraktor,
                        MAX(cabang) as cabang,
                        AVG(selisih) FILTER (WHERE selisih > 0) as kerja_tambah,
                        AVG(ABS(selisih)) FILTER (WHERE selisih < 0) as kerja_kurang
                    FROM scope_data
                    GROUP BY ulok_id
                )
                SELECT 
                    nama_kontraktor,
                    cabang,
                    ROUND(AVG(${metric === "kerja_tambah" ? "kerja_tambah" : "kerja_kurang"})) as metric_value,
                    'Rupiah' as metric_label,
                    COUNT(DISTINCT ulok_id) as total_toko
                FROM ulok_data
                WHERE ${metric === "kerja_tambah" ? "kerja_tambah IS NOT NULL" : "kerja_kurang IS NOT NULL"}
                GROUP BY nama_kontraktor, cabang
                ORDER BY metric_value DESC
            `;
        } else if (metric === "evaluasi_toko") {
            query = `
                WITH opname_stats AS (
                    SELECT 
                        ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                        ${branchGroupSql('t.cabang')} AS cabang,
                        COUNT(oi.id) as total_items,
                        SUM(CASE WHEN oi.desain = 'Sesuai' THEN 1 ELSE 0 END) as total_desain_sesuai,
                        SUM(CASE WHEN oi.kualitas = 'Baik' THEN 1 ELSE 0 END) as total_kualitas_baik,
                        SUM(CASE WHEN oi.spesifikasi = 'Sesuai' THEN 1 ELSE 0 END) as total_spek_sesuai,
                        COUNT(DISTINCT COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)) as total_toko
                    FROM opname_final ofn
                    JOIN toko t ON t.id = ofn.id_toko
                    JOIN opname_item oi ON oi.id_opname_final = ofn.id
                    JOIN pengajuan_spk ps ON ps.id_toko = t.id AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                    WHERE (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') IS NOT NULL
                    ${branchFilter} ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
              ${kontraktorFilter} ${periodFilterOpname}
                    GROUP BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('t.cabang')}
                )
                SELECT 
                    nama_kontraktor,
                    cabang,
                    ROUND(CASE WHEN COALESCE(total_items, 0) > 0 THEN 
                        ((total_kualitas_baik::numeric / total_items * 35) + 
                         (total_desain_sesuai::numeric / total_items * 35) + 
                         (total_spek_sesuai::numeric / total_items * 30))
                    ELSE 0 END, 1) as metric_value,
                    'Max 100' as metric_label,
                    total_toko
                FROM opname_stats
                WHERE nama_kontraktor IS NOT NULL
                ORDER BY metric_value DESC
            `;
        } else {
            return [];
        }

        const result = await pool.query(query, values);
        return result.rows.map(r => ({
            nama_kontraktor: r.nama_kontraktor,
            cabang: r.cabang,
            metric_value: Number(r.metric_value || 0),
            metric_label: r.metric_label,
            total_toko: Number(r.total_toko || 0)
        }));
    },

    async getDrilldownSpActiveAll(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<any[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        let branchFilter = " AND 1=1";
        const values: any[] = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('dka.cabang')} = ANY($${values.length}) OR UPPER(dka.cabang) = ANY($${values.length}))`;
        }
        
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('dka.cabang')} = $${values.length} OR UPPER(dka.cabang) = $${values.length})`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilter = "";
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilter = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
        }
        
        const query = `
            WITH sp_data AS (
                SELECT 
                    dka.id,
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    dka.action_type,
                    dka.sp_level,
                    dka.created_at,
                    dka.expires_at as original_expires_at,
                    COALESCE(dka.alasan_sp, dka.catatan) as alasan_sp,
                    dka.lampiran_1_url,
                    dka.link_pdf,
                    ${branchGroupSql('dka.cabang')} AS cabang,
                    t.nama_toko,
                    t.id as id_toko,
                    dka.status,
                    LEAD(dka.created_at) OVER (PARTITION BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')} ORDER BY dka.created_at ASC) as next_sp_created_at
                FROM denda_keterlambatan_action dka
                JOIN toko t ON t.id = dka.id_toko
                WHERE dka.action_type = 'SP'
                  ${branchFilter}
                  ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
                  ${dkaKontraktorFilter}
                  ${periodFilter}
            )
            SELECT 
                id,
                nama_kontraktor,
                action_type,
                sp_level,
                created_at,
                COALESCE(next_sp_created_at, original_expires_at) as expires_at,
                alasan_sp,
                lampiran_1_url,
                link_pdf,
                cabang,
                nama_toko,
                id_toko
            FROM sp_data
            WHERE status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
              AND next_sp_created_at IS NULL 
              AND (original_expires_at IS NULL OR original_expires_at >= timezone('Asia/Jakarta', now()))
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, values);
        return result.rows;
    },

    async getAllSpHistory(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<any[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        let branchFilter = " AND 1=1";
        const values: any[] = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('dka.cabang')} = ANY($${values.length}) OR UPPER(dka.cabang) = ANY($${values.length}))`;
        }
        
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('dka.cabang')} = $${values.length} OR UPPER(dka.cabang) = $${values.length})`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        
        let periodFilter = "";
        
        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }

        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilter = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
        }
        
        const query = `
            WITH sp_data AS (
                SELECT 
                    dka.id,
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    dka.action_type,
                    dka.sp_level,
                    dka.created_at,
                    dka.expires_at as original_expires_at,
                    COALESCE(dka.alasan_sp, dka.catatan) as alasan_sp,
                    dka.lampiran_1_url,
                    dka.link_pdf,
                    ${branchGroupSql('dka.cabang')} AS cabang,
                    t.nama_toko,
                    t.id as id_toko,
                    dka.status,
                    LEAD(dka.created_at) OVER (PARTITION BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')} ORDER BY dka.created_at ASC) as next_sp_created_at,
                    LEAD(dka.sp_level) OVER (PARTITION BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')} ORDER BY dka.created_at ASC) as next_sp_level
                FROM denda_keterlambatan_action dka
                JOIN toko t ON t.id = dka.id_toko
                WHERE dka.action_type = 'SP'
                  ${branchFilter}
                  ${jobTypeFilter}
                  ${searchFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
                  ${dkaKontraktorFilter}
                  ${periodFilter}
            )
            SELECT 
                id,
                nama_kontraktor,
                action_type,
                sp_level,
                created_at,
                COALESCE(next_sp_created_at, original_expires_at) as expires_at,
                original_expires_at,
                next_sp_created_at,
                next_sp_level,
                alasan_sp,
                lampiran_1_url,
                link_pdf,
                cabang,
                nama_toko,
                id_toko,
                status,
                CASE 
                    WHEN status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                         AND next_sp_created_at IS NULL 
                         AND (original_expires_at IS NULL OR original_expires_at >= timezone('Asia/Jakarta', now()))
                    THEN true 
                    ELSE false 
                END as is_active,
                (next_sp_created_at IS NOT NULL) as has_next_sp
            FROM sp_data
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, values);
        return result.rows;
    },

    async getDrilldownSpHistory(kontraktor: string, filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<any[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        let branchFilter = " AND 1=1";
        const values = [];
        
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = ANY($${values.length}) OR UPPER(t.cabang) = ANY($${values.length}))`;
        }
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = $${values.length} OR UPPER(t.cabang) = $${values.length})`;
        }
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }
        let periodFilterSp = "";
        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterSp = `AND dka.created_at >= $${values.length - 1} AND dka.created_at <= $${values.length}`;
        }
        values.push(kontraktor);
        const kontraktorParam = `$${values.length}`;

        const query = `
            WITH sp_data AS (
                SELECT 
                    dka.id,
                    ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                    dka.action_type,
                    dka.sp_level,
                    dka.created_at,
                    dka.expires_at as original_expires_at,
                    COALESCE(dka.alasan_sp, dka.catatan) as alasan_sp,
                    dka.lampiran_1_url,
                    dka.link_pdf,
                    ${branchGroupSql('dka.cabang')} AS cabang,
                    t.nama_toko,
                    t.id as id_toko,
                    dka.status,
                    LEAD(dka.created_at) OVER (PARTITION BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')} ORDER BY dka.created_at ASC) as next_sp_created_at,
                    LEAD(dka.sp_level) OVER (PARTITION BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('dka.cabang')} ORDER BY dka.created_at ASC) as next_sp_level
                FROM denda_keterlambatan_action dka
                JOIN toko t ON t.id = dka.id_toko
                WHERE dka.action_type = 'SP'
                  AND 1=1
                  AND ${NORM_KONTRAKTOR('t.nama_kontraktor')} = ${NORM_KONTRAKTOR(kontraktorParam)}
                  ${branchFilter}
                  ${jobTypeFilter}
                  ${proyekFilter}
                  ${bangunanFilter}
                  ${dkaKontraktorFilter}
                  ${periodFilterSp}
            )
            SELECT 
                id,
                nama_kontraktor,
                action_type,
                sp_level,
                created_at,
                COALESCE(next_sp_created_at, original_expires_at) as expires_at,
                original_expires_at,
                next_sp_created_at,
                next_sp_level,
                alasan_sp,
                lampiran_1_url,
                link_pdf,
                cabang,
                nama_toko,
                id_toko,
                status,
                CASE 
                    WHEN status IN ('APPROVED', 'SENT_TO_CONTRACTOR', 'VIEWED_BY_CONTRACTOR', 'ACKNOWLEDGED_BY_CONTRACTOR')
                         AND next_sp_created_at IS NULL 
                         AND (original_expires_at IS NULL OR original_expires_at >= timezone('Asia/Jakarta', now()))
                    THEN true 
                    ELSE false 
                END as is_active,
                (next_sp_created_at IS NOT NULL) as has_next_sp
            FROM sp_data
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, values);
        return result.rows;
    },

    async getDrilldownUlok(kontraktor: string, idTokoFilter?: string, metric?: string, filters?: ContractorPerformanceFilters, allowedBranches?: string[]): Promise<any[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters || {};
        const values = [];
        let branchFilter = "";
        
        if (allowedBranches && allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND UPPER(t.cabang) = ANY($${values.length})`;
        }
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND (${branchGroupSql('t.cabang')} = $${values.length} OR UPPER(t.cabang) = $${values.length})`;
        }
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }
        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }
        let periodFilterOpname = "";
        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterOpname = `AND ofn.created_at >= $${values.length - 1} AND ofn.created_at <= $${values.length}`;
        }

        // Return full list of ULOK for this contractor (mixed Sipil & ME)
        // If idTokoFilter is provided, return only that toko (for SP history flow)
        let filter = `1=1 ${branchFilter} ${jobTypeFilter} ${proyekFilter} ${bangunanFilter}
              ${kontraktorFilter} ${periodFilterOpname}`;
        
        if (kontraktor) {
            values.push(kontraktor);
            filter += ` AND ${NORM_KONTRAKTOR('t.nama_kontraktor')} = ${NORM_KONTRAKTOR(`$${values.length}`)}`;
        }
        
        if (idTokoFilter) {
            values.push(idTokoFilter);
            filter += ` AND t.id = $${values.length}`;
        }

        if (metric === 'avg_denda' || metric === 'total_denda') {
            filter += ` AND ofn.nilai_denda > 0`;
        } else if (metric === 'avg_keterlambatan' || metric === 'total_keterlambatan') {
            filter += ` AND ofn.id IS NULL AND (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') IS NULL AND CURRENT_DATE::timestamp > (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval)`;
        } else if (metric === 'kerja_tambah') {
            filter += ` AND ofn.id IS NOT NULL AND (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) > 0`;
        } else if (metric === 'kerja_kurang') {
            filter += ` AND ofn.id IS NOT NULL AND (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) < 0`;
        } else if (metric === 'evaluasi_toko') {
            filter += ` AND ofn.id IS NOT NULL AND (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') IS NOT NULL`;
        }

        const query = `
            WITH latest_spk AS (
                SELECT DISTINCT ON (id_toko)
                    id_toko, grand_total, nama_kontraktor, lingkup_pekerjaan, status, waktu_persetujuan, created_at, durasi, id
                FROM pengajuan_spk
                WHERE UPPER(COALESCE(status, '')) IN ('SPK_APPROVED', 'ACTIVE', 'SELESAI', 'APPROVED', 'DISETUJUI', 'AKTIF')
                ORDER BY id_toko, COALESCE(waktu_persetujuan, waktu_selesai, created_at) DESC NULLS LAST, id DESC
            ),
            latest_opname AS (
                SELECT DISTINCT ON (id_toko)
                    id, id_toko, grand_total_final, grand_total_opname, created_at, hari_denda, nilai_denda
                FROM opname_final
                ORDER BY id_toko, 
                    CASE WHEN UPPER(COALESCE(status_opname_final, '')) LIKE '%SETUJU%' THEN 0 ELSE 1 END,
                    COALESCE(NULLIF(waktu_persetujuan_direktur, '')::timestamp, created_at) DESC NULLS LAST,
                    id DESC
            )
            SELECT 
                ofn.id as id_opname_final,
                t.id as id_toko,
                COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as nomor_ulok,
                t.nama_toko,
                t.cabang,
                ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                COALESCE(
                    ofn.hari_denda,
                    EXTRACT(DAY FROM (
                        COALESCE(
                            (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != ''),
                            CURRENT_DATE::timestamp
                        )
                        - (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval)
                    ))
                ) as hari_denda,
                ofn.nilai_denda,
                (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval) as akhir_spk,
                (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != '') as serah_terima_date,
                (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) as selisih_kerja,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'kualitas', oi.kualitas,
                            'desain', oi.desain,
                            'spesifikasi', oi.spesifikasi
                        )
                    ) FROM opname_item oi WHERE oi.id_opname_final = ofn.id),
                    '[]'::json
                ) as item_stats,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'id_toko', t_scope.id,
                            'nomor_ulok', t_scope.nomor_ulok,
                            'nama_toko', t_scope.nama_toko,
                            'lingkup_pekerjaan', COALESCE(ps_scope.lingkup_pekerjaan, t_scope.lingkup_pekerjaan, 'SIPIL'),
                            'project_type', COALESCE(t_scope.proyek, 'REGULER'),
                            'spk_total', ps_scope.grand_total,
                            'opname_final_total', ofn_scope.grand_total_final,
                            'nilai_denda', COALESCE(ofn_scope.nilai_denda, 0),
                            'akhir_spk', (COALESCE(ps_scope.waktu_persetujuan, ps_scope.created_at) + ((COALESCE(ps_scope.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps_scope.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval),
                            'serah_terima_date', (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t_scope.id AND link_pdf IS NOT NULL AND link_pdf != ''),
                            'hari_denda', COALESCE(
                                ofn_scope.hari_denda,
                                EXTRACT(DAY FROM (
                                    COALESCE(
                                        (SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t_scope.id AND link_pdf IS NOT NULL AND link_pdf != ''),
                                        CURRENT_DATE::timestamp
                                    )
                                    - (COALESCE(ps_scope.waktu_persetujuan, ps_scope.created_at) + ((COALESCE(ps_scope.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps_scope.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval)
                                ))
                            ),
                            'selisih_kerja', (COALESCE(NULLIF(ofn_scope.grand_total_final, ''), NULLIF(ofn_scope.grand_total_opname, ''))::numeric - ps_scope.grand_total),
                            'kerja_tambah', CASE WHEN (COALESCE(NULLIF(ofn_scope.grand_total_final, ''), NULLIF(ofn_scope.grand_total_opname, ''))::numeric - ps_scope.grand_total) > 0 
                                                 THEN (COALESCE(NULLIF(ofn_scope.grand_total_final, ''), NULLIF(ofn_scope.grand_total_opname, ''))::numeric - ps_scope.grand_total) ELSE 0 END,
                            'kerja_kurang', CASE WHEN (COALESCE(NULLIF(ofn_scope.grand_total_final, ''), NULLIF(ofn_scope.grand_total_opname, ''))::numeric - ps_scope.grand_total) < 0 
                                                 THEN ABS(COALESCE(NULLIF(ofn_scope.grand_total_final, ''), NULLIF(ofn_scope.grand_total_opname, ''))::numeric - ps_scope.grand_total) ELSE 0 END,
                            'nilai_toko', COALESCE(
                                (SELECT ROUND(
                                    (COUNT(CASE WHEN oi.kualitas = 'Baik' THEN 1 END)::numeric / NULLIF(COUNT(oi.id), 0) * 35) +
                                    (COUNT(CASE WHEN oi.desain = 'Sesuai' THEN 1 END)::numeric / NULLIF(COUNT(oi.id), 0) * 35) +
                                    (COUNT(CASE WHEN oi.spesifikasi = 'Sesuai' THEN 1 END)::numeric / NULLIF(COUNT(oi.id), 0) * 30)
                                ) FROM opname_item oi WHERE oi.id_opname_final = ofn_scope.id),
                                0
                            )
                        )
                    ) FROM toko t_scope 
                      LEFT JOIN latest_spk ps_scope ON ps_scope.id_toko = t_scope.id 
                      LEFT JOIN latest_opname ofn_scope ON ofn_scope.id_toko = t_scope.id
                      WHERE COALESCE(NULLIF(TRIM(t_scope.nomor_ulok), ''), t_scope.id::text) = COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)),
                    '[]'::json
                ) as scopes
            FROM toko t
            LEFT JOIN latest_spk ps ON ps.id_toko = t.id
            LEFT JOIN latest_opname ofn ON ofn.id_toko = t.id
            WHERE ${filter}
            ORDER BY t.id DESC
        `;
        const result = await pool.query(query, values);
        
        // Process stats to simple string for table display
        return result.rows.map(r => {
            let k_baik = 0, d_sesuai = 0, s_sesuai = 0, total = 0;
            if (r.item_stats && r.item_stats.length > 0) {
                total = r.item_stats.length;
                r.item_stats.forEach((item: any) => {
                    if (item.kualitas === 'Baik') k_baik++;
                    if (item.desain === 'Sesuai') d_sesuai++;
                    if (item.spesifikasi === 'Sesuai') s_sesuai++;
                });
            }
            
            const kualitas = total > 0 ? (k_baik / total * 100).toFixed(0) + '%' : '0%';
            const desain = total > 0 ? (d_sesuai / total * 100).toFixed(0) + '%' : '0%';
            const spesifikasi = total > 0 ? (s_sesuai / total * 100).toFixed(0) + '%' : '0%';
            const nilai_toko = total > 0 ? ((k_baik / total * 35) + (d_sesuai / total * 35) + (s_sesuai / total * 30)).toFixed(0) : 0;
            
            return {
                id_opname_final: r.id_opname_final,
                id_toko: r.id_toko,
                nomor_ulok: r.nomor_ulok,
                nama_toko: r.nama_toko,
                cabang: r.cabang,
                nama_kontraktor: r.nama_kontraktor,
                hari_denda: r.hari_denda,
                nilai_denda: r.nilai_denda,
                akhir_spk: r.akhir_spk,
                serah_terima_date: r.serah_terima_date,
                kerja_tambah: Number(r.selisih_kerja) > 0 ? Number(r.selisih_kerja) : 0,
                kerja_kurang: Number(r.selisih_kerja) < 0 ? Math.abs(Number(r.selisih_kerja)) : 0,
                kualitas,
                desain,
                spesifikasi,
                nilai_toko: Number(nilai_toko),
                scopes: r.scopes || []
            };
        });
    },

    async getDrilldownDetail(idToko: string, lingkup: string, filters?: ContractorPerformanceFilters, allowedBranches?: string[]): Promise<any> {
        // Context-aware detail implies we return everything for the Slide-Out panel,
        // and let the frontend pick what to emphasize based on the context.
        const query = `
            SELECT 
                COALESCE(NULLIF(TRIM(ps.nomor_ulok), ''), NULLIF(TRIM(t.nomor_ulok), ''), t.id::text) as nomor_ulok,
                t.nama_toko,
                t.cabang,
                t.lingkup_pekerjaan as jenis_pekerjaan,
                ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                ps.lingkup_pekerjaan,
                ofn.hari_denda,
                ofn.nilai_denda,
                COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, '')) as grand_total_opname,
                ps.grand_total as spk_total,
                (COALESCE(NULLIF(ofn.grand_total_final, ''), NULLIF(ofn.grand_total_opname, ''))::numeric - ps.grand_total) as selisih_kerja,
                ps.created_at as spk_created_at,
                ps.waktu_persetujuan as spk_waktu_persetujuan,
                rab.created_at as rab_created_at,
                rab.waktu_persetujuan_manager as rab_waktu_persetujuan,
                rab.grand_total_final as rab_grand_total,
                (SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')) as spk_tambah_hari,
                EXTRACT(DAY FROM (COALESCE((SELECT MIN(created_at) FROM berkas_serah_terima WHERE id_toko = t.id AND link_pdf IS NOT NULL AND link_pdf != ''), CURRENT_DATE::timestamp) - (COALESCE(ps.waktu_persetujuan, ps.created_at) + ((COALESCE(ps.durasi, 0) + COALESCE((SELECT SUM(NULLIF(REGEXP_REPLACE(pertambahan_hari, '[^0-9]', '', 'g'), '')::integer) FROM pertambahan_spk WHERE id_spk = ps.id AND status_persetujuan IN ('APPROVED_BY_BM', 'APPROVED')), 0)) || ' days')::interval))) as true_late_days,
                ofn.id as id_opname_final,
                (SELECT json_agg(
                        json_build_object(
                            'kualitas', oi.kualitas,
                            'desain', oi.desain,
                            'spesifikasi', oi.spesifikasi
                        )
                    ) FROM opname_item oi WHERE oi.id_opname_final = ofn.id) as item_stats,
                (SELECT json_agg(DISTINCT UPPER(ps2.lingkup_pekerjaan)) 
                    FROM toko t2 
                    JOIN pengajuan_spk ps2 ON ps2.id_toko = t2.id 
                    WHERE COALESCE(NULLIF(TRIM(t2.nomor_ulok), ''), t2.id::text) = COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)
                ) as available_scopes
            FROM toko t
            JOIN pengajuan_spk ps ON ps.id_toko = t.id 
                AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
                AND ($2 = 'Sipil + ME' OR UPPER(ps.lingkup_pekerjaan) = UPPER($2))
            LEFT JOIN opname_final ofn ON ofn.id_toko = t.id
            LEFT JOIN rab ON rab.id_toko = t.id AND UPPER(TRIM(COALESCE(rab.status, ''))) = 'APPROVED'
            WHERE t.id = $1
            LIMIT 1
        `;
        const result = await pool.query(query, [idToko, lingkup]);
        return result.rows[0];
    }
    , async getContractorBalanceChart(filters: ContractorPerformanceFilters, allowedBranches: string[]): Promise<any[]> {
        const { cabang, job_type, period, search, proyek, bangunan, kontraktor: filterKontraktor } = filters;
        
        let branchFilter = " AND 1=1";
        const values: any[] = [];

        let searchFilter = "";
        if (search) {
            values.push(`%${search.toUpperCase()}%`);
            searchFilter = `AND UPPER(t.nama_kontraktor) LIKE $${values.length}`;
        }

        let proyekFilter = "";
        if (proyek && proyek !== "ALL") {
            if (proyek.toUpperCase() === "REGULER") {
                proyekFilter = `AND (UPPER(COALESCE(t.proyek, '')) NOT LIKE '%RENOVASI%' AND UPPER(COALESCE(t.proyek, '')) != '')`;
            } else if (proyek.toUpperCase() === "RENOVASI") {
                proyekFilter = `AND UPPER(COALESCE(t.proyek, '')) LIKE '%RENOVASI%'`;
            }
        }
        
        let bangunanFilter = "";
        if (bangunan && bangunan !== "ALL") {
            if (bangunan.toUpperCase() === "RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) = 'RUKO')`;
            } else if (bangunan.toUpperCase() === "NON RUKO") {
                bangunanFilter = `AND t.id IN (SELECT id_toko FROM rab WHERE UPPER(kategori_lokasi) LIKE '%NON RUKO%')`;
            }
        }
        let kontraktorFilter = "";
        let dkaKontraktorFilter = "";
        if (filterKontraktor && filterKontraktor !== "ALL") {
            values.push(filterKontraktor.toUpperCase());
            kontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
            dkaKontraktorFilter = `AND UPPER(${NORM_KONTRAKTOR('t.nama_kontraktor')}) = $${values.length}`;
        }
        
        // Allowed branches
        if (allowedBranches.length > 0) {
            const normalized = allowedBranches.map(b => b.trim().toUpperCase());
            values.push(normalized);
            branchFilter += ` AND ${branchGroupSql('t.cabang')} = ANY($${values.length})`;
        }
        
        // Specific cabang filter
        if (cabang && cabang !== "ALL" && cabang !== "SEMUA CABANG") {
            values.push(cabang.trim().toUpperCase());
            branchFilter += ` AND ${branchGroupSql('t.cabang')} = $${values.length}`;
        }
        
        let jobTypeFilter = "";
        if (job_type && job_type !== "ALL") {
            values.push(job_type.toUpperCase());
            jobTypeFilter = `AND UPPER(t.lingkup_pekerjaan) = $${values.length}`;
        }

        let periodFilterOpname = "";
        const { start, end } = getPeriodDateRange(period);
        if (start && end) {
            values.push(start);
            values.push(end);
            periodFilterOpname = `AND ps.created_at >= $${values.length - 1} AND ps.created_at <= $${values.length}`;
        }

        const query = `
            SELECT 
                ${NORM_KONTRAKTOR('t.nama_kontraktor')} AS nama_kontraktor,
                ${branchGroupSql('t.cabang')} AS cabang,
                SUM(COALESCE(NULLIF(rab.grand_total_final, '')::numeric, 0)) as total_penawaran,
                SUM(COALESCE(ps.grand_total, 0)) as total_spk,
                COUNT(DISTINCT COALESCE(NULLIF(TRIM(t.nomor_ulok), ''), t.id::text)) as total_toko
            FROM pengajuan_spk ps
            JOIN toko t ON t.id = ps.id_toko
            LEFT JOIN rab ON rab.id_toko = t.id
            WHERE UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
              ${branchFilter}
              ${searchFilter}
              ${jobTypeFilter}
              ${proyekFilter}
              ${bangunanFilter}
              ${kontraktorFilter}
              ${periodFilterOpname}
            GROUP BY ${NORM_KONTRAKTOR('t.nama_kontraktor')}, ${branchGroupSql('t.cabang')}
            HAVING SUM(COALESCE(ps.grand_total, 0)) > 0 OR SUM(COALESCE(NULLIF(rab.grand_total_final, '')::numeric, 0)) > 0
            ORDER BY total_spk DESC
        `;
        
        const result = await pool.query(query, values);
        return result.rows.map(r => ({
            nama_kontraktor: `${r.nama_kontraktor} - ${r.cabang}`,
            total_penawaran: Number(r.total_penawaran),
            total_spk: Number(r.total_spk),
            total_toko: Number(r.total_toko)
        }));
    }

};