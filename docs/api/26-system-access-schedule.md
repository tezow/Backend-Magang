# Spesifikasi API: System Access Schedule (Jadwal Akses)

Modul ini adalah fitur sekuritas untuk membatasi jam kerja aplikasi. Super Admin dapat menentukan pada jam berapa saja aplikasi bisa diakses, dan secara spesifik membedakan jam akses untuk orang internal (General) dan orang eksternal (Kontraktor).

Ini berfungsi untuk mencegah Kontraktor yang iseng memanipulasi *Gantt Chart* atau Opname di tengah malam tanpa pengawasan.

---

## 1. Menarik Aturan Jadwal

### `GET /api/system-access-schedule/schedule`
Menarik konfigurasi jadwal yang aktif saat ini.
- **Response Format**:
  ```json
  {
    "status": "success",
    "data": {
      "is_enabled": true,
      "weekday_enabled": true,
      "weekend_enabled": false,
      "general_start_minutes": 360,
      "general_end_minutes": 1080,
      "contractor_start_minutes": 480,
      "contractor_end_minutes": 1020,
      "can_manage": false
    }
  }
  ```
  *(Catatan: Angka di atas dikalibrasi dalam hitungan **Menit dari Jam 00:00**. Contoh `general_start_minutes` 360 berarti jam 06:00 pagi).*

---

## 2. Memperbarui Aturan Jadwal

### `PUT /api/system-access-schedule/schedule`
Digunakan oleh Super Admin untuk mengubah batas waktu (jam buka/tutup aplikasi).
- **Request Body (JSON)**:
  ```json
  {
    "is_enabled": true,
    "weekday_enabled": true,
    "weekend_enabled": true,
    "general_start_minutes": 360,
    "general_end_minutes": 1440,
    "contractor_start_minutes": 480,
    "contractor_end_minutes": 1020
  }
  ```
  *(Jika `weekend_enabled` dibuat `false`, maka seluruh sistem tidak bisa diakses pada hari Sabtu & Minggu)*.
