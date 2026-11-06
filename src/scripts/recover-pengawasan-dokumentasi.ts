import fs from "node:fs";
import path from "node:path";
import { pool, withTransaction } from "../db/pool";

const args = new Map(
    process.argv.slice(2).map((arg) => {
        const [key, ...rest] = arg.replace(/^--/, "").split("=");
        return [key, rest.join("=") || "true"];
    })
);

const ulok = args.get("ulok");
const lingkup = args.get("lingkup");
const tanggal = args.get("tanggal");
const commit = args.get("commit") === "true";

if (!ulok || !lingkup || !tanggal) {
    throw new Error("Usage: --ulok=Z001-3007-0102-R --lingkup=SIPIL --tanggal=23/08/2026 [--commit]");
}

const targetUlok = ulok;
const targetLingkup = lingkup;
const targetTanggal = tanggal;

type Candidate = {
    target_id: number;
    source_id: number | null;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    target_tanggal: string;
    source_tanggal: string | null;
    source_dokumentasi: string | null;
};

const csvCell = (value: unknown): string => {
    const raw = String(value ?? "");
    if (!/[",\n\r]/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
};

async function main() {
    const result = await pool.query<Candidate>(
        `
        WITH target_rows AS (
            SELECT p.id, p.id_gantt, p.id_pengawasan_gantt, p.kategori_pekerjaan, p.jenis_pekerjaan,
                   t.nomor_ulok, t.lingkup_pekerjaan, pg.tanggal_pengawasan
            FROM pengawasan p
            JOIN pengawasan_gantt pg ON pg.id = p.id_pengawasan_gantt
            JOIN gantt_chart g ON g.id = p.id_gantt
            JOIN toko t ON t.id = g.id_toko
            WHERE t.nomor_ulok = $1
              AND t.lingkup_pekerjaan = $2
              AND pg.tanggal_pengawasan = $3
              AND p.status = 'selesai'
              AND NULLIF(TRIM(p.dokumentasi), '') IS NULL
        )
        SELECT tr.id AS target_id,
               src.id AS source_id,
               tr.nomor_ulok,
               tr.lingkup_pekerjaan,
               tr.kategori_pekerjaan,
               tr.jenis_pekerjaan,
               tr.tanggal_pengawasan AS target_tanggal,
               src.tanggal_pengawasan AS source_tanggal,
               src.dokumentasi AS source_dokumentasi
        FROM target_rows tr
        LEFT JOIN LATERAL (
            SELECT p2.id, pg2.tanggal_pengawasan, p2.dokumentasi
            FROM pengawasan p2
            JOIN pengawasan_gantt pg2 ON pg2.id = p2.id_pengawasan_gantt
            WHERE p2.id_gantt = tr.id_gantt
              AND p2.id <> tr.id
              AND p2.kategori_pekerjaan = tr.kategori_pekerjaan
              AND p2.jenis_pekerjaan = tr.jenis_pekerjaan
              AND p2.status = 'selesai'
              AND NULLIF(TRIM(p2.dokumentasi), '') IS NOT NULL
            ORDER BY to_date(pg2.tanggal_pengawasan, 'DD/MM/YYYY') DESC NULLS LAST, p2.id DESC
            LIMIT 1
        ) src ON true
        ORDER BY tr.id
        `,
        [targetUlok, targetLingkup, targetTanggal]
    );

    const rows = result.rows;
    const recoverable = rows.filter((row) => row.source_dokumentasi);
    const outputDir = path.join("sql", "reports");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(
        outputDir,
        `recover-pengawasan-dokumentasi-${targetUlok}-${targetLingkup}-${targetTanggal.replaceAll("/", "-")}.csv`
    );

    const header = [
        "target_id",
        "source_id",
        "nomor_ulok",
        "lingkup_pekerjaan",
        "kategori_pekerjaan",
        "jenis_pekerjaan",
        "target_tanggal",
        "source_tanggal",
        "source_dokumentasi"
    ];
    const csvRows = rows.map((row) => [
        row.target_id,
        row.source_id ?? "",
        row.nomor_ulok,
        row.lingkup_pekerjaan,
        row.kategori_pekerjaan,
        row.jenis_pekerjaan,
        row.target_tanggal,
        row.source_tanggal ?? "",
        row.source_dokumentasi ?? ""
    ].map(csvCell).join(","));
    fs.writeFileSync(outputPath, [header.join(","), ...csvRows].join("\n"));

    console.log({
        candidates: rows.length,
        recoverable: recoverable.length,
        missingFallback: rows.length - recoverable.length,
        outputPath,
        commit
    });

    if (!commit) return;

    await withTransaction(async (client) => {
        for (const row of recoverable) {
            await client.query(
                "UPDATE pengawasan SET dokumentasi = $1 WHERE id = $2 AND NULLIF(TRIM(dokumentasi), '') IS NULL",
                [row.source_dokumentasi, row.target_id]
            );
        }
    });

    console.log(`Committed ${recoverable.length} recovered dokumentasi links.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void pool.end();
    });
