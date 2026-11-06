import { pool } from "../db/pool";
import { opnameFinalRepository } from "../modules/opname-final/opname-final.repository";

const run = async () => {
    const result = await pool.query<{ id: number }>("SELECT id FROM opname_final ORDER BY id");
    let updated = 0;

    for (const row of result.rows) {
        await opnameFinalRepository.updateTotals(String(row.id));
        updated += 1;
    }

    console.log(`Backfill total KTK selesai: ${updated} opname_final diperbarui.`);
};

run()
    .catch((error) => {
        console.error("Backfill total KTK gagal:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
