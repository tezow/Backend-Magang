# Spesifikasi API: Kalkulasi Denda Keterlambatan

Modul ini **hanya** memiliki API baca (Read-only) untuk mengalkulasi denda secara *on-the-fly* (Real-time). Perhitungan denda ini sangat kompleks karena bergantung pada:
1. Target Tanggal Akhir SPK Asli.
2. Target Tanggal Akhir SPK Adendum (Jika ada disetujui di Pertambahan SPK).
3. Tanggal Aktual saat Dokumen Serah Terima (BAST) di-generate.
4. Pemotongan Hari Libur Nasional & Cuti Bersama yang sah (di-bypass dari perhitungan hari keterlambatan).
5. Nilai Total RAB Proyek.

---

## 1. Menarik Informasi Perhitungan Denda

### `GET /api/denda/:id_toko`
Mengalkulasi status denda proyek tertentu pada detik API ini dipanggil. Jika BAST belum terbit, maka API akan berasumsi "Hari ini" sebagai hari Serah Terima semu untuk memperkirakan denda berjalannya.

- **URL Parameter**: `id_toko` (Tipe Data: `Number`).
- **Response Format**:
  Mengembalikan JSON *Object* yang memuat rincian hari keterlambatan, pengurang hari libur, persentase denda (umumnya 1 permil / 0.1% per hari keterlambatan), dan total nominal denda dalam Rupiah.

  ```json
  {
    "status": "success",
    "data": {
      "nomor_ulok": "UZ01-2601-0001",
      "tanggal_target": "2026-08-01",
      "tanggal_aktual": "2026-08-10",
      "hari_keterlambatan_kotor": 9,
      "hari_libur_nasional": 1,
      "hari_keterlambatan_bersih": 8,
      "nilai_rab": 500000000,
      "denda_per_hari": 500000,
      "total_denda": 4000000,
      "keterangan": "Terlambat 8 hari kerja."
    }
  }
  ```

*Catatan: API Denda Keterlambatan ini akan digunakan di halaman **Dashboard** untuk menampilkan "Potensi Denda", serta di halaman penagihan untuk mendiskon tagihan kontraktor.*

*(Sub-route `/api/denda/actions` digunakan untuk Surat Peringatan, yang dijelaskan di dokumen terpisah).*
