import { pool } from "../db/pool";
import { calculateDendaByTokoId } from "../modules/denda/denda-keterlambatan";

type ScopeRow = {
    representative_id_toko: number;
    nomor_ulok: string;
    cabang: string | null;
    serah_terima_count: number;
};

type OpnameRow = {
    id: number;
    id_toko: number;
    lingkup_pekerjaan: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
};

const isApplyMode = process.argv.includes("--apply");

const listAffectedScopes = async (): Promise<ScopeRow[]> => {
    const result = await pool.query<ScopeRow>(
        `
        SELECT
            MIN(t.id) AS representative_id_toko,
            t.nomor_ulok,
            t.cabang,
            COUNT(DISTINCT bst.id)::int AS serah_terima_count
        FROM toko t
        JOIN berkas_serah_terima bst ON bst.id_toko = t.id
        WHERE t.nomor_ulok IS NOT NULL
        GROUP BY t.nomor_ulok, t.cabang
        HAVING COUNT(DISTINCT bst.id) > 1
        ORDER BY t.nomor_ulok, t.cabang
        `
    );

    return result.rows;
};

const listScopeOpnames = async (idToko: number): Promise<OpnameRow[]> => {
    const result = await pool.query<OpnameRow>(
        `
        SELECT
            ofn.id,
            ofn.id_toko,
            peer_toko.lingkup_pekerjaan,
            ofn.hari_denda,
            ofn.nilai_denda,
            ofn.tanggal_akhir_spk_denda,
            ofn.tanggal_serah_terima_denda
        FROM opname_final ofn
        JOIN toko peer_toko ON peer_toko.id = ofn.id_toko
        JOIN toko target_toko ON target_toko.id = $1
        WHERE peer_toko.nomor_ulok = target_toko.nomor_ulok
          AND (
              target_toko.cabang IS NULL
              OR peer_toko.cabang IS NULL
              OR UPPER(peer_toko.cabang) = UPPER(target_toko.cabang)
          )
        ORDER BY ofn.id
        `,
        [idToko]
    );

    return result.rows;
};

const main = async () => {
    const scopes = await listAffectedScopes();
    const previews: Array<Record<string, unknown>> = [];

    for (const scope of scopes) {
        const calculated = await calculateDendaByTokoId(scope.representative_id_toko);
        const opnames = await listScopeOpnames(scope.representative_id_toko);

        for (const opname of opnames) {
            previews.push({
                nomor_ulok: scope.nomor_ulok,
                cabang: scope.cabang,
                lingkup_pekerjaan: opname.lingkup_pekerjaan,
                opname_final_id: opname.id,
                old_hari_denda: Number(opname.hari_denda ?? 0),
                new_hari_denda: calculated.hari_denda,
                old_nilai_denda: Number(opname.nilai_denda ?? 0),
                new_nilai_denda: calculated.nilai_denda,
                old_tanggal_serah_terima: opname.tanggal_serah_terima_denda,
                new_tanggal_serah_terima: calculated.tanggal_serah_terima
            });
        }
    }

    console.table(previews);

    if (!isApplyMode) {
        console.log(`Preview selesai: ${previews.length} opname dari ${scopes.length} scope. Gunakan --apply untuk menyimpan.`);
        return;
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
            CREATE TABLE IF NOT EXISTS first_serah_terima_penalty_repair_audit (
                opname_final_id INT PRIMARY KEY,
                id_toko INT NOT NULL,
                old_hari_denda INT,
                old_nilai_denda NUMERIC,
                old_tanggal_akhir_spk_denda DATE,
                old_tanggal_serah_terima_denda DATE,
                repaired_hari_denda INT NOT NULL,
                repaired_nilai_denda NUMERIC NOT NULL,
                repaired_tanggal_akhir_spk_denda DATE,
                repaired_tanggal_serah_terima_denda DATE,
                repaired_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);

        for (const scope of scopes) {
            const calculated = await calculateDendaByTokoId(scope.representative_id_toko);
            const opnames = await listScopeOpnames(scope.representative_id_toko);

            for (const opname of opnames) {
                await client.query(
                    `
                    INSERT INTO first_serah_terima_penalty_repair_audit (
                        opname_final_id,
                        id_toko,
                        old_hari_denda,
                        old_nilai_denda,
                        old_tanggal_akhir_spk_denda,
                        old_tanggal_serah_terima_denda,
                        repaired_hari_denda,
                        repaired_nilai_denda,
                        repaired_tanggal_akhir_spk_denda,
                        repaired_tanggal_serah_terima_denda
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (opname_final_id) DO NOTHING
                    `,
                    [
                        opname.id,
                        opname.id_toko,
                        opname.hari_denda,
                        opname.nilai_denda,
                        opname.tanggal_akhir_spk_denda,
                        opname.tanggal_serah_terima_denda,
                        calculated.hari_denda,
                        calculated.nilai_denda,
                        calculated.tanggal_akhir_spk,
                        calculated.tanggal_serah_terima
                    ]
                );

                await client.query(
                    `
                    UPDATE opname_final
                    SET hari_denda = $1,
                        nilai_denda = $2,
                        tanggal_akhir_spk_denda = $3,
                        tanggal_serah_terima_denda = $4
                    WHERE id = $5
                    `,
                    [
                        calculated.hari_denda,
                        calculated.nilai_denda,
                        calculated.tanggal_akhir_spk,
                        calculated.tanggal_serah_terima,
                        opname.id
                    ]
                );
            }
        }

        await client.query("COMMIT");
        console.log(`Koreksi tersimpan: ${previews.length} opname dari ${scopes.length} scope.`);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
