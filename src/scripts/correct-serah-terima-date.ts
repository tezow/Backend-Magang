import { pool } from "../db/pool";
import { GoogleProvider } from "../common/google";
import { serahTerimaService } from "../modules/serah-terima/serah-terima.service";

const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
};

const nomorUlok = arg("nomor-ulok");
const cabang = arg("cabang");
const tanggal = arg("tanggal");

const run = async () => {
    if (!nomorUlok || !tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        throw new Error(
            "Gunakan: npm run correct:serah-terima-date -- --nomor-ulok=... --tanggal=YYYY-MM-DD [--cabang=...]"
        );
    }

    const result = await pool.query<{ id: number }>(
        `
        UPDATE berkas_serah_terima bst
        SET created_at = ($1::date + COALESCE(bst.created_at::time, TIME '00:00:00'))::timestamp
        FROM toko t
        WHERE t.id = bst.id_toko
          AND t.nomor_ulok = $2
          AND ($3::text IS NULL OR UPPER(t.cabang) = UPPER($3::text))
        RETURNING bst.id
        `,
        [tanggal, nomorUlok, cabang ?? null]
    );

    if (result.rows.length === 0) {
        throw new Error("Berkas Serah Terima pada scope tersebut tidak ditemukan.");
    }

    await GoogleProvider.initialize();

    for (const row of result.rows) {
        await serahTerimaService.regeneratePdfByBerkasId(row.id);
        console.log(`ST ${row.id}: tanggal, denda, total KTK, dan PDF selesai diperbarui.`);
    }
};

run()
    .catch((error) => {
        console.error("Koreksi tanggal Serah Terima gagal:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
