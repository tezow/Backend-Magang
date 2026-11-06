# Spesifikasi API: Laporan Pengawasan

Modul ini adalah bentuk digital dari laporan kunjungan pengawas lapangan. Ketika seorang pengawas (Internal Alfamart) mengunjungi proyek, mereka harus melaporkan _progress_ dan dokumentasi (foto) untuk setiap "Jenis Pekerjaan" yang sedang berlangsung pada tanggal tersebut. 

Laporan Pengawasan ini juga memuat **Opname Data** (perhitungan volume _real_ lapangan vs volume RAB) yang sangat penting untuk pencairan dana.

---

## 1. Membuat Laporan Pengawasan (Tunggal & Massal)

Karena 1 kunjungan pengawas sering kali mengecek belasan/puluhan "Jenis Pekerjaan", _endpoint bulk_ lebih disarankan untuk digunakan.

### `POST /api/pengawasan/bulk`
Membuat banyak laporan pengawasan sekaligus dalam satu kali kirim (*request*).
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**:
  - `file_dokumentasi`: (Array file) Foto bukti pekerjaan di lapangan.
  - `file_foto_opname`: (Array file) Foto bukti khusus jika ada perhitungan Opname/selisih volume.
- **Form Data Fields (Data Teks, JSON Stringified)**:
  - `items`: Array of Objects (berdasarkan `createPengawasanSchema`):
    ```json
    [
      {
        "id_gantt": 20,
        "tanggal_pengawasan": "2026-08-15",
        "kategori_pekerjaan": "Pasangan",
        "jenis_pekerjaan": "Pasang Bata",
        "catatan": "Pekerjaan rapi",
        "status": "progress",
        "opname_data": {
          "id_toko": 105,
          "id_rab_item": 99,
          "volume_akhir": 45,
          "selisih_volume": 5,
          "total_selisih": 50000,
          "total_harga_opname": 450000,
          "desain": "OK",
          "kualitas": "OK",
          "spesifikasi": "OK",
          "catatan": "Ada sisa material"
        }
      }
    ]
    ```

### `POST /api/pengawasan`
(Versi tunggal) Membuat 1 laporan spesifik. File dikirim lewat field `file_dokumentasi` (maks 1).

---

## 2. Memperbarui Laporan (Update & Delete)

### `PUT /api/pengawasan/bulk`
Sama seperti `POST /bulk`, namun digunakan untuk mode *Edit*. Menerima lampiran file `rev_file_dokumentasi` dan `rev_file_foto_opname` jika user mengubah foto. Field `items` JSON harus menyertakan `id` primary key pengawasan.

### `PUT /api/pengawasan/:id`
(Versi tunggal) Edit satu laporan pengawasan.

### `DELETE /api/pengawasan/:id`
Menghapus riwayat laporan kunjungan spesifik.

---

## 3. Query, Export & PDF

### `GET /api/pengawasan`
Menarik *list* riwayat seluruh kunjungan pengawasan.
- **Query Parameters**:
  - `id_gantt`: Spesifik ke _Gantt_ tertentu.
  - `tanggal`: "2026-08-15"
  - `kategori_pekerjaan`: "Pasangan"
  - `status`: "progress" | "selesai" | "terlambat" | "tidak_dikerjakan"
  - `cabang_array`: (Otomatis dari backend session)

### `GET /api/pengawasan/:id`
Menarik detail informasi (termasuk *object* _opname_data_) untuk satu ID.

### `GET /api/pengawasan/:id/pdf`
Mencetak (men-generate) dokumen PDF laporan kunjungan lengkap dengan foto (jika ada).

---

## 4. Migrasi (Data Lama)

Untuk keperluan historis, data pengawasan proyek-proyek tahun lalu dapat dipaksakan masuk via _upload Excel_.
- **`POST /api/pengawasan/migration/preview`**
- **`POST /api/pengawasan/migration/commit`**
- **`GET /api/pengawasan/migration/pending`**: Mengecek status migrasi yang belum menghasilkan PDF kompilasi _background process_.
