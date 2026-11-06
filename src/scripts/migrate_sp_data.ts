import { pool } from "../db/pool";

async function main() {
    const client = await pool.connect();
    
    // Set ini ke TRUE jika hanya ingin simulasi (tidak menyimpan ke DB)
    const DRY_RUN = false; 

    try {
        console.log("Memulai proses migrasi Surat Peringatan...");
        await client.query("BEGIN");

        // 1. Ambil semua denda_action
        const resActions = await client.query(`
            SELECT id, id_toko, nomor_ulok, lingkup_pekerjaan, sp_level, status, created_at, updated_at, actor_email, actor_role
            FROM denda_keterlambatan_action
            WHERE action_type = 'SP'
            ORDER BY id_toko, nomor_ulok, created_at ASC, id ASC
        `);
        
        const actions = resActions.rows;

        // Grouping by nomor_ulok
        const grouped: Record<string, typeof actions> = {};
        for (const action of actions) {
            const key = action.nomor_ulok;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(action);
        }

        console.log(`Ditemukan ${Object.keys(grouped).length} group ULOK unik.`);

        // 2. Loop setiap group
        for (const key of Object.keys(grouped)) {
            const groupActions = grouped[key];
            const primaryAction = groupActions[groupActions.length - 1]; // Yang terakhir dibuat adalah primary
            const otherActions = groupActions.slice(0, -1);

            console.log(`\nMemproses ULOK: ${primaryAction.nomor_ulok} (Total rows: ${groupActions.length})`);
            
            // a. Cek lingkup pekerjaan dari pengajuan_spk
            const resSpk = await client.query(`
                SELECT DISTINCT lingkup_pekerjaan
                FROM pengajuan_spk
                WHERE nomor_ulok = $1
                ORDER BY lingkup_pekerjaan DESC
            `, [primaryAction.nomor_ulok]);
            
            let combinedLingkup = primaryAction.lingkup_pekerjaan;
            if (resSpk.rows.length > 0) {
                // Filter out nulls/empty
                const validLingkups = resSpk.rows
                    .map(r => r.lingkup_pekerjaan?.trim().toUpperCase())
                    .filter(Boolean);
                
                if (validLingkups.length > 0) {
                    combinedLingkup = validLingkups.join(' + ');
                }
            }

            console.log(`- Debug Lingkup: Primary = ${primaryAction.lingkup_pekerjaan}, Valid = ${JSON.stringify(resSpk.rows)}, Combined = ${combinedLingkup}`);

            // b. Update primary action
            if (primaryAction.lingkup_pekerjaan !== combinedLingkup) {
                console.log(`- Mengupdate lingkup_pekerjaan ID ${primaryAction.id} menjadi: ${combinedLingkup}`);
                await client.query(`
                    UPDATE denda_keterlambatan_action
                    SET lingkup_pekerjaan = $1
                    WHERE id = $2
                `, [combinedLingkup, primaryAction.id]);
            }

            // c. Migrasikan action lain ke activity_log dan hapus baris ganda
            for (const oldAction of otherActions) {
                // Insert ke activity_log
                const actionName = oldAction.status === 'REJECTED_BY_MANAGER' ? 'DITOLAK_MANAGER' :
                                   oldAction.status === 'SENT_TO_CONTRACTOR' ? 'DIKIRIM_KE_KONTRAKTOR' :
                                   'SISTEM_MIGRASI';
                const reason = `Hasil migrasi baris ganda ID ${oldAction.id} (Lingkup sebelumnya: ${oldAction.lingkup_pekerjaan})`;
                
                console.log(`- Memindahkan ID ${oldAction.id} (Level ${oldAction.sp_level}) ke activity_log...`);
                await client.query(`
                    INSERT INTO activity_log (
                        entity_type, entity_id, actor_email, actor_role, action,
                        status_before, status_after, reason, created_at, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    'DENDA_ACTION',
                    primaryAction.id, // Dipetakan ke primaryAction ID
                    oldAction.actor_email || 'sistem',
                    oldAction.actor_role || 'SISTEM',
                    actionName,
                    'OPEN',
                    oldAction.status,
                    reason,
                    oldAction.updated_at || oldAction.created_at,
                    JSON.stringify(oldAction)
                ]);

                // Hapus baris lama
                console.log(`- Menghapus baris lama ID ${oldAction.id} dari denda_keterlambatan_action`);
                await client.query(`
                    DELETE FROM denda_keterlambatan_action WHERE id = $1
                `, [oldAction.id]);
            }
        }

        if (DRY_RUN) {
            console.log("\n[DRY_RUN] Mengembalikan perubahan (ROLLBACK)...");
            await client.query("ROLLBACK");
        } else {
            console.log("\nMenyimpan perubahan (COMMIT)...");
            await client.query("COMMIT");
            console.log("Migrasi selesai dengan sukses!");
        }

    } catch (e) {
        console.error("Terjadi error, membatalkan migrasi (ROLLBACK)...", e);
        await client.query("ROLLBACK");
    } finally {
        client.release();
        pool.end();
    }
}

main();
