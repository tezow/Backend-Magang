# Spesifikasi API: User Cabang (Pengguna)

Modul ini mengelola data pengguna (akun) yang bisa _login_ ke dalam SPARTA. Selain itu, modul ini mengatur cakupan akses wilayah (Coverage Branch) dari pengguna tersebut.

---

## 1. Menarik Daftar Pengguna

### `GET /api/user-cabang`
Mengambil daftar pengguna yang terdaftar di aplikasi.

- **Query Parameters**:
  - `search`: `string` (Opsional, kata kunci nama/email)
  - `cabang`: `string` (Opsional, filter berdasarkan cabang asli pengguna)
  - `email_sat`: `string` (Opsional)
  - `jabatan`: `string` (Opsional, filter _role_)
  - `nama_pt`: `string` (Opsional, khusus kontraktor)
  - `include_branch_scope`: `boolean` (Opsional, jika `true`, kembalikan relasi _branch coverage_)
  - `workspace`: `"store" | "dc"` (Opsional, filter divisi)
- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": [
        {
          "id": 1,
          "cabang": "Balaraja",
          "email_sat": "admin@alfamart.com",
          "nama_lengkap": "Budi Santoso",
          "jabatan": "Manager",
          "nama_pt": null,
          "workspace": "store"
        }
      ]
    }
    ```

## 2. Manajemen Pengguna (CRUD)
Aksi CRUD dibatasi oleh _middleware_. Hanya _user_ dengan jabatan **SUPER HUMAN** atau **STORE & BRANCH CONTROLLING** yang dapat melakukan manipulasi data.

### `POST /api/user-cabang`
Membuat pengguna baru.

- **Request Body (JSON)**:
  ```json
  {
    "cabang": "string (Wajib, misal: Balaraja)",
    "email_sat": "string (Wajib, format email)",
    "nama_lengkap": "string (Opsional)",
    "jabatan": "string (Opsional)",
    "nama_pt": "string (Opsional)",
    "workspace": "store | dc (Opsional)"
  }
  ```
- **Response**:
  - `201 Created`:
    ```json
    {
      "status": "success",
      "message": "Data user_cabang berhasil disimpan",
      "data": { ... }
    }
    ```
  - `403 Forbidden`: Jika tidak memiliki hak akses (*Role* tidak sesuai).

### `GET /api/user-cabang/:id`
Mengambil detail spesifik satu pengguna.
- **Response**: `200 OK`

### `PUT /api/user-cabang/:id`
Mengubah data pengguna yang sudah ada. Minimal harus ada satu *field* yang diubah.

- **Request Body (JSON)**:
  ```json
  {
    "cabang": "string (Opsional)",
    "email_sat": "string (Opsional)",
    "nama_lengkap": "string (Opsional, bisa null)",
    "jabatan": "string (Opsional, bisa null)",
    "nama_pt": "string (Opsional, bisa null)",
    "workspace": "store | dc (Opsional)"
  }
  ```
- **Response**:
  - `200 OK`: Jika sukses.

### `DELETE /api/user-cabang/:id`
Menghapus _record_ pengguna.
- **Response**: `200 OK`

---

## 3. Hak Akses (My Coverage)

### `GET /api/user-cabang/my-coverage`
Endpoint yang sangat sering dipanggil oleh _Frontend_ di awal setelah _login_. Ini menentukan cabang mana saja yang data-nya boleh dilihat oleh _user_ yang bersangkutan.

- **Request Body**: (Tidak ada, identitas ditarik dari JWT Token Header)
- **Response**:
  - `200 OK`:
    ```json
    {
      "status": "success",
      "data": {
        "branches": ["Balaraja", "Cikokol", "Serang"],
        "source": "database_coverage",
        "user": {
          "email_sat": "admin@alfamart.com",
          "cabang": "Balaraja",
          "jabatan": "Koordinator",
          "roles": ["Koordinator"]
        }
      }
    }
    ```
  - `401 Unauthorized`: Jika sesi di token tidak valid.
