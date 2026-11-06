import test from "node:test";
import assert from "node:assert/strict";
import {
    buildDashboardKpiFacts,
    metricValueForKpiType,
    summarizeDashboardKpiFacts,
    toKpiNumber,
} from "./dashboard-kpi.facts";
import type { DashboardKpiSourceRow } from "./dashboard-kpi.types";

const row = (overrides: Partial<DashboardKpiSourceRow>): DashboardKpiSourceRow => ({
    toko_id: 1,
    nomor_ulok: "LZ01-2603-0001",
    nama_toko: "Lintas Simpang Pematang",
    kode_toko: "L001",
    cabang: "LAMPUNG",
    lingkup_pekerjaan: "SIPIL",
    rab_id: 10,
    rab_status: "Disetujui",
    rab_grand_total_final: "100000000",
    rab_luas_bangunan: "100",
    rab_created_at: "2026-01-01T00:00:00.000Z",
    rab_waktu_persetujuan_koordinator: "2026-01-02T00:00:00.000Z",
    rab_waktu_persetujuan_manager: "2026-01-04T00:00:00.000Z",
    rab_waktu_persetujuan_direktur: "2026-01-07T00:00:00.000Z",
    rab_pemberi_persetujuan_koordinator: "Koordinator A",
    spk_id: 20,
    spk_status: "SPK_APPROVED",
    spk_durasi: 10,
    spk_waktu_mulai: "2026-01-10",
    spk_waktu_selesai: "2026-01-20",
    pertambahan_akhir_setelah_perpanjangan: null,
    opname_id: 30,
    opname_status: "DISETUJUI",
    opname_created_at: "2026-01-25T00:00:00.000Z",
    opname_grand_total_final: "120000000",
    opname_grand_total_opname: "120000000",
    opname_grand_total_rab: "100000000",
    opname_tanggal_akhir_spk_denda: "2026-01-20",
    opname_tanggal_serah_terima_denda: "2026-01-23",
    opname_hari_denda: 3,
    opname_nilai_denda: "3000000",
    st_created_at: "2026-01-23T00:00:00.000Z",
    st_link_pdf: "https://drive.google.com/file/d/example/view",
    plc_building_support: "Support A",
    ...overrides,
});

test("toKpiNumber parses Indonesian numeric text safely", () => {
    assert.equal(toKpiNumber("1.234.567"), 1234567);
    assert.equal(toKpiNumber("123,45"), 123.45);
    assert.equal(toKpiNumber(null), 0);
    assert.equal(toKpiNumber("abc"), 0);
});

test("buildDashboardKpiFacts combines SIPIL and ME into one ULOK fact", () => {
    const facts = buildDashboardKpiFacts([
        row({ toko_id: 1, lingkup_pekerjaan: "SIPIL", rab_grand_total_final: "100000000", opname_grand_total_opname: "120000000" }),
        row({ toko_id: 2, lingkup_pekerjaan: "ME", rab_id: 11, spk_id: 21, opname_id: 31, rab_grand_total_final: "50000000", opname_grand_total_final: null, opname_grand_total_opname: "40000000", plc_building_support: "Support B" }),
    ]);

    assert.equal(facts.length, 1);
    assert.equal(facts[0].rab_approved_total, 150000000);
    assert.equal(facts[0].opname_total, 160000000);
    assert.equal(facts[0].kerja_tambah_amount, 10000000);
    assert.deepEqual(facts[0].job_types.sort(), ["ME", "SIPIL"]);
    assert.deepEqual(facts[0].building_supports.sort(), ["Support A", "Support B"]);
});

test("buildDashboardKpiFacts does not duplicate same RAB/SPK/opname row", () => {
    const duplicate = row({});
    const facts = buildDashboardKpiFacts([duplicate, duplicate]);

    assert.equal(facts.length, 1);
    assert.equal(facts[0].rab_approved_total, 100000000);
    assert.equal(facts[0].rab_approved_count, 1);
    assert.equal(facts[0].official_penalty_amount, 3000000);
});

test("summary uses valid denominators and exposes incomplete counts", () => {
    const facts = buildDashboardKpiFacts([
        row({ nomor_ulok: "A", rab_luas_bangunan: "100", rab_grand_total_final: "100000000" }),
        row({ nomor_ulok: "B", rab_luas_bangunan: "", rab_grand_total_final: "50000000" }),
    ]);
    const summary = summarizeDashboardKpiFacts(facts);

    assert.equal(summary.basis, "ULOK_GABUNGAN");
    assert.equal(summary.total_ulok, 2);
    assert.equal(summary.avg_cost_m2, 1000000);
    assert.equal(summary.metrics.cost_m2.valid_count, 1);
    assert.equal(summary.metrics.cost_m2.incomplete_count, 1);
    assert.equal(summary.metrics.sla_coord.valid_count, 2);
    assert.equal(summary.metrics.kerja_tambah.valid_count, 2);
});

test("metricValueForKpiType returns the card-specific value", () => {
    const [fact] = buildDashboardKpiFacts([row({})]);

    assert.equal(metricValueForKpiType(fact, "cost_m2"), 1000000);
    assert.equal(metricValueForKpiType(fact, "denda"), 3000000);
    assert.equal(metricValueForKpiType(fact, "keterlambatan"), 3);
    assert.equal(metricValueForKpiType(fact, "sla_coord"), 1);
    assert.equal(metricValueForKpiType(fact, "sla_bm"), 2);
    assert.equal(metricValueForKpiType(fact, "sla_branch_manager"), 3);
    assert.equal(metricValueForKpiType(fact, "ketepatan_st"), 2);
    assert.equal(metricValueForKpiType(fact, "kerja_tambah"), 20000000);
    assert.equal(metricValueForKpiType(fact, "kerja_kurang"), 0);
});
