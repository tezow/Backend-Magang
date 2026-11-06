# Spesifikasi API: Task Notifications (Pemberitahuan Tugas)

Modul ini bertanggung jawab untuk memberikan angka indikator "Tugas Tertunda" (Badge Notifikasi warna merah) di *header/sidebar* aplikasi Frontend. Data dihitung secara *real-time* dan disesuaikan secara ketat dengan *Role* dan *Cabang* masing-masing *user* yang sedang *login*.

---

## 1. Menarik Notifikasi Tugas

### `GET /api/task-notification`
Menghitung seluruh jumlah (count) dokumen yang masih "Menunggu Persetujuan" atau "Butuh Aksi" oleh *user* saat ini.

- **Request**: (Tidak butuh parameter, mengandalkan identitas token JWT JWT).
- **Response**:
  ```json
  {
    "status": "success",
    "data": {
      "total": 14,
      "groups": [
        {
          "title": "FPD Butuh Approval",
          "count": 5,
          "link": "/fpd?status=WAITING_APPROVAL"
        },
        {
          "title": "RAB Butuh Direview",
          "count": 3,
          "link": "/rab?status=WAITING"
        },
        {
          "title": "SPK Menunggu Tanda Tangan",
          "count": 6,
          "link": "/spk?status=WAITING"
        }
      ]
    }
  }
  ```

*Catatan Mekanisme Backend: API ini mengeksekusi banyak sekali kueri perhitungan SQL (`COUNT()`) paralel (FPD, RAB, DC, SP, SPK, Instruksi Lapangan, Opname Final, Pertambahan SPK, dsb.) menggunakan metode `Promise.all()` di layer `repository` agar *latency*-nya tetap rendah.*
