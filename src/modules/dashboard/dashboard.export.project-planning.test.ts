import test from "node:test";
import assert from "node:assert/strict";
import { buildProjectPlanningRows } from "./dashboard.export";
import type { DashboardProjectPlanningRow } from "./dashboard.repository";
import { dashboardRepository } from "./dashboard.repository";
import { pool } from "../../db/pool";

test.after(async () => {
    await pool.end();
});

test("Project Planning Export - Column structure and data mapping", async (t) => {
    await t.test("buildProjectPlanningRows maps awal_spk, akhir_spk, and input_branch_building_koordinator_tahap_2", () => {
        const dummyRow: DashboardProjectPlanningRow = {
            id: 999,
            id_toko: 123,
            nomor_ulok: "TEST-ULOK-001",
            nama_toko: "TOKO TEST",
            kode_toko: "T001",
            cabang: "CIKOKOL",
            proyek: "REGULER",
            lingkup_pekerjaan: "SIPIL, ME",
            jenis_proyek: "REGULER",
            estimasi_biaya: "100000000",
            nama_pengaju: "Pengaju Test",
            nama_lokasi: "Lokasi Test",
            jenis_pengajuan: "STANDAR",
            status: "WAITING_BM_APPROVAL_2",
            luas_bangunan: "120",
            luas_area_terbuka: "30",
            luas_area_terbangun: "150",
            luas_gudang: "20",
            luas_area_parkir: "50",
            luas_area_sales: "80",
            created_at: "2026-10-01T08:00:00.000Z",
            bm_approver_email: "bm@sat.co.id",
            bm_waktu_persetujuan: "2026-10-02T09:00:00.000Z",
            pp1_approver_email: "pp1@sat.co.id",
            pp1_waktu_persetujuan: "2026-10-03T10:00:00.000Z",
            bm2_approver_email: null,
            bm2_waktu_persetujuan: null,
            bm_regional_approver_email: null,
            bm_regional_waktu_persetujuan: null,
            pp2_approver_email: null,
            pp2_waktu_persetujuan: null,
            pp_manager_approver_email: null,
            pp_manager_waktu_persetujuan: null,
            revisi_bm_tahap_1: "0",
            revisi_pp_tahap_1: "1",
            revisi_bm_tahap_2: "0",
            revisi_bm_regional: "0",
            revisi_pp_tahap_2: "0",
            revisi_pp_manager: "0",
            waktu_send_3d: "2026-10-04T11:00:00.000Z",
            waktu_input_tahap_2: "2026-10-05T14:30:00.000Z",
            awal_spk: "2026-10-10T00:00:00.000Z",
            akhir_spk: "2026-11-10T00:00:00.000Z",
        };

        const result = buildProjectPlanningRows([dummyRow]);
        assert.equal(result.length, 1);
        const row = result[0];

        // 1. Check Awal SPK and Akhir SPK mapping
        assert.equal(row.awal_spk, "10 Oktober 2026");
        assert.equal(row.akhir_spk, "10 November 2026");

        // 2. Check Timestamp Kirim 3D
        assert.equal(row.waktu_send_3d, "4 Oktober 2026");

        // 3. Check Input BBK Tahap 2
        assert.equal(row.input_branch_building_koordinator_tahap_2, "5 Oktober 2026");
    });

    await t.test("buildProjectPlanningRows merges deduplicated ULOK rows correctly", () => {
        const row1: DashboardProjectPlanningRow = {
            id: 101,
            id_toko: 123,
            nomor_ulok: "TEST-ULOK-MERGE",
            nama_toko: "TOKO MERGE",
            kode_toko: "T002",
            cabang: "CIKOKOL",
            proyek: "REGULER",
            lingkup_pekerjaan: "SIPIL",
            jenis_proyek: "REGULER",
            estimasi_biaya: "50000000",
            nama_pengaju: "Pengaju 1",
            nama_lokasi: "Lokasi 1",
            jenis_pengajuan: "STANDAR",
            status: "WAITING_PP_APPROVAL_1",
            luas_bangunan: "100",
            luas_area_terbuka: "20",
            luas_area_terbangun: "120",
            luas_gudang: "10",
            luas_area_parkir: "40",
            luas_area_sales: "70",
            created_at: "2026-10-01T08:00:00.000Z",
            bm_approver_email: null,
            bm_waktu_persetujuan: null,
            pp1_approver_email: null,
            pp1_waktu_persetujuan: null,
            bm2_approver_email: null,
            bm2_waktu_persetujuan: null,
            bm_regional_approver_email: null,
            bm_regional_waktu_persetujuan: null,
            pp2_approver_email: null,
            pp2_waktu_persetujuan: null,
            pp_manager_approver_email: null,
            pp_manager_waktu_persetujuan: null,
            revisi_bm_tahap_1: "0",
            revisi_pp_tahap_1: "0",
            revisi_bm_tahap_2: "0",
            revisi_bm_regional: "0",
            revisi_pp_tahap_2: "0",
            revisi_pp_manager: "0",
            awal_spk: null,
            akhir_spk: null,
            waktu_input_tahap_2: null,
        };

        const row2: DashboardProjectPlanningRow = {
            ...row1,
            id: 102,
            lingkup_pekerjaan: "ME",
            created_at: "2026-10-05T08:00:00.000Z",
            awal_spk: "2026-10-15T00:00:00.000Z",
            akhir_spk: "2026-11-15T00:00:00.000Z",
            waktu_input_tahap_2: "2026-10-08T10:00:00.000Z",
            waktu_send_3d: "2026-10-06T12:00:00.000Z",
        };

        const result = buildProjectPlanningRows([row1, row2]);
        assert.equal(result.length, 1);
        const merged = result[0];

        assert.equal(merged.lingkup_pekerjaan, "SIPIL, ME");
        assert.equal(merged.awal_spk, "15 Oktober 2026");
        assert.equal(merged.akhir_spk, "15 November 2026");
        assert.equal(merged.input_branch_building_koordinator_tahap_2, "8 Oktober 2026");
        assert.equal(merged.waktu_send_3d, "6 Oktober 2026");
    });

    await t.test("findProjectPlanningExportRows query returns new fields from DB", async () => {
        const rows = await dashboardRepository.findProjectPlanningExportRows({
            format: "xlsx",
            actor_role: "SUPER HUMAN",
            actor_cabang: "HEAD OFFICE",
            cabang: "ALL",
            period_mode: "all",
            _is_global_access: true,
        });

        assert.ok(Array.isArray(rows), "Result should be an array");
        assert.ok(rows.length > 0, "Should return project planning rows");

        // Verify that fields exist on the returned row objects
        const sampleWithStage2 = rows.find(r => Boolean(r.waktu_input_tahap_2));
        if (sampleWithStage2) {
            assert.ok(sampleWithStage2.waktu_input_tahap_2, "waktu_input_tahap_2 should be populated");
        }

        const sampleWithSpk = rows.find(r => Boolean(r.awal_spk));
        if (sampleWithSpk) {
            assert.ok(sampleWithSpk.awal_spk, "awal_spk should be populated");
            assert.ok(sampleWithSpk.akhir_spk, "akhir_spk should be populated");
        }
    });

    await t.test("exportDashboard generates XLSX with correct column order and headers", async () => {
        const XLSX = await import("xlsx");
        const { dashboardService } = await import("./dashboard.service");

        const result = await dashboardService.exportDashboard({
            format: "xlsx",
            actor_role: "SUPER HUMAN",
            actor_cabang: "HEAD OFFICE",
            cabang: "ALL",
            period_mode: "all",
            data_types: "project_planning",
            _is_global_access: true,
        });

        assert.ok(result.buffer, "Export should produce a buffer");
        assert.ok(result.filename.endsWith(".xlsx"), "Filename should have .xlsx extension");

        const workbook = XLSX.read(result.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

        // Row 0 or 1 is the header row
        const headers = rows[0] as string[];

        // 1. Verify "Lingkup Pekerjaan" is followed by "Awal SPK" and "Akhir SPK"
        const lingkupIdx = headers.indexOf("Lingkup Pekerjaan");
        assert.ok(lingkupIdx !== -1, "Lingkup Pekerjaan header should exist");
        assert.equal(headers[lingkupIdx + 1], "Awal SPK");
        assert.equal(headers[lingkupIdx + 2], "Akhir SPK");

        // 2. Verify "Jumlah Revisi PP Tahap 1" is followed by "Timestamp Kirim 3D"
        const revisiPp1Idx = headers.indexOf("Jumlah Revisi PP Tahap 1");
        assert.ok(revisiPp1Idx !== -1, "Jumlah Revisi PP Tahap 1 header should exist");
        assert.equal(headers[revisiPp1Idx + 1], "Timestamp Kirim 3D");

        // 3. Verify "Timestamp Kirim 3D" is followed by "Input Branch Building Koordinator Tahap 2"
        const kirim3dIdx = headers.indexOf("Timestamp Kirim 3D");
        assert.equal(headers[kirim3dIdx + 1], "Input Branch Building Koordinator Tahap 2");

        // 4. Verify "Input Branch Building Koordinator Tahap 2" is followed by "Tanggal Persetujuan B&M Tahap 2"
        const inputBbkIdx = headers.indexOf("Input Branch Building Koordinator Tahap 2");
        assert.equal(headers[inputBbkIdx + 1], "Tanggal Persetujuan B&M Tahap 2");
    });
});

