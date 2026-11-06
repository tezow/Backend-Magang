import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position;
    `);
    
    let currentTable = '';
    for (const row of res.rows) {
      if (row.table_name !== currentTable) {
        console.log(`\nTable: ${row.table_name}`);
        currentTable = row.table_name;
      }
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    }
  } catch (err) {
    console.error('Error executing query', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
