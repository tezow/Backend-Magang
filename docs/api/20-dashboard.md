# Spesifikasi API: Dashboard & Analytics

Modul ini sangat masif karena merupakan agregator data (_Read-Only_) yang menarik data dari puluhan tabel lain untuk disajikan dalam bentuk metrik, grafik, *timeline*, dan tabel performa (*leaderboard*). Akses ke modul ini diatur ketat berdasarkan _Role_ (Koordinator, Manajer, Super Admin, Kontraktor).

Secara garis besar, Dashboard dibagi menjadi **4 Segmen Utama**:
1. Dashboard Proyek (V2)
2. Dashboard KPI (Performa Internal)
3. Dashboard Kontraktor (Performa Eksternal)
4. Export Excel Massal

---

## 1. Dashboard Proyek V2

Menampilkan metrik berjalannya toko/proyek.

### `GET /api/dashboard/v2/summary`
Menampilkan angka-angka statistik di atas *Dashboard* (Card Metrics).
- **Query Parameters**:
  - `actor_role`, `actor_cabang`, `job_type` ("ALL"|"REGULER"|"RENOVASI"), `tipe_bangunan`.
- **Response**: Mengembalikan total toko, total denda, SPK aktif, dll.

### `GET /api/dashboard/v2/charts`
Data grafik *bar/line* untuk *chart* penyelesaian proyek.
- **Query Parameters**: `period` ("1m", "3m", "6m", "1y", "all").

### `GET /api/dashboard/v2/timeline/:tokoId`
Sangat krusial untuk fitur lacak jejak (*traceability*). Menampilkan *timeline vertical* dari sebuah proyek mulai dari:
FPD -> RAB -> SPK -> Pengawasan -> Opname -> BAST.
Bisa menampilkan log tanggal kapan tiap tahapan tersebut selesai.

### `GET /api/dashboard/v2/cards/:cardType`
*Drilldown* ketika _user_ mengklik salah satu angka di _summary_. Akan mengembalikan _list_ toko spesifik pembentuk angka tersebut.
- `cardType`: "TOTAL_TOKO", "SLA", "TOTAL_DENDA", dll.

---

## 2. Dashboard KPI Internal (Performance SAT)

Analisis Performa waktu respons tim internal Alfamart (Project Planning, Koordinator, dsb.) terhadap tugas harian.

*(Akses Dibatasi: Dilarang untuk role Kontraktor. Biasanya hanya Super Admin & Manajemen).*

### `GET /api/dashboard/performance/summary`
Rangkuman pencapaian SLA (Service Level Agreement) tim (Berapa lama approval FPD? Berapa lama RAB dibuat?).

### `GET /api/dashboard/performance/table`
Menampilkan tabel performa Koordinator vs Cabang secara *head-to-head*.

### `GET /api/dashboard/performance/drilldown`
Melihat kasus/toko mana yang membuat rapor seorang koordinator merah.

---

## 3. Dashboard Kontraktor (Contractor Performance)

Rapor untuk _vendor/partner_. Menilai kecepatan, kualitas, dan *attitude* (SP) para Kontraktor.

### `GET /api/dashboard/contractor/summary`
Menampilkan nilai total proyek yang di-_handle_ dan rapor umum.

### `GET /api/dashboard/contractor/leaderboard`
Tabel klasemen (Ranking) kontraktor terbaik secara Nasional/Cabang.

### `GET /api/dashboard/contractor/drilldown-sp-history`
Melacak daftar Surat Peringatan (SP) yang pernah dilayangkan ke kontraktor bersangkutan selama tahun berjalan.

---

## 4. Pencarian & Export Global

### `GET /api/dashboard/projects`
Pencarian tabel proyek global, _pagination_, dengan _filter_ lengkap `stage` (tahap) dan *sorting* `priority` / `latest`.

### `GET /api/dashboard/export`
Memaksa sistem men-_generate_ file Excel (`.xlsx`) berukuran besar yang berisi baris-baris ratusan data toko sesuai filter _user_ di layar, untuk diolah lebih lanjut di Microsoft Excel.
- **Query Parameters**: Mendukung banyak variasi (contoh: `months=1,2,3`, `year=2026`, `format=xlsx`).
