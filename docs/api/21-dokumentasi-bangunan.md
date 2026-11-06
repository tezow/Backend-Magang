# Spesifikasi API: Dokumentasi Bangunan

Modul ini bertugas menyimpan dokumentasi (foto-foto fisik bangunan) di luar alur pengawasan rutin. Biasanya dipakai pada masa penutupan proyek untuk menyimpan arsip foto _layout_, fasad depan toko, area parkir, hingga area dalam.

---

## 1. Pembuatan Dokumen (Upload Foto Massal)

### `POST /api/dokumentasi/bangunan`
Digunakan untuk membuat album dokumentasi untuk satu buah _project_ (Toko).
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**: Dapat menerima banyak file secara dinamis (`.any()`). 
- **Form Data Fields (Teks)**: Menggunakan skema Zod `dokumentasiBangunanCreateSchema`. Parameter penting:
  - `nomor_ulok`, `nama_toko`, `jenis_toko` (REGULAR / FRANCHISE).
  - Data administratif pelengkap seperti `tanggal_serah_terima`, `tanggal_ambil_foto`, dll.
  - `sudut_foto_items`: Bisa berupa Array Object atau String Comma-Separated.
    ```json
    [
      { "sudut_foto": "Tampak Depan Ruko" },
      { "sudut_foto": "Tampak Belakang (Gudang)" }
    ]
    ```

---

## 2. Manajemen Item & Pembaruan

### `PUT /api/dokumentasi/bangunan/:id`
Memperbarui meta-data teks dari satu set dokumentasi bangunan. Menerima form-data dengan batasan `array("foto", 200)` jika ingin meng-override total isi foto.

### `POST /api/dokumentasi/bangunan/:id/items`
Manambahkan file foto spesifik ke dalam album dokumentasi bangunan yang sudah ada (sisipan). Batas `array("foto", 200)`.

### `DELETE /api/dokumentasi/bangunan/items/:itemId`
Menghapus (membatalkan) satu buah _file_ foto/item dari album dokumentasi tersebut.

### `DELETE /api/dokumentasi/bangunan/:id`
Menghapus total 1 album dokumentasi beserta seluruh isinya.

---

## 3. Query, *Prefill*, & Export PDF

### `GET /api/dokumentasi/bangunan`
Menarik list/daftar album dokumentasi bangunan. Parameter pendukung: `cabang`, `kode_toko`, `nomor_ulok`.

### `GET /api/dokumentasi/bangunan/prefill-options`
Endpoint khusus untuk _Frontend_. Saat tim lapangan mau menekan tombol "Tambah Dokumentasi", dropdown _Pilih Toko_ akan memanggil endpoint ini agar _form_ tidak perlu diisi manual, melainkan langsung pre-fill data dari master FPD / Toko yang proyeknya sudah selesai.
- Parameter: `include_submitted=false` (hanya toko yang belum pernah didokumentasikan).

### `GET /api/dokumentasi/bangunan/:id`
Melihat detail album, termasuk URL _download_ untuk semua foto di dalamnya.

### `POST /api/dokumentasi/bangunan/:id/pdf`
Memaksa sistem men-*generate* ulang _file_ album foto berformat PDF. File aslinya hanya disimpan dalam bentuk koleksi foto, namun perintah ini akan menyusunnya ke dalam satu PDF *booklet* untuk kemudahan *sharing* antar manajer.

### `GET /api/dokumentasi/bangunan/:id/pdf/download`
Mengunduh *booklet* PDF hasil _generate_ di atas.
