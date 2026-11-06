# Spesifikasi API: RAB (Rencana Anggaran Biaya)

Modul RAB merupakan salah satu *core module* paling besar di SPARTA. Menangani dari pengajuan awal draft anggaran oleh kontraktor hingga proses multi-level _approval_.

---

## 1. Pengajuan RAB (Submit)

### `POST /api/rab/submit`
Digunakan oleh kontraktor untuk mengunggah formulir RAB pertama kali atau revisi. Karena mendukung _upload file_, _endpoint_ ini harus dipanggil menggunakan `Content-Type: multipart/form-data`.

- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**:
  - `file_asuransi`: File lampiran asuransi (maks 10MB)
  - `rev_file_asuransi`: (Khusus mode revisi) File lampiran asuransi
  - `rev_logo`: (Khusus mode revisi) Logo kontraktor
- **Form Data Fields (JSON Stringified atau Text)**:
  Berdasarkan skema Zod `submitRabSchema`:
  - `nomor_ulok` *(string, wajib)*
  - `email_pembuat` *(string format email, wajib)*
  - `nama_pt` *(string, wajib)*
  - `durasi_pekerjaan` *(string angka bulat > 0, wajib)*
  - `is_revisi` *(boolean atau string "true"/"false")*
  - `id_rab_revisi` *(number opsional, diisi jika `is_revisi` = true)*
  - `is_takeover` *(boolean, default false)*
  - `kategori_lokasi`, `no_polis`, `berlaku_polis` *(string opsional)*
  - `luas_bangunan`, `luas_terbangun`, `luas_area_terbuka`, `luas_area_parkir`, `luas_area_sales`, `luas_gudang` *(string angka opsional)*
  - `detail_items`: Wajib berisi Array objek _Item Pekerjaan_ yang di-Stringify (lihat Skema Detail Item di bawah).

**Skema Objek `detail_items` (JSON)**:
```json
[
  {
    "kategori_pekerjaan": "Persiapan",
    "jenis_pekerjaan": "Pembersihan Lahan",
    "satuan": "m2",
    "volume": 150.5,
    "harga_material": 10000,
    "harga_upah": 5000,
    "total_material": 1505000,
    "total_upah": 752500,
    "total_harga": 2257500,
    "catatan": "Catatan khusus opsional"
  }
]
```

---

## 2. Manajemen Item RAB

Karena Item RAB bisa berjumlah ribuan baris, sistem menyediakan _endpoints_ khusus untuk memanipulasi _items_ secara *batch*.

### `PUT /api/rab/:id/items/replace`
Mengganti (timpa) seluruh item RAB yang lama dengan array item yang baru secara utuh.
- **Request Body (JSON)**:
  ```json
  {
    "items": [ /* Array of detailItemSchema sama seperti submit */ ],
    "grand_total": 2257500,
    "grand_total_non_sbo": 2000000,
    "grand_total_final": 2500000
  }
  ```

### `PUT /api/rab/:id/items`
Memperbarui item tertentu yang sudah ada di database (Bulk Update).
- **Request Body (JSON)**:
  ```json
  {
    "items": [
      {
        "id": 991,
        "kategori_pekerjaan": "Persiapan",
        "jenis_pekerjaan": "Pembersihan Lahan",
        "satuan": "m2",
        "volume": 200,
        "harga_material": 10000,
        "harga_upah": 5000
      }
    ]
  }
  ```

### `DELETE /api/rab/:id/items`
Menghapus item secara spesifik.
- **Request Body (JSON)**:
  ```json
  {
    "item_ids": [991, 992, 993]
  }
  ```

### `POST /api/rab/:id/sync-branch-prices`
Fungsi esensial yang biasa diletakkan di *button* "Sync Harga" pada Frontend. Meminta server mencocokkan harga material & upah yang diinput kontraktor terhadap `Master Price` cabang yang bersangkutan.

---

## 3. Query Data (Pencarian & Detail)

### `GET /api/rab`
Menarik *list* RAB.
- **Query Parameters**:
  - `status`: Filter berdasarkan status (misal: "Draft", "Approved")
  - `nomor_ulok`: Filter nomor ULOK spesifik
  - `cabang`: Filter berdasar cabang
  - `nama_pt`: Filter kontraktor
  - `email_pembuat`: Filter berdasarkan pembuat
  - `id_toko`: Filter ID Toko tabel master

### `GET /api/rab/:id`
Menarik seluruh data *header* RAB beserta relasinya (termasuk *array* items).

---

## 4. Dokumen & Persetujuan (Approval)

### `POST /api/rab/:id/approval`
Melakukan persetujuan, penolakan, atau permintaan revisi.

### `PUT /api/rab/update-status`
Endpoint administratif (Intervensi) untuk _bypass_ persetujuan sistem.
- **Request Body (JSON)**:
  ```json
  {
    "id_toko": 12,
    "id_rab": 45,
    "status": "APPROVED",
    "actor_email": "admin@alfamart.com",
    "actor_role": "Super Admin",
    "alasan_intervensi": "Force Majeure Approval"
  }
  ```

### Generate & Unduh File
- **`GET /api/rab/:id/pdf`**: Unduh PDF final RAB (Tanpa generate ulang).
- **`POST /api/rab/:id/pdf/regenerate`**: Memaksa sistem mencetak ulang format PDF RAB.
- **`GET /api/rab/:id/excel`**: Ekspor seluruh baris RAB ke format `.xlsx`.
- **`GET /api/rab/:id/logo`**: Menarik logo kontraktor (proxy file).
- **`GET /api/rab/:id/file-asuransi`**: Menarik file polis asuransi proyek (proxy file).

---

## 5. Migrasi (Internal)
- **`POST /api/rab/migration/preview`** & **`POST /api/rab/migration/commit`**: Digunakan untuk migrasi data massal (Excel Upload `file` dan `materai_file`) via `multipart/form-data`.
