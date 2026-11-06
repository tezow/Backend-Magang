# Spesifikasi API: Auth & SSO

Modul ini bertanggung jawab atas otentikasi pengguna, baik menggunakan metode OTP (One Time Password) yang dikirim ke email maupun integrasi _Single Sign-On_ (SSO).

---

## 1. Login OTP (Standard)

### `POST /api/auth/login`
Digunakan untuk meminta kode OTP ke email pengguna yang terdaftar.

- **Request Body (JSON)**:
  ```json
  {
    "email_sat": "string (format email, wajib)",
    "cabang": "string (wajib)",
    "user_cabang_id": "number (opsional, jika satu email memiliki banyak role)"
  }
  ```
- **Response**:
  - `200 OK`: Mengirimkan OTP ke email.
  - Jika email terdaftar lebih dari satu cabang/role dan `cabang`/`user_cabang_id` tidak disertakan, sistem akan meminta pengguna memilih role.

### `POST /api/auth/verify-otp`
Digunakan untuk memvalidasi token dan kode OTP.

- **Request Body (JSON)**:
  ```json
  {
    "email_sat": "string (format email, wajib)",
    "cabang": "string (wajib)",
    "user_cabang_id": "number (opsional)",
    "otp_token": "string (token yang didapat dari respons login)",
    "otp_code": "string (wajib, 6 digit angka numerik regex: /^\\d{6}$/)"
  }
  ```
- **Response**:
  - `200 OK`: Mengembalikan *user object* beserta token sesi.
  - `401 Unauthorized`: Jika OTP salah atau kedaluwarsa.

---

## 2. Single Sign-On (SSO)

Integrasi SSO dilakukan dengan sistem terpusat. Front-end melakukan _redirect_ ke portal SSO, yang kemudian me-lempar _callback_ ke endpoint ini.

### `GET /api/auth/sso/callback`
Endpoint ini menerima token _launch_ dari portal SSO.

- **Query Parameters**:
  - `token`: `string` (Launch token dari sistem SSO)
- **Workflow / Response**:
  1. Melakukan POST ke `SSO_EXCHANGE_URL` untuk menukar token dengan data email.
  2. Jika berhasil, men-_generate_ JWT Payload (kedaluwarsa dalam 5 menit).
  3. Mengarahkan ulang (*Redirect*) pengguna kembali ke frontend (`FRONTEND_URL/auth?sso_payload={payload}`).
  4. Jika gagal, redirect ke frontend dengan parameter `?error={kode_error}`.

### `POST /api/auth/sso/resolve`
Dipanggil oleh *frontend* setelah menerima `sso_payload` dari proses *redirect* di atas.

- **Request Body (JSON)**:
  ```json
  {
    "payload": "string (JWT sso_payload dari URL, wajib)",
    "cabang": "string (opsional, jika kosong dan punya banyak role, sistem akan mengembalikan list available_roles)",
    "user_cabang_id": "number (opsional)"
  }
  ```
- **Response**:
  - `200 OK`: 
    ```json
    {
      "status": "success",
      "data": {
        "id": 1,
        "email_sat": "admin@alfamart.com",
        "cabang": "Balaraja",
        "jabatan": "Koordinator",
        "coverage": ["Balaraja", "Cikokol"],
        "token": "jwt_session_token_here",
        "alamat_cabang": "Jl. Raya Balaraja..."
      }
    }
    ```
  - **Kondisi Khusus (Butuh Pemilihan Akun)**:
    Jika payload `cabang` kosong dan *user* memiliki banyak *role*:
    ```json
    {
      "status": "success",
      "data": {
        "requires_account_selection": true,
        "available_roles": [
           { "id": 1, "cabang": "Balaraja", "jabatan": "Manager" },
           { "id": 2, "cabang": "Cikokol", "jabatan": "Koordinator" }
        ]
      }
    }
    ```

---

## 3. Webhook (Internal Sync)

### `POST /api/sso/webhook/email`
Digunakan oleh sistem HR/SSO pusat untuk memberi tahu SPARTA apabila ada karyawan yang mengganti alamat email.

- **Headers**:
  - `x-sparta-internal-key`: `string` (Wajib, cocok dengan `SPARTA_INTERNAL_API_KEY`)
- **Request Body (JSON)**:
  ```json
  {
    "oldEmail": "string",
    "newEmail": "string"
  }
  ```
- **Response**:
  - `200 OK`: Memperbarui data `email_sat` pada tabel `user_cabang`.
  - `401 Unauthorized`: Jika header *secret key* tidak valid.
  - `400 Bad Request`: Jika `oldEmail` atau `newEmail` tidak disertakan.
