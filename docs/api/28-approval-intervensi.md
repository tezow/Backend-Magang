# Spesifikasi API: Approval & Intervensi (Bypass)

Modul ini adalah modul transversal (_cross-cutting_) yang tidak berjalan sendirian, melainkan menempel pada hampir seluruh dokumen penting di SPARTA (seperti RAB, SPK, Opname Final, dan Serah Terima). Terdapat dua fungsi utama di sini: **Approval** (Persetujuan berjenjang normal) dan **Intervensi** (_Bypass_ darurat oleh Super Admin).

---

## 1. Approval (Persetujuan Berjenjang)

Hampir semua dokumen di atas memiliki rute `POST /:id/approval` (atau semacamnya, misalnya `/api/rab/:id/approval`). Rute tersebut biasanya akan memvalidasi *body* JSON berdasarkan `approvalActionSchema`.

- **Skema JSON Umum (Approval)**:
  ```json
  {
    "approver_email": "koordinator@alfamart.com",
    "jabatan": "KOORDINATOR",
    "tindakan": "APPROVE",
    "alasan_penolakan": "",
    "catatan_approval": "Sesuai dengan cek lapangan",
    "revisi_item_ids": [],
    "beanspot_type": "TIDAK",
    "is_hth": false,
    "is_fasade": true
  }
  ```
- **Tindakan**:
  Jika `tindakan` adalah `REJECT`, maka *field* `alasan_penolakan` **wajib** diisi (divalidasi oleh Zod *superRefine*).
- **Siklus Hidup**:
  Dokumen yang di-_Approve_ akan naik ke _stage_ berikutnya (contoh: Koordinator -> Manager -> Direktur). Dokumen yang di-_Reject_ akan kembali berstatus `REVISED` dan masuk ke antrean *Task Notification* pembuat dokumen.

---

## 2. Intervensi (Super Admin Bypass)

Di dunia nyata, kadang Manager cuti, atau Kontraktor tidak merespons, sehingga dokumen *stuck* (macet) di tengah jalan. Super Admin (dan *role* level dewa lainnya) memiliki hak untuk menggunakan tombol "Intervensi" yang memanggil endpoint khusus seperti `POST /:id/intervensi` atau `PUT /update-status`.

- **Skema JSON Umum (Intervensi)**:
  ```json
  {
    "actor_email": "superadmin@alfamart.com",
    "actor_role": "Super Admin",
    "target_status": "APPROVED",
    "alasan_intervensi": "Di-_approve_ paksa atas instruksi Manager via WhatsApp karena beliau sedang cuti sakit."
  }
  ```
- **Mekanisme**:
  Intervensi tidak mempedulikan aturan berjenjang normal. Endpoint ini akan langsung mengubah status dokumen di *database* menjadi `target_status` yang diminta, dan langsung merekamnya ke dalam `activity-log` dengan tanda khusus (bahwa ini adalah hasil intervensi, bukan *flow* normal).
