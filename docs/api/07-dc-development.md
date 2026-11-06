# Spesifikasi API: DC Development (Distribution Center)

Modul ini adalah modul terpisah yang mengelola alur kerja pembangunan gudang besar (Distribution Center), bukan toko biasa. Alurnya mencakup pembuatan proyek, manajemen vendor, tender (lelang), timeline pembangunan, manajemen _issue_, hingga BAST (Berita Acara Serah Terima) dan arsip.

---

## 1. Manajemen Proyek DC

### `GET /api/dc-development/projects`
Menarik daftar proyek DC.
- **Query**: `status`, `current_stage`, `branch_name`, `search`.

### `POST /api/dc-development/projects`
Membuat data proyek DC baru.
- **Request Body (JSON)**:
  ```json
  {
    "project_code": "DC-BLRJ-01",
    "project_name": "DC Balaraja Extension",
    "location_name": "Kawasan Industri",
    "branch_name": "Balaraja",
    "address": "Jl. Raya Serang",
    "area_size": 50000
  }
  ```

### `POST /api/dc-development/projects/:id/advance-stage`
Memajukan tahapan (_stage_) proyek DC ke fase berikutnya (misal dari TENDER ke PEMBANGUNAN).
- **Request Body**:
  ```json
  {
    "actor_email": "manager@alfamart.com",
    "actor_role": "DC Manager",
    "reason": "Tender telah selesai",
    "target_stage": "PEMBANGUNAN" // Opsional
  }
  ```

---

## 2. Vendor & Lelang (Tender)

### `POST /api/dc-development/vendors`
Mendaftarkan entitas perusahaan Vendor/Kontraktor DC.

### `POST /api/dc-development/projects/:id/tenders`
Membuat sesi lelang (Tender) baru untuk sebuah proyek DC.
- **Request Body**:
  ```json
  {
    "tender_type": "TERBUKA",
    "title": "Tender Pengadaan Baja",
    "owner_estimate_amount": 5000000000,
    "oe_tolerance_percent": 10
  }
  ```

### `POST /api/dc-development/tenders/:id/participants`
Mengundang vendor spesifik untuk mengikuti tender.
- **Request Body**: `{ "vendor_company_id": 15 }`

### `POST /api/dc-development/tenders/participants/:participantId/submissions`
Digunakan oleh vendor untuk mengirimkan penawaran harga.
- **Request Body**:
  ```json
  {
    "submission_type": "PENAWARAN_AWAL",
    "submitted_offer_amount": 4900000000,
    "notes": "Termasuk PPN"
  }
  ```

### `POST /api/dc-development/tenders/:id/set-winner`
Menetapkan salah satu partisipan sebagai pemenang lelang.
- **Request Body**:
  ```json
  {
    "participant_id": 4,
    "actor_email": "admin@alfamart.com",
    "actor_role": "DC Admin"
  }
  ```

---

## 3. Timeline & Issues (Pembangunan)

### `POST /api/dc-development/projects/:id/timelines`
Membuat _Gantt Chart_ / Timeline task pekerjaan.
- **Request Body**:
  ```json
  {
    "task_name": "Pengecoran Pondasi",
    "start_date": "2026-08-01",
    "end_date": "2026-08-15"
  }
  ```

### `PUT /api/dc-development/timelines/:id`
*Update progress* task pembangunan (0-100%).
- **Request Body**: `{ "progress_percent": 50, "status": "ON_PROGRESS" }`

### `POST /api/dc-development/projects/:id/issues`
Melaporkan kendala di lapangan (_Issue Tracker_).
- **Request Body**:
  ```json
  {
    "issue_type": "MATERIAL_DELAY",
    "title": "Semen terlambat datang",
    "description": "Truk mogok di tol",
    "severity": "HIGH"
  }
  ```

---

## 4. Pembayaran (Termin) & BAST

### `POST /api/dc-development/projects/:id/term-schedules`
Membuat jadwal pembayaran (Termin).
- **Request Body**:
  ```json
  {
    "term_no": 1,
    "percentage": 30,
    "amount": 1500000000,
    "requirements": "Pondasi selesai 100%"
  }
  ```

### `POST /api/dc-development/term-claims/:id/submit`
Vendor melakukan klaim pembayaran atas termin yang sudah jatuh tempo/selesai.
- **Request Body**: `{ "claimed_amount": 1500000000 }`

### `POST /api/dc-development/projects/:id/basts`
Membuat dokumen Berita Acara Serah Terima (BAST).

---

## 5. Penyimpanan Dokumen DC (Archive & Custom Items)

Modul DC memiliki mekanisme manajemen dokumen sendiri yang memisahkan dokumen *Tender*, *Pembangunan*, dan *Legal*.

### `POST /api/dc-development/documents/custom-items`
Admin membuat "Slot Kosong" (*Placeholder*) dokumen custom yang nantinya wajib diunggah oleh pihak terkait.
- **Request Body**:
  ```json
  {
    "stage": "PEMBANGUNAN",
    "title": "Sertifikat Uji Beton",
    "slots": ["PDF/JPEG"]
  }
  ```

### `POST /api/dc-development/documents`
Mengunggah file asli ke dalam slot dokumen (menggunakan `multipart/form-data`).

### `POST /api/dc-development/archives`
Mendaftarkan Proyek DC lawas langsung ke dalam rak arsip (tanpa harus melalui proses lelang dan pembangunan di dalam sistem SPARTA).
