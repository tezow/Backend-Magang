import type {
    PerformanceKpiApprovalEvent,
    PerformanceKpiDocument,
    PerformanceKpiDocumentLink,
    PerformanceKpiFact,
    PerformanceKpiRawRow,
    PerformanceKpiScopeRow,
    PerformanceKpiSlaRole
} from "./performance-kpi.types";

import { calculateEffectiveStDate } from "../../common/national-holidays";
const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeName = (value: unknown): string => String(value ?? "").trim();
export const normalizeUpper = (value: unknown): string => normalizeName(value).toUpperCase();

export const parseNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};

export const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

export const toIso = (value: unknown): string | null => {
    const date = toDate(value);
    return date ? date.toISOString() : null;
};

export const dayDiff = (start: unknown, end: unknown): number | null => {
    const startDate = toDate(start);
    const endDate = toDate(end);
    if (!startDate || !endDate) return null;
    return Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_MS);
};

const average = (values: Array<number | null | undefined>): number | null => {
    const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const sum = (values: Array<number | null | undefined>): number | null => {
    const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!valid.length) return null;
    return valid.reduce((acc, value) => acc + value, 0);
};

const latestDate = (values: Array<unknown>): string | null => {
    const dates = values.map(toDate).filter((date): date is Date => Boolean(date));
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
};

const firstValue = <T>(values: Array<T | null | undefined>): T | null => {
    for (const value of values) {
        if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
    return null;
};

const addUnique = (items: Set<string>, value: unknown) => {
    const normalized = normalizeName(value);
    if (normalized) items.add(normalized);
};

const classifyProjectType = (value: unknown): "REGULER" | "RENOVASI" | "UNKNOWN" => {
    const normalized = normalizeUpper(value);
    if (normalized === "REGULER" || normalized === "ALFAMART REGULER") return "REGULER";
    if (normalized.includes("RENOVASI") || normalized.includes("PERBAIKAN") || normalized.includes("PEREMAJAAN")) return "RENOVASI";
    return "UNKNOWN";
};

const getTargetStDate = (spkEndWithExtension: string | null): string | null => {
    const endDate = toDate(spkEndWithExtension);
    if (!endDate) return null;
    return calculateEffectiveStDate(endDate).effectiveStDate.toISOString();
};

const addDocument = (documents: PerformanceKpiDocumentLink[], seen: Set<string>, type: PerformanceKpiDocumentLink["type"], label: string, url: unknown, source: string, lingkup?: string | null) => {
    const link = normalizeName(url);
    if (!link) return;
    const key = `${type}:${link}`;
    if (seen.has(key)) return;
    seen.add(key);
    documents.push({ type, label, url: link, source, lingkup: normalizeName(lingkup) || null });
};

const addApproval = (
    approvals: PerformanceKpiApprovalEvent[],
    role: PerformanceKpiSlaRole,
    document: PerformanceKpiDocument,
    label: string,
    lingkup: unknown,
    actorName: unknown,
    startAt: unknown,
    approvedAt: unknown,
    source: string
) => {
    const approved = toIso(approvedAt);
    if (!approved) return;
    approvals.push({
        role,
        document,
        label,
        lingkup: normalizeName(lingkup) || null,
        actorName: normalizeName(actorName) || null,
        startAt: toIso(startAt),
        approvedAt: approved,
        durationDays: dayDiff(startAt, approvedAt),
        source
    });
};

const getScopeRow = (row: PerformanceKpiRawRow): PerformanceKpiScopeRow => {
    const spkEndWithExtension = toIso(row.tambah_spk_new_end) ?? toIso(row.spk_end);
    const spkTotal = parseNumber(row.spk_grand_total);
    const opnameTotal = parseNumber(row.opname_grand_total_final) ?? parseNumber(row.opname_grand_total_opname);
    const stDate = toIso(row.st_created_at);
    const targetStDate = stDate ? null : getTargetStDate(spkEndWithExtension);
    const jhkActualDays = row.spk_start && stDate ? dayDiff(row.spk_start, stDate) : null;
    const jhkTargetDays = row.spk_start && targetStDate ? dayDiff(row.spk_start, targetStDate) : null;

    const rawLuasBangunan = parseNumber(row.rab_luas_bangunan);
    const luasBangunan = rawLuasBangunan && rawLuasBangunan < 10000 ? rawLuasBangunan : null;
    const rawLuasTerbuka = parseNumber(row.rab_luas_terbuka);
    const luasTerbuka = rawLuasTerbuka && rawLuasTerbuka < 10000 ? rawLuasTerbuka : null;

    return {
        tokoId: row.toko_id,
        lingkup: row.lingkup_pekerjaan,
        supportName: normalizeName(row.support_name) || null,
        projectType: classifyProjectType(row.proyek),
        spkTotal,
        spkStart: toIso(row.spk_start),
        spkEnd: toIso(row.spk_end),
        spkEndWithExtension,
        spkDurationDays: jhkActualDays,
        jhkActualDays,
        jhkTargetDays,
        targetStDate,
        extensionDays: parseNumber(row.tambah_spk_days),
        rabTotal: parseNumber(row.rab_grand_total_final),
        luasBangunan,
        luasTerbuka,
        rabAreaTerbuka: parseNumber(row.rab_area_terbuka),
        opnameFinalTotal: opnameTotal,
        dendaValue: parseNumber(row.opname_nilai_denda),
        dendaDays: row.opname_hari_denda ?? null,
        stDate,
        ktkCreatedDate: toIso(row.opname_created_at),
        finalKtkDate: toIso(row.opname_director_at)
    };
};

export const summarizePerformanceKpiValues = (rows: PerformanceKpiScopeRow[]) => {
    const spkTotal = average(rows.map((row) => row.spkTotal));
    const luasBangunan = average(rows.map((row) => row.luasBangunan));
    const luasTerbuka = average(rows.map((row) => row.luasTerbuka));
    const rabAreaTerbuka = average(rows.map((row) => row.rabAreaTerbuka));
    const opnameFinalTotal = average(rows.map((row) => row.opnameFinalTotal));
    const luasTerbangun = luasBangunan !== null || luasTerbuka !== null ? (luasBangunan ?? 0) + ((luasTerbuka ?? 0) / 2) : null;

    const positiveDenda = rows
        .map((row) => row.dendaValue)
        .filter((value): value is number => typeof value === "number" && value > 0);
    const dendaValue = positiveDenda.length ? Math.min(...positiveDenda) : null;

    const deltas = rows
        .map((row) => row.opnameFinalTotal !== null && row.spkTotal !== null ? row.opnameFinalTotal - row.spkTotal : null)
        .filter((value): value is number => typeof value === "number" && value !== 0);
    const tambah = deltas.filter((value) => value > 0);
    const kurang = deltas.filter((value) => value < 0).map(Math.abs);

    const stTargetDates = rows.map((row) => row.spkEndWithExtension).filter(Boolean);
    const stDates = rows.map((row) => row.stDate).filter(Boolean);
    const latestStTarget = latestDate(stTargetDates);
    const latestSt = latestDate(stDates);
    const ketepatanRaw = latestStTarget && latestSt ? dayDiff(latestStTarget, latestSt) : null;
    const ketepatanStDays = ketepatanRaw === null ? null : ketepatanRaw - 1;

    const finalKtkDate = latestDate(rows.map((row) => row.finalKtkDate));
    const slaKtkDays = latestSt && finalKtkDate ? dayDiff(latestSt, finalKtkDate) : null;

    return {
        costM2Terbangun: opnameFinalTotal !== null && luasTerbangun && luasTerbangun > 0 ? opnameFinalTotal / luasTerbangun : null,
        costM2Bangunan: spkTotal !== null && luasBangunan && luasBangunan > 0 ? Math.max(0, spkTotal - (rabAreaTerbuka ?? 0)) / luasBangunan : null,
        costM2Terbuka: rabAreaTerbuka !== null && luasTerbuka && luasTerbuka > 0 ? rabAreaTerbuka / luasTerbuka : null,
        jhkDays: average(rows.map((row) => row.jhkActualDays)),
        jhkActualDays: average(rows.map((row) => row.jhkActualDays)),
        jhkTargetDays: average(rows.map((row) => row.jhkTargetDays)),
        dendaValue,
        kerjaTambah: tambah.length ? average(tambah) : null,
        kerjaKurang: kurang.length ? average(kurang) : null,
        ketepatanStDays,
        slaKtkDays
    };
};

const qualityFlags = (fact: Pick<PerformanceKpiFact, "values" | "kpiMetrics" | "rows" | "approvals">): string[] => {
    const flags: string[] = [];
    if (fact.values.costM2Terbangun === null) flags.push("MISSING_COST_M2_SOURCE");
    if (fact.values.jhkActualDays === null && fact.values.jhkTargetDays === null) flags.push("MISSING_JHK_SOURCE");
    if (fact.rows.some((row) => row.jhkTargetDays !== null)) flags.push("TARGET_ST_USED");
    if (fact.values.ketepatanStDays === null) flags.push("MISSING_ST_OR_SPK_END");
    if (fact.values.slaKtkDays === null) flags.push("MISSING_KTK_DIRECTOR_OR_ST");
    if (fact.kpiMetrics.tanggalNotarisStart === null) flags.push("NOTARIS_NOT_INPUT");
    if (fact.kpiMetrics.persentaseTemuan === null) flags.push("TEMUAN_NOT_INPUT");
    if (fact.kpiMetrics.deviasiPe === null) flags.push("DEVIASI_PE_NOT_INPUT");
    if (!fact.approvals.length) flags.push("NO_APPROVAL_TIMESTAMPS");
    return flags;
};

export const buildPerformanceKpiFacts = (sourceRows: PerformanceKpiRawRow[]): PerformanceKpiFact[] => {
    const grouped = new Map<string, PerformanceKpiRawRow[]>();
    for (const row of sourceRows) {
        const key = normalizeName(row.nomor_ulok);
        if (!key) continue;
        const rows = grouped.get(key) ?? [];
        rows.push(row);
        grouped.set(key, rows);
    }

    return Array.from(grouped.entries()).map(([nomorUlok, rawRows]) => {
        const first = rawRows[0];
        const supportSet = new Set<string>();
        const coordSet = new Set<string>();
        const documents: PerformanceKpiDocumentLink[] = [];
        const docSeen = new Set<string>();
        const approvals: PerformanceKpiApprovalEvent[] = [];
        const scopeRows = rawRows.map(getScopeRow);

        for (const row of rawRows) {
            addUnique(supportSet, row.support_name);
            addUnique(coordSet, row.rab_coord_name);
            addUnique(coordSet, row.il_coord_name);
            addUnique(coordSet, row.opname_coord_name);

            addDocument(documents, docSeen, "rab", "RAB Gabungan", row.rab_pdf_gabungan, "rab.link_pdf_gabungan", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "rab", "RAB Non SBO", row.rab_pdf_non_sbo, "rab.link_pdf_non_sbo", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "rab", "RAB Rekapitulasi", row.rab_pdf_rekap, "rab.link_pdf_rekapitulasi", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "sph", "SPH", row.rab_pdf_sph, "rab.link_pdf_sph", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "rab", "RAB Materai", row.rab_pdf_materai, "rab.link_pdf_materai", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "spk", "SPK", row.spk_pdf, "pengajuan_spk.link_pdf", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "tambah_spk", "Tambah SPK", row.tambah_spk_pdf, "pertambahan_spk.link_pdf", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "lampiran", "Lampiran Tambah SPK", row.tambah_spk_lampiran, "pertambahan_spk.link_lampiran_pendukung", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "il", "Instruksi Lapangan Gabungan", row.il_pdf_gabungan, "instruksi_lapangan.link_pdf_gabungan", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "il", "Instruksi Lapangan Non SBO", row.il_pdf_non_sbo, "instruksi_lapangan.link_pdf_non_sbo", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "il", "Instruksi Lapangan Rekapitulasi", row.il_pdf_rekap, "instruksi_lapangan.link_pdf_rekapitulasi", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "lampiran", "Lampiran IL", row.il_lampiran, "instruksi_lapangan.link_lampiran", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "ktk", "Opname Final / KTK", row.opname_pdf, "opname_final.link_pdf_opname", row.lingkup_pekerjaan);
            addDocument(documents, docSeen, "serah_terima", "Serah Terima", row.st_pdf, "berkas_serah_terima.link_pdf", row.lingkup_pekerjaan);

            addApproval(approvals, "coordinator", "rab", "RAB diketahui Coordinator", row.lingkup_pekerjaan, row.rab_coord_name, row.rab_created_at, row.rab_coord_at, "rab.created_at -> rab.waktu_persetujuan_koordinator");
            addApproval(approvals, "bm_manager", "rab", "RAB disetujui B&M Manager", row.lingkup_pekerjaan, row.rab_manager_name, row.rab_coord_at, row.rab_manager_at, "rab.waktu_persetujuan_koordinator -> rab.waktu_persetujuan_manager");
            addApproval(approvals, "branch_manager", "spk", "SPK disetujui Branch Manager", row.lingkup_pekerjaan, row.spk_approver, row.spk_created_at, row.spk_approved_at, "pengajuan_spk.created_at -> pengajuan_spk.waktu_persetujuan");
            addApproval(approvals, "branch_manager", "tambah_spk", "Tambah SPK disetujui Branch Manager", row.lingkup_pekerjaan, row.tambah_spk_approver, row.tambah_spk_created_at, row.tambah_spk_approved_at, "pertambahan_spk.created_at -> pertambahan_spk.waktu_persetujuan");
            addApproval(approvals, "coordinator", "il", "IL diketahui Coordinator", row.lingkup_pekerjaan, row.il_coord_name, row.il_created_at, row.il_coord_at, "instruksi_lapangan.created_at -> instruksi_lapangan.waktu_persetujuan_koordinator");
            addApproval(approvals, "bm_manager", "il", "IL disetujui B&M Manager", row.lingkup_pekerjaan, row.il_manager_name, row.il_coord_at, row.il_manager_at, "instruksi_lapangan.waktu_persetujuan_koordinator -> instruksi_lapangan.waktu_persetujuan_manager");
            addApproval(approvals, "support", "ktk", "KTK dibuat Support sampai diketahui Coordinator", row.lingkup_pekerjaan, row.support_name, row.opname_created_at, row.opname_coord_at, "opname_final.created_at -> opname_final.waktu_persetujuan_koordinator");
            addApproval(approvals, "coordinator", "ktk", "KTK diketahui Coordinator", row.lingkup_pekerjaan, row.opname_coord_name, row.opname_created_at, row.opname_coord_at, "opname_final.created_at -> opname_final.waktu_persetujuan_koordinator");
            addApproval(approvals, "bm_manager", "ktk", "KTK disetujui B&M Manager", row.lingkup_pekerjaan, row.opname_manager_name, row.opname_coord_at, row.opname_manager_at, "opname_final.waktu_persetujuan_koordinator -> opname_final.waktu_persetujuan_manager");
        }

        const kpiMetrics = {
            tanggalNotarisStart: toIso(firstValue(rawRows.map((row) => row.tanggal_notaris_start))),
            tanggalNotarisEnd: toIso(firstValue(rawRows.map((row) => row.tanggal_notaris_end))),
            persentaseTemuan: parseNumber(firstValue(rawRows.map((row) => row.persentase_temuan))),
            deviasiPe: parseNumber(firstValue(rawRows.map((row) => row.deviasi_pe)))
        };
        const values = summarizePerformanceKpiValues(scopeRows);
        const partial = { rows: scopeRows, approvals, values, kpiMetrics };

        return {
            nomorUlok,
            namaToko: firstValue(rawRows.map((row) => row.nama_toko)),
            kodeToko: firstValue(rawRows.map((row) => row.kode_toko)),
            cabang: firstValue(rawRows.map((row) => row.cabang)),
            alamat: firstValue(rawRows.map((row) => row.alamat)),
            kontraktor: firstValue(rawRows.map((row) => row.nama_kontraktor)),
            supports: Array.from(supportSet).sort((a, b) => a.localeCompare(b)),
            coordinators: Array.from(coordSet).sort((a, b) => a.localeCompare(b)),
            rows: scopeRows,
            approvals,
            documents,
            kpiMetrics,
            values,
            dataQuality: qualityFlags(partial)
        };
    });
};

export const avg = average;
export { sum };
