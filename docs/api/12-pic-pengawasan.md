# Spesifikasi API: PIC Pengawasan

Modul kecil ini khusus mencatat entitas "PIC Pengawasan", yaitu nama orang dari internal Alfamart (biasanya tim _Project Planning_ atau spesialis bangunan) yang secara resmi ditugaskan untuk mengawasi sebuah proyek toko (Nomor ULOK tertentu) di lapangan.

Data dari modul ini sangat berkaitan erat dengan penjadwalan di **Gantt Chart**.

---

## 1. Mendaftarkan PIC Pengawasan

### `POST /api/pic-pengawasan`
Mencatat petugas yang akan melakukan pengawasan.
- **Request Body (JSON)**:
  Berdasarkan skema `createPicPengawasanSchema`:
  ```json
  {
    "id_toko": 105,
    "nomor_ulok": "UZ01-2601-0001",
    "id_rab": 42,
    "id_spk": 88,
    "kategori_lokasi": "JABODETABEK",
    "durasi": "45 Hari",
    "tanggal_mulai_spk": "2026-08-01",
    "plc_building_support": "Budi Santoso (Koordinator)"
  }
  ```
- **Response**:
  - `201 Created`: Berhasil disimpan.

---

## 2. Menarik Data PIC

### `GET /api/pic-pengawasan`
Mengambil daftar PIC Pengawasan.
- **Query Parameters (Opsional)**:
  - `id_toko`: `number`
  - `nomor_ulok`: `string`
  - `id_rab`: `number`
  - `id_spk`: `number`
- **Response**:
  - `200 OK`: Mengembalikan _array_ data PIC.
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 1,
        "nomor_ulok": "UZ01-2601-0001",
        "plc_building_support": "Budi Santoso (Koordinator)"
      }
    ]
  }
  ```

### `GET /api/pic-pengawasan/:id`
Menarik spesifik 1 data PIC berdasarkan _Primary Key_ ID.

---
## Integrasi
Data PIC Pengawasan ini akan ditarik oleh modul **Gantt Chart** (`GET /api/gantt/supervision-workspace/:nomor_ulok`) sebagai informasi di pojok atas _dashboard_ pengawas, sehingga pengawas tahu bahwa dialah yang di-_assign_ resmi ke proyek ini.
