import { pool } from "../db/pool";
import { instruksiLapanganService } from "../modules/instruksi-lapangan/instruksi-lapangan.service";

const run = async () => {
    const result = await pool.query<{ id: number }>(
        "SELECT id FROM instruksi_lapangan ORDER BY id"
    );
    let regenerated = 0;

    for (const row of result.rows) {
        await instruksiLapanganService.generateAndStorePdf(String(row.id));
        regenerated += 1;
        console.log(`PDF IL ${row.id} selesai diregenerasi (${regenerated}/${result.rows.length}).`);
    }
};

run()
    .catch((error) => {
        console.error("Regenerasi PDF Instruksi Lapangan gagal:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
