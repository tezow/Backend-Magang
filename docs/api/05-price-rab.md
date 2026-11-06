# Spesifikasi API: Price RAB (Master Harga Cabang)

Modul ini menyediakan referensi *Master Price* (Standar Harga Material dan Upah) yang berlaku di setiap cabang. Data harga ini ditarik oleh sistem (terutama di _frontend_ saat pembuatan RAB) untuk memastikan penawaran harga kontraktor sesuai dengan standar Alfamart di area geografis tersebut.

---

## 1. Menarik Master Harga Cabang

Kedua _endpoint_ di bawah memanggil fungsi _controller_ yang sama di backend.

### `GET /api/price-rab/get-data`
### `GET /api/price-rab/get-data-price-rab`

- **Query Parameters**:
  - `cabang`: `string` (Wajib, nama cabang. Contoh: "Balaraja")
  - `lingkup`: `string` (Wajib, lingkup pekerjaan. Contoh: "Sipil" atau "ME")
- **Response**:
  - `200 OK`: Mengembalikan daftar _array_ harga satuan material dan upah.
    ```json
    [
      {
        "kategori_pekerjaan": "Pekerjaan Pasangan",
        "jenis_pekerjaan": "Pasang Bata Merah",
        "satuan": "m2",
        "harga_material": 35000,
        "harga_upah": 15000
      }
    ]
    ```
  - `400 Bad Request`:
    ```json
    {
      "error": "Missing 'cabang' or 'lingkup' parameter"
    }
    ```
  - `404 Not Found` atau `500 Server Error`:
    Jika data harga belum di-_import_ untuk cabang tersebut.
    ```json
    {
      "error": "Harga Master untuk cabang Balaraja lingkup Sipil belum tersedia"
    }
    ```

## Catatan Integrasi
Sistem backend sering menembak _endpoint_ internal ini atau menggunakan `priceRabService.getData` pada saat mengeksekusi _endpoint_ sinkronisasi harga (`/api/rab/:id/sync-branch-prices`) guna memvalidasi ulang harga *final* yang disimpan di _database_.
