import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { pool, withTransaction } from "../db/pool";
import { GoogleProvider } from "../common/google";
import { pengawasanService } from "../modules/pengawasan/pengawasan.service";
for (const envPath of [
    path.resolve(process.cwd(), "sparta-be.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", "sparta-be.env"),
]) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        break;
    }
}

const args = new Map(
    process.argv.slice(2).map((arg) => {
        const [key, ...rest] = arg.replace(/^--/, "").split("=");
        return [key, rest.join("=") || "true"];
    })
);

const ulok = args.get("ulok") ?? "1YZ1-2606-1YW3-R";
const fromTanggal = args.get("from") ?? "21/08/2026";
const toTanggal = args.get("to") ?? "27/08/2026";
const commit = args.get("commit") === "true" || args.has("commit");
const regeneratePdf = args.get("regenerate-pdf") === "true" || args.has("regenerate-pdf");

type LateCarryForwardCandidate = {
    lingkup_pekerjaan: string;
    id_gantt: number;
    source_id_pengawasan_gantt: number;
    target_id_pengawasan_gantt: number;
    source_tanggal: string;
    target_tanggal: string;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    catatan: string | null;
    source_rows: number;
    source_documented_rows: number;
};

type CheckpointSummary = {
    lingkup_pekerjaan: string;
    id_gantt: number;
    id_pengawasan_gantt: number;
    tanggal_pengawasan: string;
    total_items: number;
    selesai_items: number;
    progress_items: number;
    terlambat_items: number;
    documented_items: number;
    missing_documentation_items: number;
    has_pdf: boolean;
};

type ProgressAuditRow = {
    lingkup_pekerjaan: string;
    id_gantt: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    source_tanggal: string;
    target_tanggal: string;
    target_row_count: number;
};

const csvCell = (value: unknown): string => {
    const raw = String(value ?? "");
    return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

const writeCsv = (filePath: string, rows: Record<string, unknown>[]) => {
    const headers = Array.from(rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
    }, new Set<string>()));

    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
    ];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const main = async () => {
    const outputDir = path.resolve(
        process.cwd(),
        "sql",
        "reports",
        `pengawasan-${ulok}-${fromTanggal.replaceAll("/", "-")}-to-${toTanggal.replaceAll("/", "-")}`
    );
    fs.mkdirSync(outputDir, { recursive: true });

    const summaries = await pool.query<CheckpointSummary>(
        `
        SELECT
            t.lingkup_pekerjaan,
            g.id AS id_gantt,
            pg.id AS id_pengawasan_gantt,
            pg.tanggal_pengawasan,
            COUNT(p.id)::int AS total_items,
            COUNT(p.id) FILTER (WHERE LOWER(TRIM(COALESCE(p.status, ''))) = 'selesai')::int AS selesai_items,
            COUNT(p.id) FILTER (WHERE LOWER(TRIM(COALESCE(p.status, ''))) = 'progress')::int AS progress_items,
            COUNT(p.id) FILTER (WHERE LOWER(TRIM(COALESCE(p.status, ''))) = 'terlambat')::int AS terlambat_items,
            COUNT(p.id) FILTER (WHERE NULLIF(TRIM(COALESCE(p.dokumentasi, '')), '') IS NOT NULL)::int AS documented_items,
            COUNT(p.id) FILTER (WHERE p.id IS NOT NULL AND NULLIF(TRIM(COALESCE(p.dokumentasi, '')), '') IS NULL)::int AS missing_documentation_items,
            (bp.id IS NOT NULL)::boolean AS has_pdf
        FROM toko t
        JOIN gantt_chart g ON g.id_toko = t.id
        JOIN pengawasan_gantt pg ON pg.id_gantt = g.id
        LEFT JOIN pengawasan p ON p.id_pengawasan_gantt = pg.id
        LEFT JOIN berkas_pengawasan bp ON bp.id_pengawasan_gantt = pg.id
        WHERE t.nomor_ulok = $1::text
          AND pg.tanggal_pengawasan = ANY($2::text[])
        GROUP BY t.lingkup_pekerjaan, g.id, pg.id, pg.tanggal_pengawasan, bp.id
        ORDER BY t.lingkup_pekerjaan DESC, to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY'), pg.id
        `,
        [ulok, [fromTanggal, toTanggal]]
    );

    const lateCarryForward = await pool.query<LateCarryForwardCandidate>(
        `
        WITH ctx AS (
            SELECT
                t.lingkup_pekerjaan,
                g.id AS id_gantt,
                src_pg.id AS source_id_pengawasan_gantt,
                dst_pg.id AS target_id_pengawasan_gantt,
                src_pg.tanggal_pengawasan AS source_tanggal,
                dst_pg.tanggal_pengawasan AS target_tanggal
            FROM toko t
            JOIN gantt_chart g ON g.id_toko = t.id
            JOIN pengawasan_gantt src_pg ON src_pg.id_gantt = g.id AND src_pg.tanggal_pengawasan = $2::text
            JOIN pengawasan_gantt dst_pg ON dst_pg.id_gantt = g.id AND dst_pg.tanggal_pengawasan = $3::text
            WHERE t.nomor_ulok = $1::text
        ), source_late AS (
            SELECT
                ctx.lingkup_pekerjaan,
                ctx.id_gantt,
                ctx.source_id_pengawasan_gantt,
                ctx.target_id_pengawasan_gantt,
                ctx.source_tanggal,
                ctx.target_tanggal,
                p.kategori_pekerjaan,
                p.jenis_pekerjaan,
                MAX(NULLIF(TRIM(p.catatan), '')) AS catatan,
                COUNT(*)::int AS source_rows,
                COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(p.dokumentasi, '')), '') IS NOT NULL)::int AS source_documented_rows
            FROM ctx
            JOIN pengawasan p ON p.id_pengawasan_gantt = ctx.source_id_pengawasan_gantt
            WHERE LOWER(TRIM(COALESCE(p.status, ''))) = 'terlambat'
            GROUP BY ctx.lingkup_pekerjaan, ctx.id_gantt, ctx.source_id_pengawasan_gantt,
                     ctx.target_id_pengawasan_gantt, ctx.source_tanggal, ctx.target_tanggal,
                     p.kategori_pekerjaan, p.jenis_pekerjaan
        )
        SELECT src.*
        FROM source_late src
        WHERE NOT EXISTS (
            SELECT 1
            FROM pengawasan existing
            WHERE existing.id_gantt = src.id_gantt
              AND existing.id_pengawasan_gantt = src.target_id_pengawasan_gantt
              AND UPPER(TRIM(COALESCE(existing.kategori_pekerjaan, ''))) = UPPER(TRIM(COALESCE(src.kategori_pekerjaan, '')))
              AND UPPER(TRIM(COALESCE(existing.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(src.jenis_pekerjaan, '')))
        )
        ORDER BY src.lingkup_pekerjaan DESC, src.kategori_pekerjaan, src.jenis_pekerjaan
        `,
        [ulok, fromTanggal, toTanggal]
    );

    const progressAudit = await pool.query<ProgressAuditRow>(
        `
        WITH ctx AS (
            SELECT
                t.lingkup_pekerjaan,
                g.id AS id_gantt,
                src_pg.id AS source_id_pengawasan_gantt,
                dst_pg.id AS target_id_pengawasan_gantt,
                src_pg.tanggal_pengawasan AS source_tanggal,
                dst_pg.tanggal_pengawasan AS target_tanggal
            FROM toko t
            JOIN gantt_chart g ON g.id_toko = t.id
            JOIN pengawasan_gantt src_pg ON src_pg.id_gantt = g.id AND src_pg.tanggal_pengawasan = $2::text
            JOIN pengawasan_gantt dst_pg ON dst_pg.id_gantt = g.id AND dst_pg.tanggal_pengawasan = $3::text
            WHERE t.nomor_ulok = $1::text
        ), source_progress AS (
            SELECT DISTINCT
                ctx.lingkup_pekerjaan,
                ctx.id_gantt,
                ctx.target_id_pengawasan_gantt,
                ctx.source_tanggal,
                ctx.target_tanggal,
                p.kategori_pekerjaan,
                p.jenis_pekerjaan
            FROM ctx
            JOIN pengawasan p ON p.id_pengawasan_gantt = ctx.source_id_pengawasan_gantt
            WHERE LOWER(TRIM(COALESCE(p.status, ''))) = 'progress'
        )
        SELECT
            src.lingkup_pekerjaan,
            src.id_gantt,
            src.kategori_pekerjaan,
            src.jenis_pekerjaan,
            src.source_tanggal,
            src.target_tanggal,
            COUNT(existing.id)::int AS target_row_count
        FROM source_progress src
        LEFT JOIN pengawasan existing
          ON existing.id_gantt = src.id_gantt
         AND existing.id_pengawasan_gantt = src.target_id_pengawasan_gantt
         AND UPPER(TRIM(COALESCE(existing.kategori_pekerjaan, ''))) = UPPER(TRIM(COALESCE(src.kategori_pekerjaan, '')))
         AND UPPER(TRIM(COALESCE(existing.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(src.jenis_pekerjaan, '')))
        GROUP BY src.lingkup_pekerjaan, src.id_gantt, src.kategori_pekerjaan,
                 src.jenis_pekerjaan, src.source_tanggal, src.target_tanggal
        ORDER BY src.lingkup_pekerjaan DESC, src.kategori_pekerjaan, src.jenis_pekerjaan
        `,
        [ulok, fromTanggal, toTanggal]
    );

    const summaryPath = path.join(outputDir, "checkpoint-summary.csv");
    const latePath = path.join(outputDir, "missing-terlambat-carry-forward.csv");
    const progressPath = path.join(outputDir, "progress-audit-no-auto-repair.csv");
    writeCsv(summaryPath, summaries.rows as unknown as Record<string, unknown>[]);
    writeCsv(latePath, lateCarryForward.rows as unknown as Record<string, unknown>[]);
    writeCsv(progressPath, progressAudit.rows as unknown as Record<string, unknown>[]);

    console.log("=== Pengawasan ULOK checkpoint repair ===");
    console.log({ ulok, fromTanggal, toTanggal, commit, regeneratePdf, outputDir });
    console.table(summaries.rows);
    console.log(`Missing terlambat carry-forward candidates: ${lateCarryForward.rows.length}`);
    console.log(`Progress audit rows, no auto repair: ${progressAudit.rows.length}`);

    if (commit && lateCarryForward.rows.length > 0) {
        await withTransaction(async (client) => {
            for (const row of lateCarryForward.rows) {
                await client.query(
                    `
                    INSERT INTO pengawasan (
                        id_gantt,
                        id_pengawasan_gantt,
                        kategori_pekerjaan,
                        jenis_pekerjaan,
                        catatan,
                        dokumentasi,
                        status
                    )
                    SELECT $1::int, $2::int, $3::text, $4::text, $5::text, NULL, 'terlambat'
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM pengawasan existing
                        WHERE existing.id_gantt = $1::int
                          AND existing.id_pengawasan_gantt = $2::int
                          AND UPPER(TRIM(COALESCE(existing.kategori_pekerjaan, ''))) = UPPER(TRIM($3::text))
                          AND UPPER(TRIM(COALESCE(existing.jenis_pekerjaan, ''))) = UPPER(TRIM($4::text))
                    )
                    `,
                    [row.id_gantt, row.target_id_pengawasan_gantt, row.kategori_pekerjaan, row.jenis_pekerjaan, row.catatan]
                );
            }
        });
        console.log(`Committed ${lateCarryForward.rows.length} missing terlambat carry-forward rows.`);
    } else if (!commit) {
        console.log("Dry-run only. Add --commit to insert missing terlambat carry-forward rows.");
    }

    if (commit && regeneratePdf) {
        await GoogleProvider.initialize();
        const pdfTargets = summaries.rows.filter((row) => row.total_items > 0);
        for (const target of pdfTargets) {
            console.log(`Regenerating pengawasan PDF PG ${target.id_pengawasan_gantt} ${target.lingkup_pekerjaan} ${target.tanggal_pengawasan}`);
            await pengawasanService.regeneratePdf(target.id_pengawasan_gantt);
        }
        console.log(`Regenerated ${pdfTargets.length} pengawasan PDFs.`);
    } else if (regeneratePdf) {
        console.log("PDF regeneration requested but skipped in dry-run. Add --commit to upload/update berkas_pengawasan.");
    }
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void pool.end();
    });