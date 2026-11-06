# Spesifikasi API: Data Migration (Migrasi Excel Massal)

Karena SPARTA adalah sistem baru, terdapat banyak proyek lama yang sedang berjalan atau sudah selesai sebelum aplikasi ini diwajibkan. Untuk menghindari input manual satu per satu, SPARTA menyediakan jalur khusus "Migrasi Data" menggunakan *file upload* `.xlsx` yang di-*parsing* dan dimasukkan ke dalam *database* secara massal.

Fitur ini tersedia secara modular pada dokumen-dokumen berikut:
- **RAB** (`/api/rab/migration/preview` & `commit`)
- **SPK** (`/api/spk/migration/preview` & `commit`)
- **Pertambahan SPK** (`/api/pertambahan-spk/migration/preview` & `commit`)
- **Instruksi Lapangan** (`/api/instruksi-lapangan/migration/preview` & `commit`)
- **Pengawasan** (`/api/pengawasan/migration/preview` & `commit`)
- **Opname Final** (`/api/opname-final/migration/preview` & `commit`)
- **Serah Terima** (`/api/serah-terima/migration/preview` & `commit`)

---

## 1. Tahap Pertama: Preview (Validasi Data)

### `POST /api/<nama-modul>/migration/preview`
Menerima file Excel (Multipart form-data) dan mem-parsing isinya tanpa menyimpannya ke database.

- **Headers**: `Content-Type: multipart/form-data`
- **Request Body (File)**: `file` (File `.xlsx` yang berisi kolom-kolom standar migrasi).
- **Proses Internal**:
  1. Server membaca baris per baris menggunakan *library* XLSX.
  2. Server memvalidasi logika dasar (contoh: Apakah *ID Toko* ini ada? Apakah format tanggal benar?).
- **Response**:
  Mengembalikan array JSON berisi "Rapor Preview" untuk setiap baris. Jika ada *error*, _flag_ `has_error` akan menjadi `true` beserta daftar `errors`-nya. Frontend akan menampilkan rapor ini di dalam tabel UI agar admin bisa memperbaiki file Excel-nya.

---

## 2. Tahap Kedua: Commit (Simpan Permanen)

### `POST /api/<nama-modul>/migration/commit`
Setelah Frontend melihat bahwa hasil _Preview_ sudah 100% valid (tanpa error merah), Frontend akan menembak rute _Commit_ dengan mengirim ulang *file* Excel yang sama (atau mengirim JSON hasil parsingnya, tergantung spesifikasi rute masing-masing modul).

- **Proses Internal**:
  1. Data *insert* dilakukan menggunakan _Database Transaction_ massal.
  2. Data langsung dikunci (Bypass Approval) dengan asumsi data dari Excel adalah data masa lalu yang sudah sah.
  3. Menyimpan log migrasi di `activity-log` dengan tanda bahwa data ini hasil "MIGRATION".
- **Response**: Menampilkan `status: success` dan jumlah baris data yang berhasil dimasukkan.
