import assert from "node:assert/strict";
import test from "node:test";
import { calculateDendaFromDates, calculateDendaNominal, DENDA_ACTION_THRESHOLD_DAYS } from "./denda-keterlambatan";

// =====================================================================
// ATURAN DENDA ALFAMART:
//   - Grace period = 1 hari kerja pertama setelah akhir SPK
//   - Denda dihitung per HARI KALENDER (termasuk Sabtu & Minggu)
//
// Contoh kasus:
//   SPK berakhir Kamis 2 Jul → grace = Jumat 3 Jul
//   ST tgl 6 Jul (Senin) → Sabtu(1) + Minggu(2) + Senin(3) = 3 hari = Rp 3jt
// =====================================================================

test("SPK Kamis, ST Senin = 3 hari denda (Sabtu+Minggu+Senin dihitung kalender)", () => {
    // Akhir SPK: Kamis 2 Juli 2026 → grace = Jumat 3 Juli
    // Denda kalender: Sabtu 4 (1) + Minggu 5 (2) + Senin 6 (3) = 3 hari
    const result = calculateDendaFromDates(
        new Date(2026, 6, 2), // Kamis 2 Juli 2026
        new Date(2026, 6, 6)  // Senin 6 Juli 2026
    );
    assert.equal(result.hari_denda, 3, "SPK Kamis → ST Senin = 3 hari denda");
    assert.equal(result.nilai_denda, 3_000_000);
});

test("SPK Kamis, ST Jumat = 0 hari denda (ST masih di grace period)", () => {
    // Grace = Jumat 3 Juli, ST juga Jumat 3 Juli → tidak terlambat
    const result = calculateDendaFromDates(
        new Date(2026, 6, 2), // Kamis 2 Juli
        new Date(2026, 6, 3)  // Jumat 3 Juli (grace day)
    );
    assert.equal(result.hari_denda, 0, "ST di hari grace = 0 denda");
    assert.equal(result.nilai_denda, 0);
});

test("SPK Kamis, ST Sabtu = 1 hari denda", () => {
    const result = calculateDendaFromDates(
        new Date(2026, 6, 2), // Kamis 2 Juli
        new Date(2026, 6, 4)  // Sabtu 4 Juli
    );
    assert.equal(result.hari_denda, 1);
    assert.equal(result.nilai_denda, 1_000_000);
});

test("SPK Kamis, ST Selasa = 4 hari denda (Sabtu+Minggu+Senin+Selasa)", () => {
    const result = calculateDendaFromDates(
        new Date(2026, 6, 2), // Kamis 2 Juli
        new Date(2026, 6, 7)  // Selasa 7 Juli
    );
    assert.equal(result.hari_denda, 4);
    assert.equal(result.nilai_denda, 4_000_000);
});

test("SPK Jumat, ST Senin = 0 hari denda (grace adalah hari kerja berikutnya = Senin)", () => {
    // SPK berakhir Jumat 3 Juli → nextBusinessDayAfter = Senin 6 Juli (skip Sabtu-Minggu)
    // ST juga Senin 6 Juli → tepat di grace → 0 denda
    const result = calculateDendaFromDates(
        new Date(2026, 6, 3), // Jumat 3 Juli
        new Date(2026, 6, 6)  // Senin 6 Juli
    );
    assert.equal(result.hari_denda, 0, "ST di hari grace (Senin) = 0 denda");
    assert.equal(result.nilai_denda, 0);
});

test("SPK Jumat, ST Selasa = 1 hari denda", () => {
    // SPK berakhir Jumat → grace = Senin, ST Selasa = 1 hari kalender setelah Senin
    const result = calculateDendaFromDates(
        new Date(2026, 6, 3), // Jumat 3 Juli
        new Date(2026, 6, 7)  // Selasa 7 Juli
    );
    assert.equal(result.hari_denda, 1);
    assert.equal(result.nilai_denda, 1_000_000);
});

test("SPK Minggu 14 Jun 2026, ST Kamis 18 Jun = 3 hari denda", () => {
    // SPK berakhir Minggu 14 Jun → nextBusinessDayAfter = Senin 15 Jun (grace)
    // Denda kalender: Selasa 16 (1) + Rabu 17 (2) + Kamis 18 (3) = 3 hari
    const result = calculateDendaFromDates(
        new Date(2026, 5, 14), // Minggu 14 Juni
        new Date(2026, 5, 18)  // Kamis 18 Juni
    );
    assert.deepEqual(result, {
        hari_denda: 3,
        nilai_denda: 3_000_000,
        tanggal_akhir_spk: "2026-06-14",
        tanggal_serah_terima: "2026-06-18"
    });
});

test("SPK Minggu 14 Jun, ST Senin 15 Jun = 0 hari denda (ST di grace)", () => {
    const result = calculateDendaFromDates(
        new Date(2026, 5, 14), // Minggu 14 Juni
        new Date(2026, 5, 15)  // Senin 15 Juni
    );
    assert.equal(result.hari_denda, 0);
    assert.equal(result.nilai_denda, 0);
});

test("denda nominal tier: 5 hari pertama Rp1jt/hari, 5 hari berikutnya Rp500rb/hari, cap Rp7.5jt", () => {
    assert.equal(calculateDendaNominal(0), 0);
    assert.equal(calculateDendaNominal(1), 1_000_000);
    assert.equal(calculateDendaNominal(3), 3_000_000);
    assert.equal(calculateDendaNominal(5), 5_000_000);
    assert.equal(calculateDendaNominal(6), 5_500_000);
    assert.equal(calculateDendaNominal(10), 7_500_000);
    assert.equal(calculateDendaNominal(DENDA_ACTION_THRESHOLD_DAYS), 7_500_000);
    assert.equal(calculateDendaNominal(30), 7_500_000);
});
