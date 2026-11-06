const { pool } = require('../../db/pool');

async function fixData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Delete the garbage SIPIL record from 1VZ1 (ID 2478)
    const garbageId = 2478;
    await client.query("DELETE FROM kategori_pekerjaan_gantt WHERE id_gantt IN (SELECT id FROM gantt_chart WHERE id_toko = $1)", [garbageId]);
    await client.query("DELETE FROM day_gantt_chart WHERE id_gantt IN (SELECT id FROM gantt_chart WHERE id_toko = $1)", [garbageId]);
    await client.query("DELETE FROM dependency_gantt WHERE id_gantt IN (SELECT id FROM gantt_chart WHERE id_toko = $1)", [garbageId]);
    await client.query("DELETE FROM pengawasan_gantt WHERE id_gantt IN (SELECT id FROM gantt_chart WHERE id_toko = $1)", [garbageId]);
    await client.query("DELETE FROM gantt_chart_note WHERE id_gantt IN (SELECT id FROM gantt_chart WHERE id_toko = $1)", [garbageId]);
    await client.query("DELETE FROM gantt_chart WHERE id_toko = $1", [garbageId]);
    await client.query("DELETE FROM toko WHERE id = $1", [garbageId]);

    // 2. Update the ME record (ID 2482) from 1VZ1 to LZ01 and LAMPUNG
    const meId = 2482;
    await client.query("UPDATE toko SET nomor_ulok = 'LZ01-2606-0004', cabang = 'LAMPUNG' WHERE id = $1", [meId]);
    
    // 3. Update the SPK for ME record to LZ01
    await client.query("UPDATE pengajuan_spk SET nomor_ulok = 'LZ01-2606-0004' WHERE id_toko = $1", [meId]);
    
    await client.query('COMMIT');
    console.log("Data successfully migrated.");
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}
fixData();
