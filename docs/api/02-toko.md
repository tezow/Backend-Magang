# Spesifikasi API: Toko (Proyek/ULOK)

Modul ini bertanggung jawab atas data master "Toko" atau "Proyek". Di SPARTA, sebuah proyek pembangunan diidentifikasi dengan **Nomor ULOK**.

---

## 1. Menarik Daftar Toko (List)

### `GET /api/toko`
Mengambil daftar toko yang aktif. Biasanya digunakan pada _dropdown_ pembuatan form RAB atau SPK.

- **Query Parameters (Opsional)**:
  - `search`: `string` (Kata kunci pencarian, akan mencari di kolom nama toko atau nomor ULOK)
  - `cabang`: `string` (Filter berdasarkan nama cabang, misalnya "Balaraja")
- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": 1,
          "nomor_ulok": "UZ01-2601-0001",
          "nama_toko": "Alfamart Balaraja City",
          "kode_toko": "BLRJ",
          "cabang": "Balaraja",
          "alamat": "Jl. Raya Balaraja KM 14"
        }
      ]
    }
    ```

## 2. Mengambil Detail Toko

### `GET /api/toko/detail`
Mengambil spesifikasi lengkap satu toko. Dapat dicari menggunakan ID atau Nomor ULOK.

- **Query Parameters**:
  - `id`: `number` (Opsional)
  - `nomor_ulok`: `string` (Opsional)
  - `lingkup`: `string` (Opsional, misalnya "Sipil" atau "ME")
  *Catatan: Minimal `id` atau `nomor_ulok` harus diisi.*
- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": {
        "id": 1,
        "nomor_ulok": "UZ01-2601-0001",
        "nama_toko": "Alfamart Balaraja City",
        "kode_toko": "BLRJ",
        "cabang": "Balaraja",
        "alamat": "Jl. Raya Balaraja KM 14"
      }
    }
    ```
  - `400 Bad Request`: Jika kedua `id` dan `nomor_ulok` kosong.
  - `404 Not Found`: Jika data tidak ditemukan.

### `GET /api/toko/:nomorUlok`
Alternatif cepat untuk mengambil toko hanya berdasarkan path Nomor ULOK.

- **URL Parameters**:
  - `nomorUlok`: `string` (Wajib, misal: `UZ01-2601-0001`)
- **Response**: Sama seperti `/detail`.

## 3. Manajemen Data Toko

### `POST /api/toko`
Membuat data toko baru. Biasanya ini dikelola oleh sistem integrasi internal (bukan melalui antarmuka pengguna biasa).

- **Request Body (JSON)**:
  ```json
  {
    "nomor_ulok": "string (Wajib)",
    "nama_toko": "string (Wajib)",
    "kode_toko": "string (Wajib)",
    "cabang": "string (Wajib)",
    "alamat": "string (Wajib)"
  }
  ```
- **Response**:
  - `201 Created`:
    ```json
    {
      "status": "success",
      "data": { "id": 105, ... }
    }
    ```

### `PUT /api/toko/:id`
Memperbarui informasi toko (misal: koreksi penulisan kode toko atau alamat).

- **URL Parameters**:
  - `id`: `number` (Wajib, ID tabel Toko)
- **Request Body (JSON)**:
  ```json
  {
    "nomor_ulok": "string (Opsional)",
    "nama_toko": "string (Opsional)",
    "kode_toko": "string (Opsional)",
    "cabang": "string (Opsional)",
    "alamat": "string (Opsional)"
  }
  ```
  *Catatan: Minimal satu field harus disertakan dalam body.*
- **Response**:
  - `200 OK`: Jika update sukses.
  - `400 Bad Request`: Jika tidak ada atribut yang disertakan untuk di-_update_.
