# Spesifikasi API: Opname Final

Modul ini merupakan kelanjutan akhir dari proses Opname. Setelah semua item RAB dan Instruksi Lapangan di-opname (diperiksa volumenya), data tersebut dikumpulkan dan diajukan sebagai "Opname Final" yang membutuhkan persetujuan berjenjang. Opname Final ini adalah dasar untuk Serah Terima (BAST) dan penagihan akhir (Invoice/Denda).

---

## 1. Mengunci (Submit) Opname Final

### `POST /api/opname-final/:id/kunci_opname_final`
Mengunci seluruh hasil hitungan opname dan mengubah status menjadi "Menunggu Persetujuan". Endpoint ini dipanggil ketika seluruh pekerjaan lapangan dianggap sudah selesai 100%.

- **URL Parameter**: `id` dari entitas Opname Final (biasanya sudah di-generate *placeholder*-nya saat SPK turun).
- **Request Body (JSON)**:
  Berdasarkan skema `lockOpnameFinalSchema`:
  ```json
  {
    "id_toko": 105,
    "email_pembuat": "admin_cabang@alfamart.com",
    "aksi": "terkunci",
    "grand_total_opname": 245000000,
    "grand_total_rab": 250000000,
    "opname_item": [
      {
        "id_rab_item": 99,
        "volume_akhir": 45,
        "selisih_volume": 5,
        "total_selisih": 50000,
        "total_harga_opname": 450000,
        "desain": "Sesuai",
        "kualitas": "Baik",
        "spesifikasi": "Sesuai",
        "catatan": "Kelebihan material dikembalikan"
      }
    ]
  }
  ```

---

## 2. Multi-Level Approval (Persetujuan)

Dokumen Opname Final harus melewati proses *approval* ketat karena ini menyangkut finalisasi nominal uang proyek.

### `POST /api/opname-final/:id/approval`
- **Request Body**:
  ```json
  {
    "approver_email": "koordinator@alfamart.com",
    "tindakan": "APPROVE",
    "alasan_penolakan": "",
    "catatan_approval": "Sesuai hitungan final"
  }
  ```
- **Tahapan Approval Umumnya**:
  1. Koordinator
  2. Manajer
  3. Direktur Kontraktor (Pihak Eksternal yang ikut menyetujui)

### `POST /api/opname-final/:id/intervensi`
Bypass oleh Super Admin jika ada _deadlock_ persetujuan.
- **Request Body**:
  ```json
  {
    "actor_email": "superadmin@alfamart.com",
    "actor_role": "Super Admin",
    "target_status": "Menunggu Persetujuan Manajer",
    "alasan_intervensi": "Koordinator sedang cuti sakit"
  }
  ```

---

## 3. Query, Export & File Generation

### `GET /api/opname-final`
Menarik list rekapitulasi toko yang sudah mencapai fase Opname Final.
- **Query Parameters**: `status`, `aksi` ("active" atau "terkunci"), `nomor_ulok`, `tipe_opname`.

### `GET /api/opname-final/:id`
Menarik detail 1 _record_ opname final.

### `GET /api/opname-final/:id/pdf`
Mencetak surat fisik Berita Acara Opname Final (BAOP) dalam format PDF.

### `GET /api/opname-final/:id/excel`
Fitur khusus untuk men-_download_ detail rincian opname ratusan item RAB ke dalam format Excel (.xlsx) agar mudah diaudit oleh tim _Finance_.

### `POST /api/opname-final/:id/pdf/regenerate`
Memaksa sistem mencetak ulang/menulis ulang _file_ BAOP PDF.

---

## 4. Migrasi (Data Lama)

Meng-upload BAOP excel lama ke dalam sistem.
- **`POST /api/opname-final/migration/preview`**
- **`POST /api/opname-final/migration/commit`**
