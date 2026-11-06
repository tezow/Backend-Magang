import test from "node:test";
import assert from "node:assert/strict";
import {
    getDashboardV2RabContractValue,
    getDashboardV2Stage,
    isDashboardV2OpnameParsialKtkProcess,
    isDashboardV2PastSla,
    matchesDashboardV2JobType
} from "./dashboard-v2.rules";

const baseProject: any = {
    toko: {
        id: 1,
        nomor_ulok: "MZ01-0708-0009",
        nama_toko: "SIMP. SULFAT",
        cabang: "MALANG",
        proyek: "Reguler",
        lingkup_pekerjaan: "SIPIL"
    },
    rab: [],
    gantt: [],
    spk: [],
    pic_pengawasan: null,
    pengawasan_pdf_pending: [],
    instruksi_lapangan: [],
    opname_final: [],
    berkas_serah_terima: [],
    project_planning: []
};

test("job type filter matches reguler and renovasi", () => {
    assert.equal(matchesDashboardV2JobType(baseProject, "REGULER"), true);
    assert.equal(matchesDashboardV2JobType({ ...baseProject, toko: { ...baseProject.toko, proyek: "Renovasi Toko" } }, "RENOVASI"), true);
});

test("Proses Gantt is excluded from SLA attention", () => {
    const project = {
        ...baseProject,
        rab: [{ status: "MENUNGGU GANTT CHART", created_at: "2026-08-01" }]
    };
    assert.equal(getDashboardV2Stage(project), "Proses Gantt");
    assert.equal(isDashboardV2PastSla(project, "Proses Gantt", new Date(2026, 7, 8)), false);
});

test("opname parsial Proses KTK stays ongoing", () => {
    const project = {
        ...baseProject,
        spk: [{ status: "SPK_APPROVED", waktu_mulai: "2026-08-01", durasi: 35, pertambahan_spk: [] }],
        opname_final: [{ status_opname_final: "Proses KTK", created_at: "2026-08-05" }]
    };
    assert.equal(isDashboardV2OpnameParsialKtkProcess("Proses KTK"), true);
    assert.equal(getDashboardV2Stage(project), "Ongoing");
});

test("RAB contract value uses grand_total_final and returns zero when missing", () => {
    assert.equal(getDashboardV2RabContractValue({ ...baseProject, rab: [{ grand_total_final: "160694700" }] }), 160694700);
    assert.equal(getDashboardV2RabContractValue(baseProject), 0);
});
