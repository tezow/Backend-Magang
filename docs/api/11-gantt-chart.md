# Spesifikasi API: Gantt Chart

Modul ini adalah fitur paling interaktif di _Frontend_, di mana kontraktor merencanakan jadwal kerja harian (H-Awal, H-Akhir) untuk setiap kategori pekerjaan, beserta dengan pengaturan Keterikatan (*Dependency*) antar kategori dan _plotting_ tanggal kunjungan Pengawasan oleh pihak internal (Alfamart).

---

## 1. Pembuatan & Pembaruan Gantt

### `POST /api/gantt/submit`
Membuat draf jadwal kerja Gantt Chart awal.
- **Request Body (JSON)**:
  ```json
  {
    "nomor_ulok": "UZ01...",
    "email_pembuat": "kontraktor@gmail.com",
    "kategori_pekerjaan": ["Persiapan", "Pondasi", "Dinding"],
    "day_items": [
      {
        "kategori_pekerjaan": "Persiapan",
        "h_awal": "1",
        "h_akhir": "3",
        "keterlambatan": null,
        "kecepatan": null
      },
      {
        "kategori_pekerjaan": "Pondasi",
        "h_awal": "4",
        "h_akhir": "10",
        "keterlambatan": null,
        "kecepatan": null
      }
    ],
    "dependencies": [
      {
        "kategori_pekerjaan": "Pondasi",
        "kategori_pekerjaan_terikat": "Persiapan"
      }
    ],
    "pengawasan": [
      { "tanggal_pengawasan": "2026-08-05" }
    ]
  }
  ```
  *(Catatan: Aturan Dependency mewajibkan seluruh tahapan kerja terhubung dari awal hingga akhir, kecuali kategori paling buntut).*

### `PUT /api/gantt/:id`
Memperbarui draf jadwal (sebelum status Terkunci).
- **Request Body**: Mirip seperti `/submit`, namun *field* `day_items`, `dependencies`, dll. bersifat parsial/opsional.

### `POST /api/gantt/:id/lock`
**Mengunci** jadwal Gantt Chart. Sekali terkunci, struktur `h_awal` dan `h_akhir` tidak dapat diubah lagi, dan jadwal resmi berjalan.
- **Request Body**: `{ "email": "user@alfamart.com" }`

---

## 2. Pengerjaan Lapangan (Setelah Lock)

Saat proyek sedang berjalan, kontraktor atau pengawas dapat melaporkan kendala jadwal (keterlambatan/percepatan).

### `POST /api/gantt/:id/day/keterlambatan`
- **Request Body (Update Tunggal)**:
  ```json
  {
    "kategori_pekerjaan": "Pondasi",
    "keterlambatan": "2",
    "next_tanggal_pengawasan": "2026-08-10"
  }
  ```
- **Request Body (Bulk Update)**:
  ```json
  {
    "updates": [
      { "kategori_pekerjaan": "Pondasi", "keterlambatan": "2" },
      { "kategori_pekerjaan": "Dinding", "keterlambatan": "1" }
    ]
  }
  ```

### `POST /api/gantt/:id/day/kecepatan`
- **Request Body**:
  ```json
  {
    "kategori_pekerjaan": "Dinding",
    "h_awal": "12",
    "h_akhir": "18",
    "kecepatan": "2"
  }
  ```

---

## 3. Manajemen Tanggal Pengawasan

Jadwal kunjungan Pengawas Lapangan bisa direvisi di tengah jalan.
### `POST /api/gantt/:id/pengawasan`
- **Request Body (Tambah Tanggal)**: `{ "tanggal_pengawasan": ["2026-08-15"] }`
- **Request Body (Hapus Tanggal)**: `{ "remove_tanggal_pengawasan": "2026-08-05" }`

---

## 4. Ruang Kerja Pengawas (Supervision Workspace) & Takeover

### `GET /api/gantt/supervision-workspace/:nomor_ulok`
Endpoint agregasi canggih yang menarik seluruh status toko, mulai dari FPD, RAB, SPK, hingga detil Gantt Chart aktif, untuk ditampilkan dalam satu _dashboard_ kepada Pengawas Lapangan.

### `POST /api/gantt/takeover-inspection`
Jika toko di-*Takeover* (diambil alih dari kontraktor lama ke kontraktor baru), pengawas harus mengisi form hasil inspeksi (Opname) apa saja yang sudah dikerjakan vs belum.
- **Request Body (JSON via Form Data `any()`)**:
  ```json
  {
    "nomor_ulok": "UZ01...",
    "tanggal_takeover": "2026-08-15",
    "items": [
      {
        "id_gantt": 12,
        "kategori_pekerjaan": "Pondasi",
        "status": "Selesai",
        "opname_data": {
           "volume_akhir": 50,
           "total_harga_opname": 5000000,
           "desain": "OK",
           "kualitas": "OK",
           "spesifikasi": "OK"
        }
      }
    ]
  }
  ```

---

## 5. Catatan & Komentar (Gantt Notes)

Fitur forum mini di dalam modul Gantt.
- **`GET /api/gantt/:id/notes`**: List komentar/catatan.
- **`POST /api/gantt/:id/notes`**:
  ```json
  {
    "author_email": "pengawas@alfamart.com",
    "author_name": "Pak Budi",
    "author_role": "Pengawas",
    "note": "Progres lambat karena hujan"
  }
  ```
