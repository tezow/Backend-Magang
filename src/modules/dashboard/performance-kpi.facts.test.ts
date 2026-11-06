import test from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceKpiFacts, dayDiff, parseNumber } from "./performance-kpi.facts";
import type { PerformanceKpiRawRow } from "./performance-kpi.types";

const baseRow = (overrides: Partial<PerformanceKpiRawRow> = {}): PerformanceKpiRawRow => ({
    toko_id: 1,
    nomor_ulok: "LZ01-2603-0001",
    lingkup_pekerjaan: "SIPIL",
    proyek: "Reguler",
    nama_toko: "TOKO SAMPLE",
    kode_toko: "T001",
    cabang: "LAMPUNG",
    alamat: "Jl Sample",
    nama_kontraktor: "PT SAMPLE",
    support_name: "SUPPORT A",
    support_created_at: null,
    rab_id: 10,
    rab_status: "Disetujui",
    rab_grand_total_final: "100000000",
    rab_luas_bangunan: "100",
    rab_luas_terbuka: "40",
    rab_created_at: "2026-08-01T00:00:00.000Z",
    rab_coord_name: "COORD A",
    rab_coord_at: "2026-08-02T00:00:00.000Z",
    rab_manager_name: "MANAGER A",
    rab_manager_at: "2026-08-04T00:00:00.000Z",
    rab_pdf_gabungan: "rab.pdf",
    rab_pdf_non_sbo: null,
    rab_pdf_rekap: null,
    rab_pdf_sph: null,
    rab_pdf_materai: null,
    spk_id: 20,
    spk_nomor: "SPK-1",
    spk_status: "SPK_APPROVED",
    spk_grand_total: 120000000,
    spk_created_at: "2026-08-05T00:00:00.000Z",
    spk_start: "2026-08-10",
    spk_end: "2026-08-20",
    spk_duration: 10,
    spk_approver: "BRANCH MANAGER",
    spk_approved_at: "2026-08-06T00:00:00.000Z",
    spk_pdf: "spk.pdf",
    tambah_spk_id: 30,
    tambah_spk_days: "2",
    tambah_spk_old_end: "2026-08-20",
    tambah_spk_new_end: "2026-08-22",
    tambah_spk_created_at: "2026-08-21T00:00:00.000Z",
    tambah_spk_approver: "BRANCH MANAGER",
    tambah_spk_approved_at: "2026-08-22T00:00:00.000Z",
    tambah_spk_pdf: "tambah.pdf",
    tambah_spk_lampiran: null,
    il_id: 40,
    il_status: "Disetujui",
    il_grand_total_final: "5000000",
    il_created_at: "2026-08-11T00:00:00.000Z",
    il_coord_name: "COORD A",
    il_coord_at: "2026-08-12T00:00:00.000Z",
    il_manager_name: "MANAGER A",
    il_manager_at: "2026-08-13T00:00:00.000Z",
    il_pdf_gabungan: "il.pdf",
    il_pdf_non_sbo: null,
    il_pdf_rekap: null,
    il_lampiran: null,
    opname_id: 50,
    opname_status: "Disetujui",
    opname_type: "FINAL",
    opname_grand_total_final: "130000000",
    opname_grand_total_opname: "130000000",
    opname_grand_total_rab: "100000000",
    opname_created_at: "2026-08-24T00:00:00.000Z",
    opname_coord_name: "COORD A",
    opname_coord_at: "2026-08-25T00:00:00.000Z",
    opname_manager_name: "MANAGER A",
    opname_manager_at: "2026-08-26T00:00:00.000Z",
    opname_director_name: "DIREKTUR KONTRAKTOR",
    opname_director_at: "2026-08-27T00:00:00.000Z",
    opname_hari_denda: 3,
    opname_nilai_denda: 500000,
    opname_tanggal_akhir_spk_denda: "2026-08-22",
    opname_tanggal_st_denda: "2026-08-25",
    opname_pdf: "ktk.pdf",
    st_created_at: "2026-08-25T00:00:00.000Z",
    st_pdf: "st.pdf",
    tanggal_notaris_start: null,
    tanggal_notaris_end: null,
    persentase_temuan: null,
    deviasi_pe: null,
    ...overrides
});

test("parseNumber tolerates formatted rupiah-like values", () => {
    assert.equal(parseNumber("Rp 1,250,000"), 1250000);
    assert.equal(parseNumber(""), null);
});

test("dayDiff returns positive and negative calendar day deltas", () => {
    assert.equal(dayDiff("2026-08-10", "2026-08-12"), 2);
    assert.equal(dayDiff("2026-08-12", "2026-08-10"), -2);
});

test("cost/m2 uses SPK final and approved RAB areas including terbangun formula", () => {
    const [fact] = buildPerformanceKpiFacts([baseRow()]);
    assert.equal(fact.values.costM2Terbangun, 1000000);
    assert.equal(fact.values.costM2Bangunan, 1200000);
    assert.equal(fact.values.costM2Terbuka, 3000000);
});

test("denda chooses smallest positive value across scopes and ignores zero", () => {
    const rows = [
        baseRow({ toko_id: 1, lingkup_pekerjaan: "SIPIL", opname_nilai_denda: 0 }),
        baseRow({ toko_id: 2, lingkup_pekerjaan: "ME", opname_nilai_denda: 250000 }),
        baseRow({ toko_id: 3, lingkup_pekerjaan: "SIGNAGE", opname_nilai_denda: 600000 })
    ];
    const [fact] = buildPerformanceKpiFacts(rows);
    assert.equal(fact.values.dendaValue, 250000);
});

test("ketepatan ST is ST minus extended SPK end plus one day tolerance", () => {
    const [late] = buildPerformanceKpiFacts([baseRow({ tambah_spk_new_end: "2026-08-22", st_created_at: "2026-08-25T00:00:00.000Z" })]);
    const [early] = buildPerformanceKpiFacts([baseRow({ tambah_spk_new_end: "2026-08-22", st_created_at: "2026-08-20T00:00:00.000Z" })]);
    assert.equal(late.values.ketepatanStDays, 2);
    assert.equal(early.values.ketepatanStDays, -3);
});

test("JHK actual excludes SPK target duration when serah terima is missing", () => {
    const [fact] = buildPerformanceKpiFacts([baseRow({
        st_created_at: null,
        st_pdf: null,
        spk_start: "2026-08-10",
        spk_end: "2026-08-20",
        spk_duration: 10
    })]);
    assert.equal(fact.values.jhkActualDays, null);
    assert.equal(fact.values.jhkDays, null);
    assert.equal(fact.values.jhkTargetDays, 14);
    assert.ok(fact.dataQuality.includes("TARGET_ST_USED"));
});

test("SLA KTK uses director approval minus serah terima date", () => {
    const [fact] = buildPerformanceKpiFacts([baseRow({ st_created_at: "2026-08-25T00:00:00.000Z", opname_director_at: "2026-08-29T00:00:00.000Z" })]);
    assert.equal(fact.values.slaKtkDays, 4);
});

test("approval events exclude contractor and include internal SAT roles", () => {
    const [fact] = buildPerformanceKpiFacts([baseRow()]);
    assert.ok(fact.approvals.some((event) => event.role === "coordinator" && event.document === "rab"));
    assert.ok(fact.approvals.some((event) => event.role === "branch_manager" && event.document === "spk"));
    assert.equal(fact.approvals.some((event) => event.actorName === "DIREKTUR KONTRAKTOR"), false);
});

test("KTK support approval uses PIC support instead of coordinator actor", () => {
    const [fact] = buildPerformanceKpiFacts([baseRow({
        support_name: "SUPPORT B",
        opname_coord_name: "COORD KTK"
    })]);
    const supportKtk = fact.approvals.find((event) => event.role === "support" && event.document === "ktk");
    assert.equal(supportKtk?.actorName, "SUPPORT B");
});
