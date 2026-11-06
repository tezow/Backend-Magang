import { pool } from "../../db/pool";
import { avg, sum, buildPerformanceKpiFacts, dayDiff, normalizeName, normalizeUpper, summarizePerformanceKpiValues } from "./performance-kpi.facts";
import { BRANCH_GROUPS, normalizeBranchScopeName } from "../../common/branch-scope";

import type {
    PerformanceKpiApprovalEvent,
    PerformanceKpiCardType,
    PerformanceKpiDetailInput,
    PerformanceKpiDrilldownInput,
    PerformanceKpiFact,
    PerformanceKpiOptionStat,
    PerformanceKpiOptionStatsInput,
    PerformanceKpiPersonRole,
    PerformanceKpiQueryInput,
    PerformanceKpiRawRow,
    PerformanceKpiSlaRole,
    PerformanceKpiTableMetric
} from "./performance-kpi.types";

const pushParam = (params: unknown[], value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
};

const SUBDIVIDED_BRANCH_PARENTS = new Set(["CIKOKOL", "CILEUNGSI"]);

const getBranchGroupParent = (branch?: string | null): string | null => {
    const normalized = normalizeBranchScopeName(branch);
    if (!normalized) return null;
    const entry = Object.entries(BRANCH_GROUPS).find(([, branches]) => branches.map(normalizeBranchScopeName).includes(normalized));
    return entry?.[0] ?? null;
};

const isPerformanceGlobalBranchView = (query: PerformanceKpiQueryInput): boolean =>
    query._is_global_access === true || normalizeBranchScopeName(query.actor_cabang) === "HEAD OFFICE";

const getPerformanceCabangOptions = (facts: PerformanceKpiFact[], query: PerformanceKpiQueryInput): string[] => {
    const optionSet = new Set<string>();
    const useParentBranchOptions = isPerformanceGlobalBranchView(query);

    for (const fact of facts) {
        const branch = normalizeBranchScopeName(fact.cabang);
        if (!branch) continue;

        const parent = getBranchGroupParent(branch);
        if (useParentBranchOptions) {
            optionSet.add(parent ?? branch);
            continue;
        }

        if (parent && SUBDIVIDED_BRANCH_PARENTS.has(parent)) {
            if (branch !== parent) optionSet.add(branch);
            continue;
        }

        optionSet.add(parent ?? branch);
    }

    return Array.from(optionSet).sort();
};
const isAll = (value: unknown) => {
    const normalized = normalizeUpper(value);
    return !normalized || normalized === "ALL" || normalized === "SEMUA" || normalized === "SEMUA CABANG";
};


type IdentityAliasMap = Map<string, string>;
type IdentityAliases = { map: IdentityAliasMap; validNames: Set<string> };
type IdentityRole = "support" | "coordinator" | "bm_manager" | "branch_manager";

const isEmailAddress = (value: string | null | undefined): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeName(value));

const addIdentityAlias = (aliases: IdentityAliases, label: string | null | undefined, alias: string | null | undefined) => {
    const normalizedAlias = normalizeUpper(alias);
    const normalizedLabel = normalizeName(label);
    if (normalizedLabel) aliases.validNames.add(normalizedLabel);
    if (normalizedAlias && normalizedLabel) aliases.map.set(normalizedAlias, normalizedLabel);
};

const emptyAliases = (): IdentityAliases => ({ map: new Map<string, string>(), validNames: new Set<string>() });

const roleFromJabatan = (jabatan: string | null | undefined): IdentityRole | null => {
    const normalized = normalizeUpper(jabatan);
    if (!normalized) return null;
    if (normalized.includes("SUPPORT") || normalized.includes("PENGAWAS")) return "support";
    if (normalized.includes("COORD") || normalized.includes("KOORD")) return "coordinator";
    if (normalized.includes("BRANCH MANAGER")) return "branch_manager";
    if (normalized.includes("MANAGER")) return "bm_manager";
    return null;
};

const loadIdentityAliasMaps = async (): Promise<Record<IdentityRole, IdentityAliases>> => {
    const result = await pool.query<{ nama_lengkap: string | null; email_sat: string | null; jabatan: string | null }>(`
        SELECT nama_lengkap, email_sat, jabatan
        FROM user_cabang
        WHERE COALESCE(nama_lengkap, '') <> '' OR COALESCE(email_sat, '') <> ''
    `);
    const aliases: Record<IdentityRole, IdentityAliases> = {
        support: emptyAliases(),
        coordinator: emptyAliases(),
        bm_manager: emptyAliases(),
        branch_manager: emptyAliases()
    };
    for (const row of result.rows) {
        const role = roleFromJabatan(row.jabatan);
        if (!role) continue;
        const target = aliases[role];
        const label = normalizeName(row.nama_lengkap) || normalizeName(row.email_sat);
        addIdentityAlias(target, label, row.nama_lengkap);
        addIdentityAlias(target, label, row.email_sat);
    }
    return aliases;
};
const canonicalizeName = (value: string | null | undefined, aliases: IdentityAliases): string | null => {
    const raw = normalizeName(value);
    if (!raw) return null;
    const mapped = aliases.map.get(normalizeUpper(raw));
    if (mapped) return mapped;
    if (isEmailAddress(raw)) return null;
    return mapped ?? raw;
};

const canonicalizeNames = (values: string[], aliases: IdentityAliases): string[] =>
    Array.from(new Set(values.map((value) => canonicalizeName(value, aliases)).filter((value): value is string => Boolean(value))))
        .sort((a, b) => a.localeCompare(b));

const canonicalizeApprovalActors = (fact: PerformanceKpiFact, aliases: Record<IdentityRole, IdentityAliases>): PerformanceKpiApprovalEvent[] =>
    fact.approvals.map((event) => {
        const actorAliases = aliases[event.role];
        const actorName = actorAliases ? canonicalizeName(event.actorName, actorAliases) : event.actorName;
        return { ...event, actorName };
    });

const normalizeFactPeople = (fact: PerformanceKpiFact, aliases: Record<IdentityRole, IdentityAliases>): PerformanceKpiFact => ({
    ...fact,
    supports: canonicalizeNames(fact.supports, aliases.support),
    coordinators: canonicalizeNames(fact.coordinators, aliases.coordinator),
    approvals: canonicalizeApprovalActors(fact, aliases)
});

const filterFactsByPeople = (facts: PerformanceKpiFact[], query: PerformanceKpiQueryInput, aliases: Record<IdentityRole, IdentityAliases>) => {
    const supportFilter = isAll(query.support) ? null : (canonicalizeName(query.support, aliases.support) ?? "__NO_MATCH__");
    const coordinatorFilter = isAll(query.coordinator) ? null : (canonicalizeName(query.coordinator, aliases.coordinator) ?? "__NO_MATCH__");
    return facts.filter((fact) => {
        if (supportFilter && !fact.supports.some((support) => normalizeUpper(support) === normalizeUpper(supportFilter))) return false;
        if (coordinatorFilter && !fact.coordinators.some((coordinator) => normalizeUpper(coordinator) === normalizeUpper(coordinatorFilter))) return false;
        return true;
    });
};
const projectTypePredicate = (alias: string, placeholder: string) => `(
    (${placeholder} = 'REGULER' AND UPPER(TRIM(COALESCE(${alias}.proyek, ''))) IN ('REGULER', 'ALFAMART REGULER'))
    OR (${placeholder} = 'RENOVASI' AND (
        UPPER(TRIM(COALESCE(${alias}.proyek, ''))) LIKE '%RENOVASI%'
        OR UPPER(TRIM(COALESCE(${alias}.proyek, ''))) LIKE '%PERBAIKAN%'
        OR UPPER(TRIM(COALESCE(${alias}.proyek, ''))) LIKE '%PEREMAJAAN%'
    ))
)`;
const buildScopeWhere = (query: PerformanceKpiQueryInput, alias = "t") => {
    const params: unknown[] = [];
    const where = [`COALESCE(${alias}.nomor_ulok, '') <> ''`];

    if (query.cabang_array?.length) {
        where.push(`UPPER(${alias}.cabang) = ANY(${pushParam(params, query.cabang_array.map(normalizeUpper))}::text[])`);
    } else if (normalizeUpper(query.actor_cabang) !== "HEAD OFFICE") {
        where.push(`UPPER(${alias}.cabang) = ${pushParam(params, normalizeUpper(query.actor_cabang))}`);
    }

    if (!isAll(query.cabang)) {
        const selected = normalizeBranchScopeName(query.cabang!);
        const groupBranches = Object.entries(BRANCH_GROUPS).find(([parent]) => parent === selected)?.[1] || [selected];
        where.push(`UPPER(${alias}.cabang) = ANY(${pushParam(params, groupBranches)}::text[])`);
    }

    if (query.job_type && normalizeUpper(query.job_type) !== "ALL") {
        const projectTypeParam = pushParam(params, normalizeUpper(query.job_type));
        where.push(projectTypePredicate(alias, projectTypeParam));
    }

    if (query.search) {
        const search = `%${query.search.trim()}%`;
        where.push(`(${alias}.nomor_ulok ILIKE ${pushParam(params, search)} OR ${alias}.nama_toko ILIKE ${pushParam(params, search)} OR ${alias}.kode_toko ILIKE ${pushParam(params, search)})`);
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

    const period = query.period ?? "all";
    if (period !== "all") {
        if (period === "ytd") {
            where.push(`COALESCE(st.created_at, ps.waktu_persetujuan, ps.created_at) >= date_trunc('year', now())`);
        } else {
            const monthMap: Record<string, string> = { "1m": "1 month", "3m": "3 months", "6m": "6 months", "12m": "12 months" };
            where.push(`COALESCE(st.created_at, ps.waktu_persetujuan, ps.created_at) >= now() - ${pushParam(params, monthMap[period] ?? "100 years")}::interval`);
        }
    }
    return { where: where.join(" AND "), params };
};

const loadFacts = async (query: PerformanceKpiQueryInput): Promise<PerformanceKpiFact[]> => {
    const scoped = buildScopeWhere(query, "t");
    const sql = `
        WITH latest_rab AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, status, grand_total_final, luas_bangunan, luas_area_terbuka,
                (
                    SELECT SUM(total_harga)
                    FROM rab_item
                    WHERE id_rab = rab.id
                    AND (UPPER(kategori_pekerjaan) LIKE '%AREA TERBUKA%' OR UPPER(jenis_pekerjaan) LIKE '%AREA TERBUKA%')
                ) as area_terbuka,
                created_at, pemberi_persetujuan_koordinator, nama_persetujuan_koordinator,
                waktu_persetujuan_koordinator, pemberi_persetujuan_manager, nama_persetujuan_manager,
                waktu_persetujuan_manager, link_pdf_gabungan, link_pdf_non_sbo, link_pdf_rekapitulasi,
                link_pdf_sph, link_pdf_materai
            FROM rab
            WHERE UPPER(COALESCE(status, '')) IN ('DISETUJUI', 'APPROVED')
            ORDER BY id_toko, COALESCE(waktu_persetujuan_manager, waktu_persetujuan_koordinator, created_at) DESC NULLS LAST, id DESC
        ),
        latest_spk AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, nomor_spk, status, grand_total, created_at, waktu_mulai, waktu_selesai,
                durasi, approver_email, waktu_persetujuan, link_pdf
            FROM pengajuan_spk
            WHERE UPPER(COALESCE(status, '')) IN ('SPK_APPROVED', 'ACTIVE', 'SELESAI', 'APPROVED', 'DISETUJUI', 'AKTIF')
            ORDER BY id_toko, COALESCE(waktu_persetujuan, waktu_selesai, created_at) DESC NULLS LAST, id DESC
        ),
        latest_tambah AS (
            SELECT DISTINCT ON (ps.id_toko)
                pt.id, ps.id_toko, pt.pertambahan_hari, pt.tanggal_spk_akhir,
                pt.tanggal_spk_akhir_setelah_perpanjangan, pt.created_at, pt.disetujui_oleh,
                pt.waktu_persetujuan, pt.link_pdf, pt.link_lampiran_pendukung
            FROM pertambahan_spk pt
            JOIN pengajuan_spk ps ON ps.id = pt.id_spk
            WHERE UPPER(COALESCE(pt.status_persetujuan, '')) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM', 'DISETUJUI BRANCH MANAGER')
            ORDER BY ps.id_toko, COALESCE(pt.waktu_persetujuan, pt.created_at) DESC NULLS LAST, pt.id DESC
        ),
        latest_il AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, status, grand_total_final, created_at,
                pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager, waktu_persetujuan_manager,
                link_pdf_gabungan, link_pdf_non_sbo, link_pdf_rekapitulasi, link_lampiran
            FROM instruksi_lapangan
            WHERE UPPER(COALESCE(status, '')) IN ('DISETUJUI', 'APPROVED')
            ORDER BY id_toko, COALESCE(waktu_persetujuan_manager, waktu_persetujuan_koordinator, created_at) DESC NULLS LAST, id DESC
        ),
        latest_opname AS (
            SELECT DISTINCT ON (id_toko)
                id, id_toko, status_opname_final, tipe_opname, grand_total_final, grand_total_opname,
                grand_total_rab, created_at, pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager, waktu_persetujuan_manager, pemberi_persetujuan_direktur,
                waktu_persetujuan_direktur, hari_denda, nilai_denda, tanggal_akhir_spk_denda,
                tanggal_serah_terima_denda, link_pdf_opname
            FROM opname_final
            ORDER BY id_toko,
                CASE WHEN UPPER(COALESCE(status_opname_final, '')) LIKE '%SETUJU%' THEN 0 ELSE 1 END,
                COALESCE(NULLIF(waktu_persetujuan_direktur, '')::timestamp, created_at) DESC NULLS LAST,
                id DESC
        ),
        latest_st AS (
            SELECT DISTINCT ON (id_toko) id_toko, created_at, link_pdf
            FROM berkas_serah_terima
            ORDER BY id_toko, created_at DESC NULLS LAST, id DESC
        ),
        latest_pic AS (
            SELECT DISTINCT ON (UPPER(TRIM(nomor_ulok))) nomor_ulok, plc_building_support, created_at
            FROM pic_pengawasan
            WHERE COALESCE(plc_building_support, '') <> '' AND COALESCE(nomor_ulok, '') <> ''
            ORDER BY UPPER(TRIM(nomor_ulok)), created_at DESC NULLS LAST, id DESC
        )
        SELECT
            t.id AS toko_id, t.nomor_ulok, t.lingkup_pekerjaan, t.proyek, t.nama_toko, t.kode_toko,
            t.cabang, t.alamat, t.nama_kontraktor,
            pic.plc_building_support AS support_name, pic.created_at AS support_created_at,
            r.id AS rab_id, r.status AS rab_status, r.grand_total_final AS rab_grand_total_final,
            r.luas_bangunan AS rab_luas_bangunan, r.luas_area_terbuka AS rab_luas_terbuka,
            r.area_terbuka AS rab_area_terbuka, r.created_at AS rab_created_at,
            COALESCE(r.nama_persetujuan_koordinator, r.pemberi_persetujuan_koordinator) AS rab_coord_name,
            r.waktu_persetujuan_koordinator AS rab_coord_at,
            COALESCE(r.nama_persetujuan_manager, r.pemberi_persetujuan_manager) AS rab_manager_name,
            r.waktu_persetujuan_manager AS rab_manager_at,
            r.link_pdf_gabungan AS rab_pdf_gabungan, r.link_pdf_non_sbo AS rab_pdf_non_sbo,
            r.link_pdf_rekapitulasi AS rab_pdf_rekap, r.link_pdf_sph AS rab_pdf_sph,
            r.link_pdf_materai AS rab_pdf_materai,
            ps.id AS spk_id, ps.nomor_spk AS spk_nomor, ps.status AS spk_status,
            ps.grand_total AS spk_grand_total, ps.created_at AS spk_created_at,
            ps.waktu_mulai AS spk_start, ps.waktu_selesai AS spk_end, ps.durasi AS spk_duration,
            ps.approver_email AS spk_approver, ps.waktu_persetujuan AS spk_approved_at,
            ps.link_pdf AS spk_pdf,
            pt.id AS tambah_spk_id, pt.pertambahan_hari AS tambah_spk_days,
            pt.tanggal_spk_akhir AS tambah_spk_old_end,
            pt.tanggal_spk_akhir_setelah_perpanjangan AS tambah_spk_new_end,
            pt.created_at AS tambah_spk_created_at, pt.disetujui_oleh AS tambah_spk_approver,
            pt.waktu_persetujuan AS tambah_spk_approved_at, pt.link_pdf AS tambah_spk_pdf,
            pt.link_lampiran_pendukung AS tambah_spk_lampiran,
            il.id AS il_id, il.status AS il_status, il.grand_total_final AS il_grand_total_final,
            il.created_at AS il_created_at, il.pemberi_persetujuan_koordinator AS il_coord_name,
            il.waktu_persetujuan_koordinator AS il_coord_at,
            il.pemberi_persetujuan_manager AS il_manager_name,
            il.waktu_persetujuan_manager AS il_manager_at,
            il.link_pdf_gabungan AS il_pdf_gabungan, il.link_pdf_non_sbo AS il_pdf_non_sbo,
            il.link_pdf_rekapitulasi AS il_pdf_rekap, il.link_lampiran AS il_lampiran,
            ofn.id AS opname_id, ofn.status_opname_final AS opname_status,
            ofn.tipe_opname AS opname_type, ofn.grand_total_final AS opname_grand_total_final,
            ofn.grand_total_opname AS opname_grand_total_opname, ofn.grand_total_rab AS opname_grand_total_rab,
            ofn.created_at AS opname_created_at, ofn.pemberi_persetujuan_koordinator AS opname_coord_name,
            ofn.waktu_persetujuan_koordinator AS opname_coord_at,
            ofn.pemberi_persetujuan_manager AS opname_manager_name,
            ofn.waktu_persetujuan_manager AS opname_manager_at,
            ofn.pemberi_persetujuan_direktur AS opname_director_name,
            ofn.waktu_persetujuan_direktur AS opname_director_at,
            ofn.hari_denda AS opname_hari_denda, ofn.nilai_denda AS opname_nilai_denda,
            ofn.tanggal_akhir_spk_denda AS opname_tanggal_akhir_spk_denda,
            ofn.tanggal_serah_terima_denda AS opname_tanggal_st_denda,
            ofn.link_pdf_opname AS opname_pdf,
            st.created_at AS st_created_at, st.link_pdf AS st_pdf,
            km.tanggal_notaris_start, km.tanggal_notaris_end, km.persentase_temuan, km.deviasi_pe
        FROM toko t
        LEFT JOIN latest_rab r ON r.id_toko = t.id
        LEFT JOIN latest_spk ps ON ps.id_toko = t.id
        LEFT JOIN latest_tambah pt ON pt.id_toko = t.id
        LEFT JOIN latest_il il ON il.id_toko = t.id
        LEFT JOIN latest_opname ofn ON ofn.id_toko = t.id
        LEFT JOIN latest_st st ON st.id_toko = t.id
        LEFT JOIN latest_pic pic ON UPPER(TRIM(pic.nomor_ulok)) = UPPER(TRIM(t.nomor_ulok))
        LEFT JOIN toko_kpi_metrics km ON km.id_toko = t.id
        WHERE ${scoped.where}
        ORDER BY t.nomor_ulok, t.id
    `;
    const result = await pool.query<PerformanceKpiRawRow>(sql, scoped.params);
    const aliases = await loadIdentityAliasMaps();
    const facts = buildPerformanceKpiFacts(result.rows).map((fact) => normalizeFactPeople(fact, aliases));
    return filterFactsByPeople(facts, query, aliases);
};

const getCardValue = (fact: PerformanceKpiFact, cardType: PerformanceKpiCardType): number | null => {
    switch (cardType) {
        case "cost_m2": return fact.values.costM2Terbangun;
        case "jhk": return fact.values.jhkDays;
        case "denda": return fact.values.dendaValue;
        case "kerja_tambah": return fact.values.kerjaTambah;
        case "kerja_kurang": return fact.values.kerjaKurang;
        case "ketepatan_st": return fact.values.ketepatanStDays;
        case "sla_ktk": return fact.values.slaKtkDays;
        case "sla_approval": return avg(fact.approvals.map((event) => event.durationDays));
        default: return null;
    }
};

const formatNumber = (value: number | null) => value === null ? "-" : String(Number(value.toFixed(2)));
const weightedAverage = (items: Array<{ numerator: number | null | undefined; denominator: number | null | undefined }>): number | null => {
    let numeratorTotal = 0;
    let denominatorTotal = 0;
    for (const item of items) {
        if (typeof item.numerator !== "number" || !Number.isFinite(item.numerator)) continue;
        if (typeof item.denominator !== "number" || !Number.isFinite(item.denominator) || item.denominator <= 0) continue;
        numeratorTotal += item.numerator;
        denominatorTotal += item.denominator;
    }
    return denominatorTotal > 0 ? numeratorTotal / denominatorTotal : null;
};

const aggregateCostM2 = (facts: PerformanceKpiFact[]) => {
    const rows = facts.flatMap((fact) => fact.rows);
    return {
        terbangun: weightedAverage(rows.map((row) => ({
            numerator: row.opnameFinalTotal ?? row.spkTotal,
            denominator: row.luasBangunan !== null || row.luasTerbuka !== null
                ? (row.luasBangunan ?? 0) + ((row.luasTerbuka ?? 0) / 2)
                : null
        }))),
        bangunan: weightedAverage(rows.map((row) => ({
            numerator: row.spkTotal !== null ? Math.max(0, row.spkTotal - (row.rabAreaTerbuka ?? 0)) : null,
            denominator: row.luasBangunan
        }))),
        area_terbuka: weightedAverage(rows.map((row) => ({
            numerator: row.rabAreaTerbuka,
            denominator: row.luasTerbuka
        }))),
        count: facts.filter((fact) => fact.values.costM2Terbangun !== null).length
    };
};

const approvalFilter = (query: Pick<PerformanceKpiDrilldownInput, "sla_role" | "sla_doc" | "person_name">) => (event: PerformanceKpiApprovalEvent) => {
    if (query.sla_role && event.role !== query.sla_role) return false;
    if (query.sla_doc && event.document !== query.sla_doc) return false;
    if (query.person_name && !isAll(query.person_name) && normalizeUpper(event.actorName) !== normalizeUpper(query.person_name)) return false;
    return event.durationDays !== null;
};

const matchesPerson = (fact: PerformanceKpiFact, role?: string, person?: string) => {
    if (!person || isAll(person)) return true;
    const targetPerson = normalizeUpper(person);
    
    if (role === "support") return fact.supports.some((name) => normalizeUpper(name) === targetPerson);
    if (role === "coordinator") return fact.coordinators.some((name) => normalizeUpper(name) === targetPerson);
    if (role === "bm_manager" || role === "branch_manager") {
        return fact.approvals.some((a) => a.role === role && normalizeUpper(a.actorName) === targetPerson);
    }
    if (!role) {
        if (fact.supports.some((name) => normalizeUpper(name) === targetPerson)) return true;
        if (fact.coordinators.some((name) => normalizeUpper(name) === targetPerson)) return true;
        if (fact.approvals.some((a) => normalizeUpper(a.actorName) === targetPerson)) return true;
        return false;
    }
    return false;
};

const matchesDrilldown = (fact: PerformanceKpiFact, query: PerformanceKpiDrilldownInput) => {
    if (!matchesPerson(fact, query.person_role, query.person_name)) return false;
    if (query.support_metric) return fact.supports.length > 0;
    if (query.card_type === "all") return true;
    if (query.card_type === "sla_approval") return fact.approvals.some(approvalFilter(query));
    const value = getCardValue(fact, query.card_type);
    return value !== null && (query.card_type !== "denda" || value > 0);
};

const toDrilldownRow = (fact: PerformanceKpiFact, query: PerformanceKpiDrilldownInput) => {
    const value = query.card_type === "sla_approval"
        ? avg(fact.approvals.filter(approvalFilter(query)).map((event) => event.durationDays))
        : getCardValue(fact, query.card_type);

    const bangunan = query.card_type === "cost_m2" ? fact.values.costM2Bangunan : undefined;
    const area_terbuka = query.card_type === "cost_m2" ? fact.values.costM2Terbuka : undefined;

    const scopes = Array.from(new Map(fact.rows.map((row) => {
        const lingkup = normalizeUpper(row.lingkup) || "LAINNYA";
        return [lingkup, {
            lingkup_pekerjaan: lingkup,
            toko_id: row.tokoId,
            project_type: row.projectType,
            has_rab: row.rabTotal !== null,
            has_spk: row.spkTotal !== null,
            has_st: row.stDate !== null,
            has_opname: row.opnameFinalTotal !== null
        }];
    })).values());

    return {
        nomor_ulok: fact.nomorUlok,
        nama_toko: fact.namaToko,
        kode_toko: fact.kodeToko,
        cabang: fact.cabang,
        scopes,
        supports: fact.supports,
        coordinators: fact.coordinators,
        value,
        value_label: formatNumber(value),
        secondary_label: fact.dataQuality.length ? `${fact.dataQuality.length} catatan data` : "Data lengkap",
        data_quality: fact.dataQuality,
        bangunan,
        area_terbuka
    };
};

const metricForSupport = (fact: PerformanceKpiFact, metric: PerformanceKpiTableMetric) => {
    const notarisStart = fact.kpiMetrics.tanggalNotarisStart;
    const notarisEnd = fact.kpiMetrics.tanggalNotarisEnd;
    const latestSpkStart = fact.rows.map((row) => row.spkStart).filter(Boolean).sort().at(-1) ?? null;
    const latestSpkEnd = fact.rows.map((row) => row.spkEndWithExtension).filter(Boolean).sort().at(-1) ?? null;
    const latestSt = fact.rows.map((row) => row.stDate).filter(Boolean).sort().at(-1) ?? null;
    const latestKtkCreated = fact.rows.map((row) => row.ktkCreatedDate).filter(Boolean).sort().at(-1) ?? null;
    switch (metric) {
        case "jhk_notaris_to_end_spk": return notarisStart && latestSpkEnd ? dayDiff(notarisStart, latestSpkEnd) : null;
        case "jhk_notaris_to_start_spk": return notarisStart && latestSpkStart ? dayDiff(notarisStart, latestSpkStart) : null;
        case "persentase_temuan": return fact.kpiMetrics.persentaseTemuan;
        case "ketepatan_st": return fact.values.ketepatanStDays;
        case "deviasi_pe": return fact.kpiMetrics.deviasiPe;
        case "finalisasi_ktk": return latestSt && latestKtkCreated ? dayDiff(latestSt, latestKtkCreated) : null;
        default: return null;
    }
};


const roleLabels: Record<string, string> = {
    support: "Branch Building Support",
    coordinator: "Branch Building Coordinator",
    bm_manager: "Branch Building & Maintenance Manager",
    branch_manager: "Branch Manager"
};

const docLabels: Record<string, string> = {
    rab: "RAB",
    spk: "SPK",
    tambah_spk: "Tambah SPK",
    il: "Instruksi Lapangan",
    ktk: "KTK / Opname Final"
};

const optionStat = (id: string, label: string, values: Array<number | null | undefined>, facts: PerformanceKpiFact[], cardType?: PerformanceKpiCardType): PerformanceKpiOptionStat => {
    let statValue = avg(values);
    let bangunan: number | null = null;
    let area_terbuka: number | null = null;

    if (cardType === "cost_m2") {
        const agg = aggregateCostM2(facts);
        statValue = agg.terbangun;
        bangunan = agg.bangunan;
        area_terbuka = agg.area_terbuka;
    }

    return {
        id,
        label,
        value: statValue,
        count: values.filter((value) => typeof value === "number" && Number.isFinite(value)).length,
        incomplete_count: facts.filter((fact) => fact.dataQuality.length > 0).length,
        ...(cardType === "cost_m2" ? { bangunan, area_terbuka } : {})
    };
};

const cardValueForStats = (fact: PerformanceKpiFact, cardType: PerformanceKpiCardType): number | null => getCardValue(fact, cardType);

const optionFactsByPerson = (facts: PerformanceKpiFact[], role: PerformanceKpiPersonRole, name: string) =>
    facts.filter((fact) => matchesPerson(fact, role, name));

const buildRoleOptionStats = (facts: PerformanceKpiFact[], cardType: PerformanceKpiCardType, roles: Array<PerformanceKpiSlaRole | PerformanceKpiPersonRole>): PerformanceKpiOptionStat[] =>
    roles.map((role) => {
        if (cardType === "sla_approval") {
            const events = facts.flatMap((fact) => fact.approvals).filter((event) => event.role === role && event.durationDays !== null);
            return optionStat(role, roleLabels[role] ?? role, events.map((event) => event.durationDays), facts, cardType);
        }
        const roleFacts = facts.filter((fact) => role === "support" ? fact.supports.length > 0 : fact.coordinators.length > 0);
        return optionStat(role, roleLabels[role] ?? role, roleFacts.map((fact) => cardValueForStats(fact, cardType)), roleFacts, cardType);
    });

const buildPeopleOptionStats = (facts: PerformanceKpiFact[], cardType: PerformanceKpiCardType, selectedRole?: PerformanceKpiSlaRole | PerformanceKpiPersonRole): PerformanceKpiOptionStat[] => {
    if (!selectedRole) return [];
    if (cardType === "sla_approval") {
        const names = Array.from(new Set(facts.flatMap((fact) => fact.approvals.filter((event) => event.role === selectedRole && event.actorName).map((event) => event.actorName as string)))).sort();
        return names.map((name) => {
            const events = facts.flatMap((fact) => fact.approvals).filter((event) => event.role === selectedRole && normalizeUpper(event.actorName) === normalizeUpper(name) && event.durationDays !== null);
            const relatedFacts = facts.filter((fact) => fact.approvals.some((event) => event.role === selectedRole && normalizeUpper(event.actorName) === normalizeUpper(name)));
            return optionStat(name, name, events.map((event) => event.durationDays), relatedFacts, cardType);
        });
    }
    if (selectedRole !== "support" && selectedRole !== "coordinator") return [];
    const names = Array.from(new Set(facts.flatMap((fact) => selectedRole === "support" ? fact.supports : fact.coordinators))).sort();
    return names.map((name) => {
        const personFacts = optionFactsByPerson(facts, selectedRole, name);
        return optionStat(name, name, personFacts.map((fact) => cardValueForStats(fact, cardType)), personFacts, cardType);
    });
};

const buildDocumentOptionStats = (facts: PerformanceKpiFact[], selectedRole?: PerformanceKpiSlaRole | PerformanceKpiPersonRole, selectedName?: string): PerformanceKpiOptionStat[] => {
    if (!selectedRole) return [];
    const events = facts.flatMap((fact) => fact.approvals.map((event) => ({ event, fact }))).filter(({ event }) => {
        if (event.role !== selectedRole || event.durationDays === null) return false;
        if (selectedName && !isAll(selectedName) && normalizeUpper(event.actorName) !== normalizeUpper(selectedName)) return false;
        return true;
    });
    const docs = Array.from(new Set(events.map(({ event }) => event.document))).sort();
    return docs.map((doc) => {
        const docEvents = events.filter(({ event }) => event.document === doc);
        const relatedFacts = Array.from(new Set(docEvents.map(({ fact }) => fact)));
        return optionStat(doc, docLabels[doc] ?? doc, docEvents.map(({ event }) => event.durationDays), relatedFacts);
    });
};
const buildDetail = (fact: PerformanceKpiFact, query: PerformanceKpiDetailInput) => {
    const selectedScope = normalizeUpper(query.lingkup_pekerjaan);
    const scopedRows = selectedScope
        ? fact.rows.filter((row) => normalizeUpper(row.lingkup) === selectedScope)
        : fact.rows;
    const effectiveRows = scopedRows.length ? scopedRows : fact.rows;
    const effectiveFact: PerformanceKpiFact = selectedScope
        ? { ...fact, rows: effectiveRows, values: summarizePerformanceKpiValues(effectiveRows) }
        : fact;
    const approvalEvents = effectiveFact.approvals.filter((event) => {
        if (selectedScope && normalizeUpper(event.lingkup) !== selectedScope) return false;
        if (query.card_type !== "sla_approval") return true;
        if (query.sla_role && event.role !== query.sla_role) return false;
        if (query.sla_doc && event.document !== query.sla_doc) return false;
        return true;
    });
    const documents = effectiveFact.documents.filter((document) => !selectedScope || normalizeUpper(document.lingkup) === selectedScope);

    return {
        nomor_ulok: fact.nomorUlok,
        nama_toko: fact.namaToko,
        kode_toko: fact.kodeToko,
        cabang: fact.cabang,
        alamat: fact.alamat,
        kontraktor: fact.kontraktor,
        supports: fact.supports,
        coordinators: fact.coordinators,
        selected_card: query.card_type,
        selected_scope: selectedScope || null,
        selected_value: getCardValue(effectiveFact, query.card_type),
        sections: {
            cost_m2: {
                terbangun: effectiveFact.values.costM2Terbangun,
                bangunan: effectiveFact.values.costM2Bangunan,
                area_terbuka: effectiveFact.values.costM2Terbuka,
                formula: "pengajuan_spk.grand_total / luas RAB approved terakhir; terbangun = luas_bangunan + 1/2 luas_area_terbuka"
            },
            jhk: {
                avg_days: effectiveFact.values.jhkActualDays,
                avg_target_days: effectiveFact.values.jhkTargetDays,
                scopes: effectiveFact.rows.map((row) => ({
                    lingkup: row.lingkup,
                    project_type: row.projectType,
                    spk_start: row.spkStart,
                    st_date: row.stDate,
                    target_st_date: row.targetStDate,
                    jhk_actual_days: row.jhkActualDays,
                    jhk_target_days: row.jhkTargetDays,
                    extension_days: row.extensionDays,
                    spk_end_with_extension: row.spkEndWithExtension
                }))
            },
            denda: {
                value: effectiveFact.values.dendaValue,
                policy: "nilai representatif terkecil yang positif antar lingkup; nol diabaikan ketika ada nilai positif",
                scopes: effectiveFact.rows.map((row) => ({ lingkup: row.lingkup, hari_denda: row.dendaDays, nilai_denda: row.dendaValue }))
            },
            kerja_tambah_kurang: {
                kerja_tambah: effectiveFact.values.kerjaTambah,
                kerja_kurang: effectiveFact.values.kerjaKurang,
                formula: "Total Nilai Opname Final dikurangi Total Nilai SPK",
                scopes: effectiveFact.rows.map((row) => ({ lingkup: row.lingkup, spk_total: row.spkTotal, opname_final_total: row.opnameFinalTotal }))
            },
            ketepatan_st: {
                days: effectiveFact.values.ketepatanStDays,
                formula: "tanggal serah terima - (akhir SPK setelah tambah + 1 hari)",
                scopes: effectiveFact.rows.map((row) => ({ lingkup: row.lingkup, spk_end_with_extension: row.spkEndWithExtension, st_date: row.stDate }))
            },
            sla_ktk: {
                days: effectiveFact.values.slaKtkDays,
                formula: "Waktu Persetujuan Direktur dikurangi Tanggal Serah Terima",
                director_approval: effectiveFact.rows.map((row) => ({ lingkup: row.lingkup, st_date: row.stDate, ktk_created_date: row.ktkCreatedDate, final_ktk_date: row.finalKtkDate }))
            },
            sla_approval: {
                events: approvalEvents,
                avg_days: avg(approvalEvents.map((event) => event.durationDays))
            },
            support_metrics: {
                jhk_notaris_to_end_spk: metricForSupport(effectiveFact, "jhk_notaris_to_end_spk"),
                jhk_notaris_to_start_spk: metricForSupport(effectiveFact, "jhk_notaris_to_start_spk"),
                persentase_temuan: metricForSupport(effectiveFact, "persentase_temuan"),
                ketepatan_st: metricForSupport(effectiveFact, "ketepatan_st"),
                deviasi_pe: metricForSupport(effectiveFact, "deviasi_pe"),
                finalisasi_ktk: metricForSupport(effectiveFact, "finalisasi_ktk")
            }
        },
        documents,
        data_quality: fact.dataQuality
    };
};

export const performanceKpiService = {
    async getOptionStats(query: PerformanceKpiOptionStatsInput) {
        const facts = await loadFacts(query);
        const selectedRole = query.selected_role;
        const selectedName = query.selected_name;
        const roles = query.card_type === "sla_approval"
            ? (["support", "coordinator", "bm_manager", "branch_manager"] as Array<PerformanceKpiSlaRole | PerformanceKpiPersonRole>)
            : (["support", "coordinator"] as Array<PerformanceKpiSlaRole | PerformanceKpiPersonRole>);
        return {
            roles: buildRoleOptionStats(facts, query.card_type, roles),
            people: buildPeopleOptionStats(facts, query.card_type, selectedRole),
            documents: query.card_type === "sla_approval" ? buildDocumentOptionStats(facts, selectedRole, selectedName) : []
        };
    },
    async getSummary(query: PerformanceKpiQueryInput) {
        const facts = await loadFacts(query);
        const approvalEvents = facts.flatMap((fact) => fact.approvals).filter((event) => event.durationDays !== null);
        const costM2 = aggregateCostM2(facts);
        return {
            cards: {
                sla_approval: {
                    value: avg(approvalEvents.map((event) => event.durationDays)),
                    count: approvalEvents.length,
                    roles: {
                        support: avg(approvalEvents.filter((event) => event.role === "support").map((event) => event.durationDays)),
                        coordinator: avg(approvalEvents.filter((event) => event.role === "coordinator").map((event) => event.durationDays)),
                        bm_manager: avg(approvalEvents.filter((event) => event.role === "bm_manager").map((event) => event.durationDays)),
                        branch_manager: avg(approvalEvents.filter((event) => event.role === "branch_manager").map((event) => event.durationDays))
                    }
                },
                cost_m2: costM2,
                jhk: {
                    value: avg(facts.map((fact) => fact.values.jhkActualDays)),
                    count: facts.filter((fact) => fact.values.jhkActualDays !== null).length,
                    target_value: avg(facts.map((fact) => fact.values.jhkTargetDays)),
                    target_count: facts.filter((fact) => fact.values.jhkTargetDays !== null).length
                },
                denda: {
                    value: avg(facts.map((fact) => fact.values.dendaValue)),
                    sum_value: sum(facts.map((fact) => fact.values.dendaValue)),
                    count: facts.filter((fact) => (fact.values.dendaValue ?? 0) > 0).length
                },
                kerja_tambah: {
                    value: avg(facts.map((fact) => fact.values.kerjaTambah)),
                    sum_value: sum(facts.map((fact) => fact.values.kerjaTambah)),
                    count: facts.filter((fact) => fact.values.kerjaTambah !== null).length
                },
                kerja_kurang: {
                    value: avg(facts.map((fact) => fact.values.kerjaKurang)),
                    sum_value: sum(facts.map((fact) => fact.values.kerjaKurang)),
                    count: facts.filter((fact) => fact.values.kerjaKurang !== null).length
                },
                ketepatan_st: { value: avg(facts.map((fact) => fact.values.ketepatanStDays)), count: facts.filter((fact) => fact.values.ketepatanStDays !== null).length },
                sla_ktk: { value: avg(facts.map((fact) => fact.values.slaKtkDays)), count: facts.filter((fact) => fact.values.slaKtkDays !== null).length }
            },
            meta: {
                total_ulok: facts.length,
                incomplete_ulok: facts.filter((fact) => fact.dataQuality.length > 0).length,
                period: query.period ?? "all",
                basis: "ULOK_GABUNGAN"
            }
        };
    },

    async getFilters(query: PerformanceKpiQueryInput) {
        const facts = await loadFacts(query);
        const approvalActors: Record<string, string[]> = {
            support: [],
            coordinator: [],
            bm_manager: [],
            branch_manager: []
        };
        for (const fact of facts) {
            for (const approval of fact.approvals) {
                if (approval.actorName) {
                    approvalActors[approval.role].push(approval.actorName);
                }
            }
        }

        return {
            cabangs: getPerformanceCabangOptions(facts, query),
            coordinators: Array.from(new Set(facts.flatMap((fact) => fact.coordinators))).sort(),
            supports: Array.from(new Set(facts.flatMap((fact) => fact.supports))).sort(),
            approvalActors: {
                support: Array.from(new Set(approvalActors.support)).sort(),
                coordinator: Array.from(new Set(approvalActors.coordinator)).sort(),
                bm_manager: Array.from(new Set(approvalActors.bm_manager)).sort(),
                branch_manager: Array.from(new Set(approvalActors.branch_manager)).sort(),
            }
        };
    },

    async getDrilldown(query: PerformanceKpiDrilldownInput) {
        const facts = (await loadFacts(query)).filter((fact) => matchesDrilldown(fact, query));
        const rows = facts.map((fact) => toDrilldownRow(fact, query));
        const total = rows.length;
        const page = query.page;
        const limit = query.limit;
        return {
            data: rows.slice((page - 1) * limit, page * limit),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit), basis: "ULOK_GABUNGAN" }
        };
    },

    async getDetail(query: PerformanceKpiDetailInput) {
        const facts = await loadFacts({ ...query, search: query.nomor_ulok });
        const fact = facts.find((item) => normalizeUpper(item.nomorUlok) === normalizeUpper(query.nomor_ulok));
        if (!fact) return null;
        return buildDetail(fact, query);
    },

    async getTable(query: PerformanceKpiQueryInput) {
        const facts = await loadFacts(query);
        const grouped = new Map<string, PerformanceKpiFact[]>();
        for (const fact of facts) {
            for (const support of fact.supports) {
                const rows = grouped.get(support) ?? [];
                rows.push(fact);
                grouped.set(support, rows);
            }
        }

        return Array.from(grouped.entries()).map(([nama_support, supportFacts]) => ({
            nama_support,
            total_ulok: supportFacts.length,
            jhk_notaris_to_end_spk: avg(supportFacts.map((fact) => metricForSupport(fact, "jhk_notaris_to_end_spk"))),
            jhk_notaris_to_start_spk: avg(supportFacts.map((fact) => metricForSupport(fact, "jhk_notaris_to_start_spk"))),
            persentase_temuan: avg(supportFacts.map((fact) => metricForSupport(fact, "persentase_temuan"))),
            ketepatan_st: avg(supportFacts.map((fact) => metricForSupport(fact, "ketepatan_st"))),
            deviasi_pe: avg(supportFacts.map((fact) => metricForSupport(fact, "deviasi_pe"))),
            finalisasi_ktk: avg(supportFacts.map((fact) => metricForSupport(fact, "finalisasi_ktk"))),
            incomplete_ulok: supportFacts.filter((fact) => fact.dataQuality.length > 0).length
        })).sort((a, b) => a.nama_support.localeCompare(b.nama_support));
    }
};
