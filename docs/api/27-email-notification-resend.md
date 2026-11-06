# Spesifikasi API: Email Notification & Resend

Modul ini bertugas sebagai jembatan komunikasi antara aplikasi SPARTA dengan _Email Server_ internal Alfamart (Outlook/Exchange) menggunakan protokol SMTP atau OAuth Client. Terkadang email gagal terkirim karena _server timeout_, sehingga modul _Resend_ disediakan untuk memicu pengiriman ulang secara manual oleh Admin.

---

## 1. Pengiriman Notifikasi (General)

### `POST /api/email-notification/send-email-notification`
Dipanggil secara internal oleh _backend_ (atau *cron job*) untuk memasukkan pesan notifikasi ke dalam antrean (Queue). 
*(Tidak disarankan dipanggil langsung oleh Frontend kecuali untuk pengujian).*

---

## 2. Fitur Resend (Pengiriman Ulang)

Digunakan ketika Kontraktor mengeluh "Email SPK / RAB belum masuk". Admin dapat memicu ulang email tersebut dari halaman *Dashboard Admin*.

### `POST /api/email-resend/resend-email`
Mengirim ulang dokumen RAB (beserta lampiran PDF-nya) ke email vendor.
- **Request Body (JSON)**:
  ```json
  {
    "ulok": "UZ01-2601-0001",
    "lingkup": "SIPIL",
    "cabang": "Balaraja"
  }
  ```

### `POST /api/email-resend/resend-email-spk`
Mengirim ulang dokumen SPK ke email vendor.
- **Request Body (JSON)**: Sama dengan skema di atas (`ulok`, `lingkup`, `cabang`).

---

## 3. Helper Dropdown (Untuk UI Resend)

Frontend membutuhkan referensi data agar Admin tidak perlu mengetik manual saat ingin me-_resend_ email.

### `GET /api/email-resend/cabang-list`
Menarik daftar Cabang untuk diisi di dropdown pertama. Parameter `keyword` (opsional).

### `GET /api/email-resend/ulok-by-cabang`
Ketika Admin memilih Cabang, dropdown kedua akan menarik _list_ ULOK dari cabang tersebut.
- **Query Parameter**: `cabang=Balaraja`.

### `GET /api/email-resend/lingkup-by-ulok`
Ketika Admin memilih ULOK, dropdown ketiga akan mendeteksi apakah di ULOK ini terdapat proyek SIPIL, ME, atau keduanya.
- **Query Parameter**: `ulok=UZ01-2601-0001`.

---

## 4. Debugging

### `GET /api/email-resend/debug/oauth-clients`
Endpoint terbatas (Super Admin) untuk mengecek status kesehatan koneksi ke *Server* Email Alfamart (OAuth token valid/expired).
