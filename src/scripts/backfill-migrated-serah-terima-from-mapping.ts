import path from "path";
import * as xlsx from "xlsx";
import { pool, withTransaction } from "../db/pool";
import { opnameFinalService } from "../modules/opname-final/opname-final.service";

type MappingRow = {
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    tanggal_st: string;
    link_pdf?: string | null;
    catatan?: string | null;
};

type CandidateRow = MappingRow & {
    id_toko: number;
    nama_toko: string | null;
    cabang: string | null;
    opname_final_id: number;
    existing_st_id: number | null;
};

const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith("--"));
const shouldCommit = args.includes("--commit");

if (!fileArg) {
    console.error("Usage: tsx src/scripts/backfill-migrated-serah-terima-from-mapping.ts <mapping.xlsx|csv> [--commit]");
    process.exit(1);
}

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");

const normalizeLingkup = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (normalized === "SIPIL") return "SIPIL";
    if (normalized === "ME") return "ME";
    return normalized;
};

const toIsoDate = (value: unknown): string => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
    if (dmy) {
        const day = dmy[1].padStart(2, "0");
        const month = dmy[2].padStart(2, "0");
        return `${dmy[3]}-${month}-${day}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return "";
};

const loadMappingRows = (inputPath: string): MappingRow[] => {
    const workbook = xlsx.readFile(inputPath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
        defval: null,
    });

    return rows.map((raw, index) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
            normalized[normalizeKey(key)] = value;
        }

        const row: MappingRow = {
            nomor_ulok: String(normalized.nomor_ulok ?? "").trim(),
            lingkup_pekerjaan: normalizeLingkup(String(normalized.lingkup_pekerjaan ?? normalized.lingkup ?? "").trim()),
            tanggal_st: toIsoDate(normalized.tanggal_st ?? normalized.tanggal_serah_terima),
            link_pdf: String(normalized.link_pdf ?? "").trim() || null,
            catatan: String(normalized.catatan ?? "").trim() || null,
        };

        if (!row.nomor_ulok || !row.lingkup_pekerjaan || !row.tanggal_st) {
            throw new Error(`Mapping row ${index + 2} wajib punya nomor_ulok, lingkup_pekerjaan, tanggal_st`);
        }

        return row;
    });
};

const resolveCandidate = async (row: MappingRow): Promise<CandidateRow> => {
    const result = await pool.query(
        `
        SELECT
            t.id AS id_toko,
            t.nama_toko,
            t.cabang,
            latest_opname.id AS opname_final_id,
            latest_st.id AS existing_st_id
        FROM toko t
        JOIN LATERAL (
            SELECT id
            FROM opname_final
            WHERE id_toko = t.id
            ORDER BY id DESC
            LIMIT 1
        ) latest_opname ON true
        LEFT JOIN LATERAL (
            SELECT id
            FROM berkas_serah_terima
            WHERE id_toko = t.id
            ORDER BY id DESC
            LIMIT 1
        ) latest_st ON true
        WHERE UPPER(TRIM(t.nomor_ulok)) = UPPER(TRIM($1))
          AND UPPER(TRIM(COALESCE(t.lingkup_pekerjaan, ''))) = UPPER(TRIM($2))
        LIMIT 1
        `,
        [row.nomor_ulok, row.lingkup_pekerjaan]
    );

    const match = result.rows[0];
    if (!match) {
        throw new Error(`Tidak ditemukan toko/opname_final untuk ${row.nomor_ulok} ${row.lingkup_pekerjaan}`);
    }

    return {
        ...row,
        id_toko: Number(match.id_toko),
        nama_toko: match.nama_toko ?? null,
        cabang: match.cabang ?? null,
        opname_final_id: Number(match.opname_final_id),
        existing_st_id: match.existing_st_id === null ? null : Number(match.existing_st_id),
    };
};

const main = async () => {
    const inputPath = path.resolve(process.cwd(), fileArg);
    const mappings = loadMappingRows(inputPath);
    const candidates: CandidateRow[] = [];

    for (const row of mappings) {
        candidates.push(await resolveCandidate(row));
    }

    console.table(candidates.map((row) => ({
        nomor_ulok: row.nomor_ulok,
        lingkup: row.lingkup_pekerjaan,
        nama_toko: row.nama_toko,
        cabang: row.cabang,
        tanggal_st: row.tanggal_st,
        existing_st_id: row.existing_st_id,
        action: row.existing_st_id ? "update-created-at" : "insert-st",
    })));

    if (!shouldCommit) {
        console.log(`Dry-run selesai. ${candidates.length} row valid. Tambahkan --commit untuk eksekusi.`);
        return;
    }

    await withTransaction(async (client) => {
        await client.query(`
            CREATE TABLE IF NOT EXISTS serah_terima_migration_backfill_audit (
                audit_id SERIAL PRIMARY KEY,
                nomor_ulok TEXT NOT NULL,
                lingkup_pekerjaan TEXT NOT NULL,
                id_toko INT NOT NULL,
                opname_final_id INT NOT NULL,
                old_berkas_serah_terima_id INT,
                tanggal_st DATE NOT NULL,
                link_pdf TEXT,
                catatan TEXT,
                backfilled_at TIMESTAMP NOT NULL DEFAULT timezone('Asia/Jakarta', now())
            )
        `);

        for (const row of candidates) {
            const stResult = row.existing_st_id
                ? await client.query(
                    `
                    UPDATE berkas_serah_terima
                    SET created_at = $1::date,
                        link_pdf = COALESCE(NULLIF($2, ''), link_pdf)
                    WHERE id = $3
                    RETURNING id
                    `,
                    [row.tanggal_st, row.link_pdf ?? "", row.existing_st_id]
                )
                : await client.query(
                    `
                    INSERT INTO berkas_serah_terima (id_toko, link_pdf, created_at)
                    VALUES ($1, NULLIF($2, ''), $3::date)
                    RETURNING id
                    `,
                    [row.id_toko, row.link_pdf ?? "", row.tanggal_st]
                );

            await client.query(
                `
                INSERT INTO serah_terima_migration_backfill_audit (
                    nomor_ulok, lingkup_pekerjaan, id_toko, opname_final_id,
                    old_berkas_serah_terima_id, tanggal_st, link_pdf, catatan
                )
                VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
                `,
                [
                    row.nomor_ulok,
                    row.lingkup_pekerjaan,
                    row.id_toko,
                    row.opname_final_id,
                    stResult.rows[0].id,
                    row.tanggal_st,
                    row.link_pdf,
                    row.catatan,
                ]
            );
        }
    });

    for (const idToko of [...new Set(candidates.map((row) => row.id_toko))]) {
        await opnameFinalService.refreshDendaByTokoId(idToko);
    }

    console.log(`Commit selesai. ${candidates.length} ST migrasi dibackfill/update dan denda direfresh.`);
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
