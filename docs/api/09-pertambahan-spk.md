# Spesifikasi API: Pertambahan SPK (Adendum Waktu)

Modul ini memfasilitasi _request_ perpanjangan durasi atau adendum waktu dari SPK yang sedang berjalan. Biasanya diajukan oleh Kontraktor jika ada kendala lapangan (cuaca, izin warga, dsb.) yang menyebabkan target selesai proyek molor.

---

## 1. Mengajukan & Mengubah Adendum Waktu

### `POST /api/pertambahan-spk`
Membuat draf pengajuan tambahan waktu.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields**:
  - `file_lampiran_pendukung`: (File Opsional, maks 10MB) Surat keterangan BMKG, foto lapangan banjir, dll.
  - `id_spk`: `number` (Wajib)
  - `pertambahan_hari`: `string` (Wajib, misal "14")
  - `tanggal_spk_akhir`: `string` (Wajib, tgl akhir SPK asli)
  - `tanggal_spk_akhir_setelah_perpanjangan`: `string` (Wajib, tgl akhir baru)
  - `alasan_perpanjangan`: `string` (Wajib, maksimal 500 karakter)
  - `dibuat_oleh`: `string` (Email atau nama kontraktor)

### `PUT /api/pertambahan-spk/:id`
Memperbarui draf pengajuan yang belum disetujui/di-_reject_. Juga mendukung _upload_ ulang _file_ di *field* `file_lampiran_pendukung`.

### `DELETE /api/pertambahan-spk/:id`
Membatalkan pengajuan (hapus permanen data).

---

## 2. Persetujuan (Approval) BM Cabang

Pengajuan yang masuk harus divalidasi dan disetujui oleh BM Cabang agar sah dan mengubah sisa waktu pengerjaan di SPK.

### `POST /api/pertambahan-spk/:id/approval`
- **Request Body (JSON)**:
  ```json
  {
    "approver_email": "bm_balaraja@alfamart.com",
    "tindakan": "APPROVE",
    "alasan_penolakan": "",
    "catatan_approval": "Disetujui karena memang musim hujan ekstrim"
  }
  ```
  *(Status akan berubah dari "Menunggu Persetujuan" menjadi "Disetujui BM" atau "Ditolak BM")*

### `POST /api/pertambahan-spk/:id/intervensi`
Fungsi _Bypass_ oleh Admin Pusat.
- **Request Body (JSON)**:
  ```json
  {
    "actor_email": "adminpusat@alfamart.com",
    "actor_role": "Super Admin",
    "target_status": "Disetujui BM",
    "alasan_intervensi": "Force Majeure Nasional"
  }
  ```

---

## 3. Query, Export & Download

### `GET /api/pertambahan-spk`
List semua riwayat pengajuan adendum SPK.
- **Query Parameters (Opsional)**:
  - `id_spk`: Cari berdasarkan SPK spesifik.
  - `status_persetujuan`: Filter by "Menunggu Persetujuan", "Disetujui BM", "Ditolak BM"
  - `nomor_ulok`: "UZ..."
  - `nama_kontraktor`: "PT X"
  - `cabang`: "Balaraja"

### `GET /api/pertambahan-spk/:id`
Melihat detail pengajuan.

### `GET /api/pertambahan-spk/:id/pdf`
Mengunduh surat resmi Adendum SPK (format PDF) yang sudah terbentuk jika disetujui.

### `GET /api/pertambahan-spk/:id/lampiran-pendukung`
Mengunduh _file_ bukti/lampiran pendukung yang diajukan oleh Kontraktor (Proxy File).

---

## 4. Migrasi Eksternal
- **`POST /api/pertambahan-spk/migration/preview`**
- **`POST /api/pertambahan-spk/migration/commit`**
Dua fungsi _multipart/form-data_ `file` Excel untuk _mass-upload_ data adendum lawas ke dalam *database* tanpa perlu melalui _approval_ UI lagi.
