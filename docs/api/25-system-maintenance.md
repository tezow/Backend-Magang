# Spesifikasi API: System Maintenance (Pemeliharaan Sistem)

Modul ini adalah _Kill Switch_ darurat yang dikendalikan oleh Super Admin atau Developer untuk menghentikan akses ke aplikasi sementara waktu (misalnya saat proses migrasi *database* raksasa sedang berjalan).

Jika mode `is_active` bernilai `true`, maka _middleware_ global Express akan memblokir hampir semua API dengan *response* khusus `503 Service Unavailable`, kecuali untuk *role* Super Human / Admin tertentu yang tetap bisa masuk.

---

## 1. Mengecek Status Pemeliharaan

### `GET /api/system-maintenance/status`
Digunakan oleh aplikasi *Frontend* di _background_ secara berkala (_polling_) untuk mengecek apakah server tiba-tiba masuk mode pemeliharaan. Jika *true*, Frontend akan memaksa (*force*) me-Redirect *user* ke halaman "Under Maintenance".

- **Response Format**:
  ```json
  {
    "status": "success",
    "data": {
      "is_active": false,
      "updated_at": "2026-07-01T00:00:00.000Z",
      "updated_by": "superadmin@alfamart.com",
      "can_manage": false
    }
  }
  ```
  *(Catatan: `can_manage` akan bernilai `true` jika *user* yang menembak API ini memiliki peran Super Admin).*

---

## 2. Menghidupkan/Mematikan Mode Pemeliharaan

### `PUT /api/system-maintenance/status`
Mengubah status Maintenance secara langsung.
- **Request Body (JSON)**:
  ```json
  {
    "is_active": true
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "message": "Mode pemeliharaan sistem diaktifkan.",
    "data": { ... }
  }
  ```
