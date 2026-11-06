# Spesifikasi API: Instruksi Lapangan (Pekerjaan Tambah/Kurang)

Modul ini mengelola "Pekerjaan Tambah Kurang" (Change Order) yang diinstruksikan oleh pihak Alfamart kepada Kontraktor di luar dari RAB awal (misalnya: penambahan AC, pengurangan volume keramik karena ada pilar, dsb.).

---

## 1. Pembuatan Instruksi (Submit)

### `POST /api/instruksi-lapangan/submit`
Digunakan oleh Koordinator Cabang untuk menerbitkan instruksi lapangan baru.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields**:
  - `lampiran`: File bukti/sketsa pendukung perlunya tambah kurang (Opsional, maks 10MB).
  - `nomor_ulok`: `string` (Wajib)
  - `email_pembuat`: `string` (Email pembuat, wajib)
  - `tanggal_mulai` & `tanggal_selesai`: `string` (Target kapan instruksi ini dieksekusi).
  - `detail_items`: JSON Stringified dari _array_ pekerjaan. Berisi daftar harga material & upah yang diinstruksikan.
    ```json
    [
      {
        "kategori_pekerjaan": "Pekerjaan Plafon",
        "jenis_pekerjaan": "Pasang Plafon Gypsum (Tambahan Ruang)",
        "satuan": "m2",
        "volume": 20,
        "harga_material": 30000,
        "harga_upah": 15000,
        "catatan": "Tolong pakai rangka hollow tebal"
      }
    ]
    ```

---

## 2. Persetujuan & Intervensi

Sama seperti SPK, Instruksi Lapangan harus disetujui oleh BM Cabang agar sah, karena bisa merubah anggaran (*budget*).

### `POST /api/instruksi-lapangan/:id/approval`
- **Request Body**:
  ```json
  {
    "approver_email": "bm_balaraja@alfamart.com",
    "tindakan": "APPROVE",
    "alasan_penolakan": "",
    "catatan_approval": "Sesuai kebutuhan lapangan"
  }
  ```

---

## 3. Query, Export & PDF

### `GET /api/instruksi-lapangan/list`
Menarik daftar instruksi lapangan.
- **Query Parameters (Opsional)**:
  - `nomor_ulok`, `status`, `email_pembuat`, `cabang`

### `GET /api/instruksi-lapangan/:id`
Menarik detail informasi tunggal, beserta `items` pekerjaan tambah kurang tersebut.

### `GET /api/instruksi-lapangan/:id/pdf`
Mengunduh form fisik surat Instruksi Lapangan dalam format PDF.

### `POST /api/instruksi-lapangan/:id/pdf/regenerate`
Memaksa sistem untuk mencetak ulang PDF (berguna jika ada perubahan template format logo dari server, dsb).

### `GET /api/instruksi-lapangan/:id/lampiran`
Mengunduh lampiran (proxy file) yang tadinya di-_upload_ saat tahap `submit`.

---

## 4. Migrasi Eksternal (Excel)

Fitur untuk mengakomodir data proyek-proyek tahun lama yang menggunakan form cetak Excel manual.
Ada dua jenis migrasi (format excel lama):
- **`POST /api/instruksi-lapangan/migration/preview`** & **`commit`**: Untuk _template_ V1 (menggunakan sheet data_rab + opname_final).
- **`POST /api/instruksi-lapangan/migration/rab2/preview`** & **`commit`**: Untuk _template_ V2 (menggunakan RAB Tambah Kurang lebar, form2 + form3).
