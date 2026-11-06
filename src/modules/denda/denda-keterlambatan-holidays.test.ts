/**
 * UNIT TESTS: Denda Keterlambatan dengan Libur Nasional 2026
 * 
 * Test cases untuk memvalidasi logika perhitungan denda dengan
 * mempertimbangkan weekend dan libur nasional
 */

import { calculateDendaFromDates, calculateDendaNominal } from "./denda-keterlambatan";

describe("Denda Keterlambatan - National Holidays 2026 Integration", () => {
    
    // =========================================================================
    // TEST GROUP 1: Basic Weekend Logic (Existing Behavior)
    // =========================================================================
    
    describe("Basic Weekend Logic", () => {
        test("SPK Jumat, ST Senin berikutnya = 0 hari denda (grace period)", () => {
            // SPK berakhir Jumat 2 Januari 2026
            // Skip Sabtu 3, Minggu 4
            // Grace = Senin 5 Januari
            // ST Senin 5 Januari = tepat di grace = 0 denda
            const result = calculateDendaFromDates(
                new Date("2026-01-02"), // Jumat
                new Date("2026-01-05")  // Senin
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
            expect(result.tanggal_akhir_spk).toBe("2026-01-02");
            expect(result.tanggal_serah_terima).toBe("2026-01-05");
        });
        
        test("SPK Kamis, ST Jumat berikutnya = 0 hari denda", () => {
            // SPK berakhir Kamis 8 Januari 2026
            // Grace = Jumat 9 Januari (langsung hari kerja berikutnya)
            // ST Jumat 9 Januari = tepat di grace = 0 denda
            const result = calculateDendaFromDates(
                new Date("2026-01-08"), // Kamis
                new Date("2026-01-09")  // Jumat
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("SPK Jumat, ST Selasa = 1 hari denda (Senin grace, Selasa +1)", () => {
            // SPK berakhir Jumat 2 Januari 2026
            // Grace = Senin 5 Januari
            // ST Selasa 6 Januari = 1 hari setelah grace
            const result = calculateDendaFromDates(
                new Date("2026-01-02"), // Jumat
                new Date("2026-01-06")  // Selasa
            );
            
            expect(result.hari_denda).toBe(1);
            expect(result.nilai_denda).toBe(1_000_000);
        });
    });
    
    // =========================================================================
    // TEST GROUP 2: National Holiday Logic (New Behavior)
    // =========================================================================
    
    describe("National Holiday - Tahun Baru (1 Januari 2026, Kamis)", () => {
        test("SPK Rabu 31 Des 2025, Kamis libur, ST Jumat 2 Jan = 0 denda", () => {
            // SPK berakhir Rabu 31 Desember 2025
            // Kamis 1 Januari 2026 = LIBUR NASIONAL (Tahun Baru)
            // Grace = Jumat 2 Januari
            // ST Jumat 2 Januari = tepat di grace = 0 denda
            const result = calculateDendaFromDates(
                new Date("2025-12-31"), // Rabu
                new Date("2026-01-02")  // Jumat
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("SPK Rabu 31 Des 2025, ST Senin 5 Jan = 1 hari denda", () => {
            // Grace = Jumat 2 Januari
            // ST Senin 5 Januari = 3 hari kalender setelah grace (Sabtu + Minggu + Senin)
            // Tapi karena Sabtu-Minggu, maka hari kerja berikutnya adalah Senin
            // Dari Jumat ke Senin = 3 hari kalender = 3 hari denda
            const result = calculateDendaFromDates(
                new Date("2025-12-31"), // Rabu
                new Date("2026-01-05")  // Senin
            );
            
            // Jumat 2 Jan (grace), Sabtu 3 (1), Minggu 4 (2), Senin 5 (3) = 3 hari denda
            expect(result.hari_denda).toBe(3);
            expect(result.nilai_denda).toBe(3_000_000);
        });
    });
    
    describe("National Holiday - Hari Lahir Pancasila (1 Juni 2026, Senin)", () => {
        test("SPK Jumat 29 Mei, Libur Senin 1 Jun, ST Selasa 2 Jun = 0 denda", () => {
            // SPK berakhir Jumat 29 Mei 2026
            // Skip Sabtu 30, Minggu 31
            // Skip Senin 1 Juni = LIBUR NASIONAL (Hari Lahir Pancasila)
            // Grace = Selasa 2 Juni
            // ST Selasa 2 Juni = tepat di grace = 0 denda
            const result = calculateDendaFromDates(
                new Date("2026-05-29"), // Jumat
                new Date("2026-06-02")  // Selasa
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("SPK Jumat 29 Mei, ST Rabu 3 Jun = 1 hari denda", () => {
            // Grace = Selasa 2 Juni
            // ST Rabu 3 Juni = 1 hari kalender setelah grace
            const result = calculateDendaFromDates(
                new Date("2026-05-29"), // Jumat
                new Date("2026-06-03")  // Rabu
            );
            
            expect(result.hari_denda).toBe(1);
            expect(result.nilai_denda).toBe(1_000_000);
        });
        
        test("SPK Jumat 29 Mei, ST Kamis 4 Jun = 2 hari denda", () => {
            const result = calculateDendaFromDates(
                new Date("2026-05-29"), // Jumat
                new Date("2026-06-04")  // Kamis
            );
            
            expect(result.hari_denda).toBe(2);
            expect(result.nilai_denda).toBe(2_000_000);
        });
    });
    
    describe("National Holiday - Natal (25 Desember 2026, Jumat)", () => {
        test("SPK Jumat 25 Des (Natal), ST Senin 28 Des = 0 denda", () => {
            // SPK berakhir Jumat 25 Desember 2026 (Natal, tapi sudah masuk durasi SPK)
            // Skip Sabtu 26, Minggu 27
            // Grace = Senin 28 Desember
            // ST Senin 28 Desember = tepat di grace = 0 denda
            const result = calculateDendaFromDates(
                new Date("2026-12-25"), // Jumat (Natal)
                new Date("2026-12-28")  // Senin
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("SPK Kamis 24 Des, Jumat Natal, ST Senin 28 Des = 0 denda", () => {
            // SPK berakhir Kamis 24 Desember 2026
            // Skip Jumat 25 Desember = LIBUR NASIONAL (Natal)
            // Skip Sabtu 26, Minggu 27
            // Grace = Senin 28 Desember
            const result = calculateDendaFromDates(
                new Date("2026-12-24"), // Kamis
                new Date("2026-12-28")  // Senin
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
    });
    
    describe("National Holiday - Proklamasi Kemerdekaan (17 Agustus 2026, Senin)", () => {
        test("SPK Jumat 14 Ags, Libur Senin 17 Ags, ST Selasa 18 Ags = 0 denda", () => {
            // SPK berakhir Jumat 14 Agustus 2026
            // Skip Sabtu 15, Minggu 16
            // Skip Senin 17 Agustus = LIBUR NASIONAL (Proklamasi RI)
            // Grace = Selasa 18 Agustus
            const result = calculateDendaFromDates(
                new Date("2026-08-14"), // Jumat
                new Date("2026-08-18")  // Selasa
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("SPK Jumat 14 Ags, ST Rabu 19 Ags = 1 hari denda", () => {
            const result = calculateDendaFromDates(
                new Date("2026-08-14"), // Jumat
                new Date("2026-08-19")  // Rabu
            );
            
            expect(result.hari_denda).toBe(1);
            expect(result.nilai_denda).toBe(1_000_000);
        });
    });
    
    describe("Multiple Consecutive Holidays", () => {
        test("Idulfitri: SPK Jumat 20 Mar, Sabtu-Minggu Idulfitri, ST Senin 23 Mar = 0 denda", () => {
            // SPK berakhir Jumat 20 Maret 2026
            // Sabtu 21 Maret = Idulfitri Hari 1 (weekend, tapi juga libur)
            // Minggu 22 Maret = Idulfitri Hari 2 (weekend, tapi juga libur)
            // Grace = Senin 23 Maret (hari kerja pertama)
            const result = calculateDendaFromDates(
                new Date("2026-03-20"), // Jumat
                new Date("2026-03-23")  // Senin
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
    });
    
    // =========================================================================
    // TEST GROUP 3: Edge Cases
    // =========================================================================
    
    describe("Edge Cases", () => {
        test("Null dates return 0 denda", () => {
            const result = calculateDendaFromDates(null, null);
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
            expect(result.tanggal_akhir_spk).toBeNull();
            expect(result.tanggal_serah_terima).toBeNull();
        });
        
        test("ST before SPK end = 0 denda", () => {
            const result = calculateDendaFromDates(
                new Date("2026-05-29"),
                new Date("2026-05-28")
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
        
        test("ST same as SPK end = 0 denda", () => {
            const result = calculateDendaFromDates(
                new Date("2026-05-29"),
                new Date("2026-05-29")
            );
            
            expect(result.hari_denda).toBe(0);
            expect(result.nilai_denda).toBe(0);
        });
    });
    
    // =========================================================================
    // TEST GROUP 4: Denda Nominal Calculation (Existing)
    // =========================================================================
    
    describe("Denda Nominal Calculation", () => {
        test("Tier 1: 1-5 hari = 1 juta per hari", () => {
            expect(calculateDendaNominal(1)).toBe(1_000_000);
            expect(calculateDendaNominal(2)).toBe(2_000_000);
            expect(calculateDendaNominal(3)).toBe(3_000_000);
            expect(calculateDendaNominal(4)).toBe(4_000_000);
            expect(calculateDendaNominal(5)).toBe(5_000_000);
        });
        
        test("Tier 2: 6-10 hari = 5 juta + 500rb per hari", () => {
            expect(calculateDendaNominal(6)).toBe(5_500_000);
            expect(calculateDendaNominal(7)).toBe(6_000_000);
            expect(calculateDendaNominal(8)).toBe(6_500_000);
            expect(calculateDendaNominal(9)).toBe(7_000_000);
            expect(calculateDendaNominal(10)).toBe(7_500_000);
        });
        
        test("Cap at 7.5 juta: 11+ hari tetap 7.5 juta", () => {
            expect(calculateDendaNominal(11)).toBe(7_500_000);
            expect(calculateDendaNominal(15)).toBe(7_500_000);
            expect(calculateDendaNominal(30)).toBe(7_500_000);
            expect(calculateDendaNominal(100)).toBe(7_500_000);
        });
        
        test("0 hari = 0 denda", () => {
            expect(calculateDendaNominal(0)).toBe(0);
        });
    });
    
    // =========================================================================
    // TEST GROUP 5: Real-World Scenarios
    // =========================================================================
    
    describe("Real-World Scenarios", () => {
        test("Scenario A: Durasi 20 hari, mulai 11 Mei 2026", () => {
            // Waktu Mulai: Senin 11 Mei 2026
            // Durasi: 20 hari
            // Akhir SPK: Jumat 29 Mei 2026 (H-20)
            // Skip: Sabtu 30, Minggu 31, Senin 1 Jun (Libur Pancasila)
            // Grace: Selasa 2 Juni
            
            const spkEnd = new Date("2026-05-29"); // Jumat
            
            // ST di grace = 0 denda
            expect(calculateDendaFromDates(spkEnd, new Date("2026-06-02")).hari_denda).toBe(0);
            
            // ST 1 hari setelah grace = 1 hari denda
            expect(calculateDendaFromDates(spkEnd, new Date("2026-06-03")).hari_denda).toBe(1);
            
            // ST 5 hari setelah grace = 5 hari denda
            expect(calculateDendaFromDates(spkEnd, new Date("2026-06-07")).hari_denda).toBe(5);
        });
        
        test("Scenario B: Durasi 30 hari, mulai 15 Desember 2026", () => {
            // Waktu Mulai: Selasa 15 Desember 2026
            // Durasi: 30 hari
            // Akhir SPK: Rabu 13 Januari 2027 (H-30)
            // Grace: Kamis 14 Januari 2027 (langsung hari kerja)
            
            const spkEnd = new Date("2027-01-13"); // Rabu
            
            // ST di grace = 0 denda
            expect(calculateDendaFromDates(spkEnd, new Date("2027-01-14")).hari_denda).toBe(0);
            
            // ST di Jumat = 1 hari denda (Kamis grace, Jumat +1)
            expect(calculateDendaFromDates(spkEnd, new Date("2027-01-15")).hari_denda).toBe(1);
        });
        
        test("Scenario C: SPK berakhir di hari libur (Kamis Nyepi 19 Mar 2026)", () => {
            // SPK berakhir Kamis 19 Maret 2026 (Nyepi, libur nasional)
            // Nyepi adalah hari kerja (Kamis) tapi libur nasional
            // Grace: Jumat 20 Maret 2026
            
            const spkEnd = new Date("2026-03-19"); // Kamis (Nyepi)
            
            // ST di Jumat = 0 denda (grace)
            expect(calculateDendaFromDates(spkEnd, new Date("2026-03-20")).hari_denda).toBe(0);
            
            // ST di Senin 23 Mar = 3 hari kalender (Sabtu + Minggu + Senin)
            // Tapi Sabtu 21 adalah Idulfitri Hari 1, Minggu 22 adalah Idulfitri Hari 2
            // Jadi skip: Jumat grace, Sabtu (1), Minggu (2), Senin (3) = 3 hari denda
            expect(calculateDendaFromDates(spkEnd, new Date("2026-03-23")).hari_denda).toBe(3);
        });
    });
});
