# Spesifikasi API: Activity Log (Log Aktivitas)

Modul ini tidak berdiri sendiri, melainkan bertindak sebagai _History Viewer_ untuk tabel-tabel modul lain. Setiap kali ada proses _Approval_, Penolakan (Reject), Intervensi Super Admin, atau perubahan krusial di modul-modul lain, _backend_ akan merekamnya secara terpusat.

API ini akan dipanggil oleh Frontend ketika _user_ menekan tombol "Lihat Riwayat" (History) pada suatu _form_.

---

## 1. Menarik Riwayat Aktivitas

### `GET /api/activity-log`
Menampilkan jejak rekam (jejak digital) dari suatu dokumen/entitas (Kapan dibuat, kapan disetujui, dan siapa yang menyetujuinya).

- **Query Parameters**:
  - `entity_type` (Wajib): Jenis modul, harus salah satu dari: `RAB`, `SPK`, `PERTAMBAHAN_SPK`, `OPNAME`, `OPNAME_FINAL`, `PENGAWASAN`, `BERKAS_SERAH_TERIMA`, `INSTRUKSI_LAPANGAN`, `GANTT`, `PROJECT_PLANNING`, `DOKUMENTASI_BANGUNAN`, `PENYIMPANAN_DOKUMEN`, `SURAT_PERINGATAN`, `INTERVENSI`, `DC_DEVELOPMENT`.
  - `entity_id` (Wajib): ID _primary key_ dari baris tabel modul tersebut.

- **Response Format**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 1024,
        "entity_type": "SPK",
        "entity_id": 88,
        "action": "APPROVED",
        "actor_email": "bm_balaraja@alfamart.com",
        "actor_role": "Branch Manager",
        "note": "Segera kerjakan",
        "created_at": "2026-08-02T10:00:00.000Z"
      },
      {
        "id": 1023,
        "entity_type": "SPK",
        "entity_id": 88,
        "action": "CREATED",
        "actor_email": "admin@alfamart.com",
        "actor_role": "Admin",
        "note": "Membuat draft SPK",
        "created_at": "2026-08-01T15:00:00.000Z"
      }
    ]
  }
  ```

*(Catatan: Penambahan/perekaman log aktivitas tidak memiliki API khusus dari luar, melainkan dipanggil secara internal lewat `activityLogService.logAction(...)` di sisi Node.js Controller).*
