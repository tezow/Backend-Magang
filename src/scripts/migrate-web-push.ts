import { pool } from "../db/pool";

async function up() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
          id SERIAL PRIMARY KEY,
          email_sat VARCHAR(255) NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh VARCHAR(255) NOT NULL,
          auth VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_web_push_email ON web_push_subscriptions(email_sat);
    `);
    console.log("Tabel web_push_subscriptions berhasil dibuat.");
  } catch (err) {
    console.error("Gagal membuat tabel:", err);
  } finally {
    pool.end();
  }
}

up();
