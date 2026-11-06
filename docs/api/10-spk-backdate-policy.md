# Spesifikasi API: SPK Backdate Policy

Modul kecil namun esensial ini mengelola konfigurasi "Kebijakan Mundur Tanggal (Backdate)" khusus untuk pembuatan SPK. Secara default, sistem menolak penerbitan SPK di masa lalu. Namun untuk beberapa cabang spesifik, Manajemen Pusat dapat memberikan izin _Whitelist_ (pengecualian) karena faktor geografis atau keterlambatan administrasi.

---

## 1. Menarik Daftar Cabang Whitelist

### `GET /api/spk-backdate-policy`
Menarik daftar cabang mana saja yang sedang diizinkan melakukan *backdate* SPK. Endpoint ini tidak memerlukan parameter apa pun.

- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": [
        "Balaraja",
        "Manado",
        "Makassar"
      ]
    }
    ```

*Catatan Frontend: Endpoint ini biasanya dipanggil oleh Frontend saat _user_ sedang mengisi Form Tambah SPK. Jika nama cabang *user* tidak terdapat dalam _array_ balikan API ini, *Datepicker* (Kalender Input) untuk "Tanggal SPK" di-set dengan nilai `minDate = today` (tidak membiarkan _user_ menekan tanggal sebelum hari ini).*

---

## 2. Memperbarui Cabang Whitelist

### `PUT /api/spk-backdate-policy/branches`
Digunakan oleh Admin Pusat (Super Admin) untuk menambahkan atau menghapus cabang dari daftar _whitelist_ secara _bulk_ (massal).

- **Request Body (JSON)**:
  Berdasarkan skema Zod `updateSpkBackdatePolicySchema`:
  ```json
  {
    "branches": ["Balaraja", "Manado", "Pontianak"]
  }
  ```
  *(Catatan: Array `branches` akan me-*replace* total daftar yang sudah ada sebelumnya).*

- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "message": "Policy updated successfully"
    }
    ```
