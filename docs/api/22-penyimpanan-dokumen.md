# Spesifikasi API: Penyimpanan Dokumen (General Storage)

Modul ini adalah bentuk digital dari _Filing Cabinet_ (Lemari Arsip). Modul ini berdiri bebas dari alur kerja utama SPARTA. Admin dapat meng-upload dokumen PDF, Word, atau zip apa saja (seperti Perjanjian Sewa, Gambar IMB, dll) dan menyimpannya di bawah nama Toko tertentu.

---

## 1. Manajemen Dokumen Umum

### `POST /api/document/penyimpanan-dokumen`
Menyimpan satu atau sekumpulan dokumen umum baru.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**: `file` (bisa banyak lewat konfigurasi `.any()`).
- **Form Data Fields (Teks)**:
  - `nama_dokumen`: "Salinan IMB"
  - Wajib menyertakan *linkage* ke entitas toko: Mengisi `id_toko` ATAU `(kode_toko + nama_toko + cabang)`.
  - `folder_name`: "Legal" (opsional, untuk mengelompokkan tampilan di UI).

### `PUT /api/document/penyimpanan-dokumen/:id`
Mengganti (me-_replace_) _file_ dari ID dokumen yang sudah ada, atau sekadar mengubah `nama_dokumen` teks-nya saja.

### `DELETE /api/document/penyimpanan-dokumen/:id`
Menghapus _file_ secara permanen dari server (_cloud storage_).

---

## 2. Pencarian & Struktur Folder (Archive Stores)

Jika ada toko lama yang tidak punya _history_ data di SPARTA (karena toko buka 5 tahun lalu), sistem menyediakan entitas **Archive Store**. Admin cukup mengetikkan Kode Toko, dan toko tersebut bisa dibuatkan "Folder Virtual" agar bisa ditempeli file.

### `POST /api/document/penyimpanan-dokumen/archive-stores`
Mendaftarkan entitas "Toko Arsip" kosong secara manual.
- **Request Body**:
  ```json
  {
    "kode_toko": "J001",
    "nama_toko": "Alfamart Jatiuwung",
    "cabang": "Balaraja",
    "nomor_ulok": "Opsional"
  }
  ```

### `GET /api/document/penyimpanan-dokumen/archive-stores`
List dari seluruh toko arsip yang pernah dibuat.

### `GET /api/document/penyimpanan-dokumen`
Mencari dokumen-dokumen yang tersimpan.
- **Query Parameters**: `id_toko`, `nama_dokumen`, `kode_toko`, `cabang`.

### `GET /api/document/penyimpanan-dokumen/:id`
Detail 1 baris meta-data _file_ beserta link unduhnya (URL S3 / MinIO).

---

## 3. Migrasi Arsip Massal

Jika manajemen pusat ingin melempar ratusan dokumen *Scan* sekaligus beserta Excel _mapping_-nya.
- **`POST /api/document/penyimpanan-dokumen/migration-preview`**
- **`POST /api/document/penyimpanan-dokumen/migration-commit`**
Dua endpoint ini dipanggil secara berurutan. Endpoint _preview_ memvalidasi apakah nama file ZIP sesuai dengan baris Excel, dan _commit_ mengekstraknya langsung ke lemari penyimpaan *database*.
