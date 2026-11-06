# Spesifikasi API: Serah Terima (BAST)

Modul ini menandakan penyelesaian 100% dari seluruh siklus pengerjaan lapangan. Ketika form Berita Acara Serah Terima (BAST) di-generate, maka tanggal di-generate-nya BAST tersebut akan menjadi acuan baku (Tanggal Aktual) untuk perhitungan keterlambatan dan Denda.

---

## 1. Menerbitkan Dokumen BAST

### `POST /api/create_pdf_serah_terima_unified`
(Standard Baru) Menerbitkan form Serah Terima BAST untuk sebuah proyek. Endpoint ini tidak memerlukan _body_ yang kompleks karena seluruh nilainya akan ditarik otomatis dari RAB, SPK, dan Opname Final yang sudah dikunci.
- **Request Body**:
  ```json
  {
    "nomor_ulok": "UZ01-2601-0001",
    "takeover_sequence": 0
  }
  ```
- **Response**: Menghasilkan _file_ PDF dan merekam tanggal Serah Terima aktual di _database_.

### `POST /api/create_pdf_serah_terima`
(Standard Lama - _Deprecated_) Menerbitkan BAST menggunakan parameter `id_toko`. Tidak direkomendasikan karena rawan isu saat _takeover_ toko antar kontraktor.

---

## 2. Koreksi Tanggal Serah Terima

Terkadang, dokumen BAST terlambat di-klik di sistem (meskipun kunci lapangan sudah diserahkan 2 hari lalu). Admin dapat memundurkan (koreksi) tanggal Serah Terima ini.

### `PATCH /api/serah-terima/date-correction`
- **Request Body**:
  ```json
  {
    "nomor_ulok": "UZ01-2601-0001",
    "tanggal_serah_terima": "2026-08-25",
    "catatan": "Terlambat input sistem karena mati lampu"
  }
  ```

### `GET /api/serah-terima/date-correction/history`
Melihat riwayat (_audit trail_) perubahan tanggal serah terima untuk proyek tersebut (siapa yang mengubah, kapan, apa alasannya).

---

## 3. Menarik & Download Berkas

### `GET /api/berkas_serah_terima`
Menarik *list* seluruh proyek yang sudah BAST (Serah Terima).
- **Query Parameters**: `id_toko`, `nomor_ulok`, `cabang_array`.

### `GET /api/berkas_serah_terima/:id/pdf`
Mengunduh _file_ PDF BAST yang sudah terbentuk sebelumnya.

### `POST /api/berkas_serah_terima/:id/pdf/regenerate`
Mencetak ulang PDF jika terjadi _bug layout_ / ada revisi kop surat terbaru dari Pusat.

---

## 4. Migrasi (Excel Massal)
- **`POST /api/serah-terima/migration/preview`**
- **`POST /api/serah-terima/migration/commit`**
Memasukkan tanggal Serah Terima proyek-proyek lama dari Excel ke database tanpa harus membuat dokumen PDF aslinya.
