# Spesifikasi API: Opname (Pemeriksaan Volume)

Modul ini bertugas menyimpan data perhitungan silang (Opname) antara volume pekerjaan yang tertulis di RAB vs volume fisik nyata di lapangan, yang diperiksa oleh Pengawas pada saat berkunjung ke proyek. Data dari modul ini sangat krusial karena menentukan nilai pembayaran yang sah kepada Kontraktor.

---

## 1. Input Data Opname

Karena pengawas biasanya memeriksa banyak item sekaligus dalam satu kunjungan, endpoint `/bulk` adalah metode yang disarankan.

### `POST /api/opname/bulk`
Digunakan untuk menyimpan hasil opname massal secara bersamaan.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields**:
  - `file_foto_opname`: Array _file_ bukti foto (maksimal 300 _file_ sekaligus).
  - `id_toko`: `number` (Wajib).
  - `email_pembuat`: `string` (Wajib, format email).
  - `tipe_opname`: `OPNAME | OPNAME_FINAL` (Default `OPNAME`).
  - `grand_total_opname`: `string/number` (Total uang hasil opname).
  - `grand_total_rab`: `string/number` (Total uang RAB awal).
  - `items`: JSON stringified array of objects (berdasarkan `bulkCreateOpnameItemSchema`).

**Struktur JSON `items`**:
```json
[
  {
    "id_rab_item": 99,
    "status": "pending",
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
```
*(Catatan: Anda harus mengisi tepat satu di antara `id_rab_item` atau `id_instruksi_lapangan_item`, bergantung apakah pekerjaan tersebut bagian dari RAB asli atau Instruksi Tambah Kurang).*

### `POST /api/opname`
Digunakan untuk membuat 1 entitas data opname secara tunggal. File dikirim lewat parameter `file_foto_opname`.

---

## 2. Query & Manajemen (Edit/Hapus)

### `GET /api/opname`
Menarik data hasil opname.
- **Query Parameters**:
  - `id_toko`, `id_opname_final`, `id_rab_item`, `id_instruksi_lapangan_item`, `status`, `tipe_opname`.

### `GET /api/opname/:id`
Menarik *single record* opname beserta referensi tabel RAB yang tertaut.

### `PUT /api/opname/:id`
Memperbaiki perhitungan opname tunggal jika terjadi salah ketik atau salah hitung.
- **Form Data Fields**: 
  Menerima `rev_file_foto_opname` jika foto lama salah, beserta *field* numerik `volume_akhir`, `total_selisih`, dll. Minimal ada satu atribut yang di-update.

### `DELETE /api/opname/:id`
Menghapus _record_ opname (biasanya untuk perbaikan manual oleh database admin).

### `GET /api/opname/:id/foto`
Mengunduh/melihat *file* bukti foto opname yang tersimpan.
