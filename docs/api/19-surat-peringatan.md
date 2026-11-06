# Spesifikasi API: Surat Peringatan (SP) & Tindakan Tegas

Modul ini adalah ekstensi (sub-modul) dari Denda, ter-di-_mount_ di rute `/api/denda/actions`. Digunakan jika keterlambatan proyek sangat ekstrem (mencapai limit 30 hari/60 hari), atau jika ada unsur manipulasi, sehingga perlu dikeluarkan SP 1, 2, 3 hingga sanksi _Takeover_ proyek/ *Blacklist* vendor.

---

## 1. Daftar Kandidat & Kontraktor

### `GET /api/denda/actions/candidates`
Menarik daftar toko/proyek yang sedang terlambat parah (sudah melewati batas hari denda) namun belum diberi SP. (Rekomendasi dari sistem).

### `GET /api/denda/actions/kontraktor`
Menarik *list* seluruh kontraktor beserta skor rapor/akumulasi SP yang mereka kumpulkan di tahun ini.

---

## 2. Membuat SP atau Rekomendasi Takeover

### `POST /api/denda/actions`
Digunakan oleh Koordinator/Admin Cabang untuk membuat *draft* Surat Peringatan.
- **Headers**: `Content-Type: multipart/form-data`
- **Form Data Fields (Files)**: `lampiran` (Opsional, foto bukti kelalaian).
- **Form Data Fields (Teks JSON)**:
  - `action_type`: `SP` atau `TAKEOVER`.
  - `id_toko`: (Opsional, tergantung alasan. Jika alasan Manipulasi, bisa tanpa `id_toko`).
  - `nama_kontraktor`: `PT Bangun Persada`.
  - `sp_level`: `1 | 2 | 3`.
  - `alasan_sp`: `KETERLAMBATAN | MENOLAK_SPK | MANIPULASI | KELALAIAN | LAINNYA`.
  - `catatan`: "Keramik tidak terpasang sama sekali, vendor kabur".

---

## 3. Persetujuan Manajer

Surat Peringatan 2 dan 3, serta *Takeover*, wajib disetujui Manajer sebelum *email* resmi dikirim ke Kontraktor.

### `POST /api/denda/actions/:id/approve`
- **Request Body**: (Kosong, mengandalkan _session token_ Manajer).

### `POST /api/denda/actions/:id/reject`
- **Request Body**: `{ "alasan_penolakan": "Berikan SP 1 dulu" }`

---

## 4. Portal Kontraktor (Penerimaan SP)

Vendor/Kontraktor mendapat email link yang mengarah ke rute publik terbatas ini.

### `GET /api/denda/actions/kontraktor/list`
Daftar SP yang dialamatkan ke kontraktor tersebut.

### `POST /api/denda/actions/kontraktor/:id/acknowledge`
Kontraktor menekan tombol "Saya Mengerti dan Mengakui Kelalaian" di _Dashboard_ mereka.
- **Request Body**: `{ "catatan_acknowledge": "Kami mohon maaf dan akan mengebut pengerjaan" }`
Status SP berubah menjadi `ACKNOWLEDGED_BY_CONTRACTOR`.

---

## 5. Cron Jobs & Analitik

### `POST /api/denda/actions/cron/run-all`
(Internal Server). Memicu paksa proses latar belakang (_cron_) yang biasanya mengecek setiap jam 00:00 apakah ada SP yang _Expired_ (tidak direspon kontraktor selama > 3 hari), sehingga sistem otomatis merekomendasikan kenaikan level SP berikutnya.

### `GET /api/denda/actions/analytics`
Data statistik (chart pie) jumlah SP1, SP2, SP3, Takeover secara nasional bulan ini.
