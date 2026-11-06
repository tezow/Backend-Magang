# Spesifikasi API: Project Planning (FPD / Form Perencanaan Desain)

Modul ini menangani form FPD awal yang panjang dari cabang hingga mencapai 5 jenjang _approval_ dan berujung pada penugasan pembuatan RAB ke pihak Kontraktor.

---

## 1. Pengajuan FPD Awal (Submit & Resubmit)

### `POST /api/project-planning/submit`
Digunakan oleh Koordinator Cabang untuk membuat FPD baru.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**: Dapat menerima banyak _file_ yang didefinisikan secara bebas oleh _frontend_ (disimpan via `.any()`). File-file ini lalu disimpan dan *link*-nya dikembalikan oleh _Service_.
- **Form Data Fields (Data Teks)**: Menggunakan Zod Schema `submitProjekPlanningSchema`.
  - `nomor_ulok` *(wajib)*, `email_pembuat` *(wajib)*, `nama_pengaju` *(wajib)*, `jenis_pengajuan` *(wajib)*
  - **Opsional/Default**: `id_toko` (0), `is_ruko` (false), `is_dark_store` (false), `is_head_to_head` (false), `is_seating_area` (false)
  - **Fasilitas (Array of Object diconvert ke String JSON)**:
    ```json
    [
      {
        "jenis_fasilitas": "Toilet",
        "is_tersedia": true,
        "keterangan": "Di belakang gudang",
        "nama_fasilitas_lainnya": null
      }
    ]
    ```
  - **Array String Lainnya**: `ketentuan` (Ketentuan landlord), `catatan_design`.
  - **Bidang Dimensi/Luas (Opsional String)**: `luas_bangunan`, `luas_area_terbuka`, `luas_area_terbangun`, `luas_gudang`, `luas_area_parkir`, `pxl_bangunan`, `p_bangunan`, `l_bangunan`.

### `POST /api/project-planning/:id/resubmit`
Mirip dengan `/submit`, namun digunakan jika FPD di-*reject* (status `REJECTED`) untuk memperbarui data yang salah sebelum dikirim ulang untuk persetujuan pertama.

---

## 2. Multi-Level Approval (Persetujuan)

Modul ini memiliki hierarki persetujuan ketat berurutan. Setiap _endpoint_ menerima *payload* JSON standar.

**Skema Payload Approval (Umum)**:
```json
{
  "approver_email": "string (wajib, email BM/Manajer)",
  "tindakan": "APPROVE" | "REJECT",
  "catatan": "string (opsional)",
  "alasan_penolakan": "string (wajib jika tindakan REJECT)"
}
```

### A. Approval BM Cabang & Regional
- **`POST /api/project-planning/:id/bm-approval`**
- **`POST /api/project-planning/:id/bm-regional-approval`**

### B. Approval PP (Spesialis & Manager)
- **`POST /api/project-planning/:id/pp-approval-1`** (Tahap 1, bisa set flag `butuh_desain_3d: true`)
- **`POST /api/project-planning/:id/pp-approval-2`** (Tahap Final / Closing)
- **`POST /api/project-planning/:id/pp-manager-approval`** (Manager PP Pusat)

### C. Final Review RAB (Oleh PP)
Saat FPD sampai di tahap Review RAB, payload penolakan lebih detail:
```json
{
  "approver_email": "admin@alfamart.com",
  "rab_tindakan": "REJECT",
  "gambar_tindakan": "APPROVE",
  "alasan_penolakan": "Gambar oke, RAB kemahalan",
  "rab_rejected_item_ids": [101, 102],
  "rab_rejected_item_notes": "Tolong cek harga keramik",
  "rab_rejected_items": [
    { "id": 101, "note": "Harga kemahalan" }
  ]
}
```

---

## 3. Unggah (Upload) Khusus di Tengah Jalan

### `POST /api/project-planning/:id/upload-3d`
Jika PP Cabang (saat Approval 1) meminta desain 3D, maka harus diunggah lewat endpoint ini oleh tim spesialis.
- **Request Body (Multipart)**:
  - `file_desain_3d`: File model 3D / render PDF.
  - `uploader_email`: String.
  - `keterangan`: String (opsional).

### `POST /api/project-planning/:id/upload-rab`
Mengunggah file *Blueprint* / Gambar Kerja final sebelum RAB di-set ke mode siap dilempar ke Kontraktor.
- **Request Body (Multipart)**:
  - `file_gambar_kerja_final_sipil` (maks 2 file)
  - `file_gambar_kerja_final_me` (maks 2 file)
- Ditambah *text fields*: `id_rab_sipil`, `id_rab_me`, dsb.

---

## 4. Query, Log, dan File Pendukung

- **`GET /api/project-planning`**: Filter FPD berdasarkan `status`, `nomor_ulok`, `cabang`, `email_pembuat`.
- **`GET /api/project-planning/:id`**: Ambil detail satu FPD.
- **`GET /api/project-planning/:id/logs`**: Riwayat persetujuan, *reject*, dan transisi status (Activity Log khusus FPD).
- **`GET /api/project-planning/:id/pdf`**: Download file dokumen PDF FPD Gabungan.
- **`GET /api/project-planning/:id/photos-pdf`**: Download PDF kompilasi foto kondisi _existing_.
- **`POST /api/project-planning/:id/intervention`**: Pemaksaan bypass status oleh Super Admin.

---

## 5. Portal Kontraktor (Pengambilan Tugas RAB)

Ketika FPD berstatus `WAITING_RAB_UPLOAD`, kontraktor di cabang tersebut akan mendapatkan "Request".

### `GET /api/project-planning/rab-requests`
Ditembak oleh dashboard Kontraktor untuk melihat Proyek mana yang butuh pembuatan penawaran RAB.
- **Query**: `?actor_email=vendor@gmail.com`

### `GET /api/project-planning/:id/rab-prefill`
Ketika kontraktor menyanggupi dan menekan "Buat RAB", halaman FE akan memanggil API ini untuk mendapatkan data bawaan (Nama Toko, Alamat, Luas Area) yang otomatis akan mem-prefill Form RAB kosong.
- **Query**: `?actor_email=...&lingkup=SIPIL`
