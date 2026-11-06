# Spesifikasi API: SPK (Surat Perintah Kerja)

Modul ini mengelola penerbitan Surat Perintah Kerja dari pihak Alfamart kepada Kontraktor pemenang, setelah dokumen RAB disetujui sepenuhnya. Modul ini merupakan titik awal dimulainya pekerjaan lapangan dan referensi dasar untuk pembuatan _Gantt Chart_.

---

## 1. Pembuatan SPK (Submit)

### `POST /api/spk/submit`
Digunakan untuk mencetak draf awal SPK. Berbeda dengan pembuatan RAB yang membutuhkan lampiran _file_ (multipart), endpoint ini murni menerima JSON.

- **Request Body (JSON)**:
  ```json
  {
    "id_toko": 105,
    "nomor_ulok": "UZ01-2601-0001",
    "kode_toko": "BLRJ",
    "email_pembuat": "admin@alfamart.com",
    "lingkup_pekerjaan": "Sipil",
    "nama_kontraktor": "PT Bangun Persada",
    "proyek": "Renovasi Alfamart Balaraja",
    "waktu_mulai": "2026-08-01",
    "durasi": 45,
    "grand_total": 250000000,
    "par": "Nomor PAR/Anggaran (Opsional)",
    "spk_manual_1": "Nomor SPK Eksternal 1 (Opsional)",
    "spk_manual_2": "Nomor SPK Eksternal 2 (Opsional)"
  }
  ```
  *Catatan Zod:* `kode_toko` wajib **tepat 4 karakter alfanumerik** dan tidak boleh berisi string kosong atau `"----"`.
- **Response**:
  - `201 Created`: Berhasil membuat draf SPK.

---

## 2. Persetujuan SPK (Approval)

SPK yang sudah dibuat akan berstatus `WAITING_FOR_BM_APPROVAL`. BM Cabang (Branch Manager) harus memberikan persetujuan akhir sebelum Surat SPK resmi diterbitkan/sah.

### `POST /api/spk/:id/approval`
- **URL Parameter**: `id` dari SPK.
- **Request Body (JSON)**:
  ```json
  {
    "approver_email": "bm_balaraja@alfamart.com",
    "tindakan": "APPROVE",
    "alasan_penolakan": "",
    "catatan_approval": "Segera dikerjakan ya"
  }
  ```
  *(Jika `tindakan` = `REJECT`, maka `alasan_penolakan` wajib diisi).*
- **Response**:
  - `200 OK`: Mengubah status menjadi `SPK_APPROVED` (atau `SPK_REJECTED`) dan menerbitkan notifikasi terkait.

### `POST /api/spk/:id/intervention`
Fitur khusus _Super Admin_ untuk _bypass_ persetujuan secara paksa tanpa melalui BM.
- **Request Body (JSON)**:
  ```json
  {
    "actor_email": "superadmin@alfamart.com",
    "actor_role": "Super Admin",
    "target_status": "SPK_APPROVED",
    "alasan_intervensi": "Bypass atas perintah direksi"
  }
  ```

---

## 3. Query, Pencarian & Download

### `GET /api/spk`
Menarik daftar SPK.
- **Query Parameters (Opsional)**:
  - `status`: "WAITING_FOR_BM_APPROVAL", "SPK_APPROVED", dsb.
  - `nomor_ulok`: "UZ01-..."
  - `nama_kontraktor`: "PT Bangun"
  - `cabang`: "Balaraja"

### `GET /api/spk/:id`
Menarik detail informasi tunggal dari sebuah SPK.

### `GET /api/spk/:id/pdf`
Mencetak (men-_generate_) dan langsung mengunduh form fisik Surat Perintah Kerja dalam wujud PDF (_stream_ format biner `application/pdf`). Digunakan untuk penandatanganan di atas materai.

---

## 4. Migrasi (Data Lama)

Digunakan untuk proses _upload_ massal Excel yang diisi oleh Admin Pusat agar proyek lama dapat dicatat.
- **`POST /api/spk/migration/preview`**: Mengunggah Excel (`file`) lewat _multipart/form-data_ untuk di-_parsing_ tanpa disimpan ke database.
- **`POST /api/spk/migration/commit`**: Mengeksekusi penulisan hasil _parsing_ ke database.
