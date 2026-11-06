import { config } from "dotenv";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { Client, types } from "pg";

config();

types.setTypeParser(1082, (val: string) => val);
types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => val);

type PgEnvOptions = {
    url: string;
    sslMode?: string;
};

type CountRow = {
    table_name: string;
    row_count: string;
};

type ColumnRow = {
    column_name: string;
};

type IdRangeRow = {
    min_id: number | null;
    max_id: number | null;
};

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Environment ${name} wajib diisi.`);
    }
    return value;
}

function buildPgEnv(input: PgEnvOptions): NodeJS.ProcessEnv {
    const parsed = new URL(input.url);
    const database = parsed.pathname.replace(/^\//, "");

    if (!database) {
        throw new Error("Nama database tidak ditemukan pada connection string.");
    }

    return {
        ...process.env,
        PGHOST: parsed.hostname,
        PGPORT: parsed.port || "5432",
        PGDATABASE: decodeURIComponent(database),
        PGUSER: decodeURIComponent(parsed.username),
        PGPASSWORD: decodeURIComponent(parsed.password),
        PGSSLMODE: input.sslMode || parsed.searchParams.get("sslmode") || "prefer"
    };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env,
            stdio: ["ignore", "inherit", "inherit"],
            shell: false
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${command} keluar dengan kode ${code}`));
        });
    });
}

function pgCommand(command: "pg_dump" | "psql"): string {
    const binDir = process.env.PG_BIN_DIR?.trim();
    if (!binDir) return command;
    return join(binDir, process.platform === "win32" ? `${command}.exe` : command);
}

function normalizeDatabaseIdentity(url: string): string {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "");
    return [
        parsed.hostname.toLowerCase(),
        parsed.port || "5432",
        decodeURIComponent(database),
        decodeURIComponent(parsed.username)
    ].join("|");
}

function buildClient(url: string, sslMode: string): Client {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");

    return new Client({
        connectionString: parsed.toString(),
        ssl: sslMode === "disable" ? false : { rejectUnauthorized: false }
    });
}

function quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, "\"\"")}"`;
}

async function readTableCounts(url: string, sslMode: string, schemaName: string): Promise<Map<string, string>> {
    const client = buildClient(url, sslMode);
    await client.connect();

    try {
        const tables = await client.query<{ table_name: string }>(
            `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            `,
            [schemaName]
        );

        const counts = new Map<string, string>();
        for (const { table_name: tableName } of tables.rows) {
            const result = await client.query<CountRow>(
                `SELECT $1::text AS table_name, COUNT(*)::text AS row_count FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`,
                [tableName]
            );
            counts.set(tableName, result.rows[0].row_count);
        }
        return counts;
    } finally {
        await client.end();
    }
}

async function verifyRowCounts(sourceUrl: string, targetUrl: string, sourceSslMode: string, targetSslMode: string, schemaName: string) {
    console.log("Memverifikasi jumlah row source vs target...");

    const [sourceCounts, targetCounts] = await Promise.all([
        readTableCounts(sourceUrl, sourceSslMode, schemaName),
        readTableCounts(targetUrl, targetSslMode, schemaName)
    ]);

    const mismatches: string[] = [];
    const allTables = new Set([...sourceCounts.keys(), ...targetCounts.keys()]);

    for (const tableName of [...allTables].sort()) {
        const sourceCount = sourceCounts.get(tableName) ?? "0";
        const targetCount = targetCounts.get(tableName) ?? "0";
        if (sourceCount !== targetCount) {
            mismatches.push(`${tableName}: source=${sourceCount}, target=${targetCount}`);
        }
    }

    if (mismatches.length > 0) {
        throw new Error(`Verifikasi row count gagal:\n${mismatches.join("\n")}`);
    }

    console.log(`Verifikasi selesai. ${allTables.size} tabel cocok.`);
}

function readFallbackTables(): string[] {
    const raw = process.env.FALLBACK_BATCH_TABLES?.trim() || "pengawasan";
    return raw
        .split(",")
        .map((tableName) => tableName.trim())
        .filter(Boolean);
}

function buildPgDumpArgs(schemaName: string, dumpFile: string, fallbackTables: string[]): string[] {
    return [
        "--no-owner",
        "--no-privileges",
        "--format=plain",
        "--schema",
        schemaName,
        ...fallbackTables.flatMap((tableName) => [
            "--exclude-table-data",
            `${schemaName}.${tableName}`
        ]),
        "--file",
        dumpFile
    ];
}

async function getTableColumns(client: Client, schemaName: string, tableName: string): Promise<string[]> {
    const result = await client.query<ColumnRow>(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
        `,
        [schemaName, tableName]
    );

    if (result.rows.length === 0) {
        throw new Error(`Tabel ${schemaName}.${tableName} tidak ditemukan.`);
    }

    return result.rows.map((row) => row.column_name);
}

async function copyFallbackTableInBatches(input: {
    sourceUrl: string;
    targetUrl: string;
    sourceSslMode: string;
    targetSslMode: string;
    schemaName: string;
    tableName: string;
    batchSize: number;
}) {
    const sourceClient = buildClient(input.sourceUrl, input.sourceSslMode);
    const targetClient = buildClient(input.targetUrl, input.targetSslMode);

    await sourceClient.connect();
    await targetClient.connect();

    try {
        const columns = await getTableColumns(sourceClient, input.schemaName, input.tableName);
        if (!columns.includes("id")) {
            throw new Error(`Fallback batch table ${input.tableName} wajib punya kolom id.`);
        }

        const qualifiedTable = `${quoteIdentifier(input.schemaName)}.${quoteIdentifier(input.tableName)}`;
        const idRange = await sourceClient.query<IdRangeRow>(
            `SELECT MIN(id)::int AS min_id, MAX(id)::int AS max_id FROM ${qualifiedTable}`
        );
        const minId = idRange.rows[0]?.min_id;
        const maxId = idRange.rows[0]?.max_id;

        await targetClient.query(`TRUNCATE TABLE ${qualifiedTable} RESTART IDENTITY CASCADE`);

        if (minId === null || maxId === null) {
            console.log(`Fallback batch ${input.tableName}: source kosong.`);
            return;
        }

        const columnList = columns.map(quoteIdentifier).join(", ");
        const selectColumnList = columns.map(quoteIdentifier).join(", ");
        let copiedRows = 0;

        for (let startId = minId; startId <= maxId; startId += input.batchSize) {
            const endId = Math.min(startId + input.batchSize - 1, maxId);
            const sourceRows = await sourceClient.query<Record<string, unknown>>(
                `
                SELECT ${selectColumnList}
                FROM ${qualifiedTable}
                WHERE id BETWEEN $1 AND $2
                ORDER BY id
                `,
                [startId, endId]
            );

            if (sourceRows.rows.length === 0) continue;

            const values: unknown[] = [];
            const valueGroups = sourceRows.rows.map((row, rowIndex) => {
                const placeholders = columns.map((columnName, columnIndex) => {
                    values.push(row[columnName]);
                    return `$${rowIndex * columns.length + columnIndex + 1}`;
                });
                return `(${placeholders.join(", ")})`;
            });

            await targetClient.query("BEGIN");
            try {
                await targetClient.query(
                    `INSERT INTO ${qualifiedTable} (${columnList}) VALUES ${valueGroups.join(", ")}`,
                    values
                );
                await targetClient.query("COMMIT");
            } catch (error) {
                await targetClient.query("ROLLBACK");
                throw error;
            }

            copiedRows += sourceRows.rows.length;
            console.log(`Fallback batch ${input.tableName}: ${copiedRows} row tersalin...`);
        }

        await targetClient.query(`
            SELECT setval(
                pg_get_serial_sequence($1, 'id'),
                GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${qualifiedTable}), 1),
                (SELECT COUNT(*) > 0 FROM ${qualifiedTable})
            )
        `, [`${input.schemaName}.${input.tableName}`]);
    } finally {
        await sourceClient.end();
        await targetClient.end();
    }
}

async function copyFallbackTablesInBatches(input: {
    sourceUrl: string;
    targetUrl: string;
    sourceSslMode: string;
    targetSslMode: string;
    schemaName: string;
    tableNames: string[];
    batchSize: number;
}) {
    for (const tableName of input.tableNames) {
        console.log(`Memindahkan tabel besar "${tableName}" via batch ${input.batchSize} row...`);
        await copyFallbackTableInBatches({
            sourceUrl: input.sourceUrl,
            targetUrl: input.targetUrl,
            sourceSslMode: input.sourceSslMode,
            targetSslMode: input.targetSslMode,
            schemaName: input.schemaName,
            tableName,
            batchSize: input.batchSize
        });
    }
}

async function main() {
    const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim() || requiredEnv("DATABASE_URL");
    const targetUrl = requiredEnv("TARGET_DATABASE_URL");
    const sourceSslMode = process.env.SOURCE_PGSSLMODE?.trim() || "require";
    const targetSslMode = process.env.TARGET_PGSSLMODE?.trim() || new URL(targetUrl).searchParams.get("sslmode") || "require";
    const schemaName = process.env.PG_SCHEMA?.trim() || "public";
    const resetTargetSchema = process.env.RESET_TARGET_SCHEMA === "true";
    const skipVerify = process.env.SKIP_ROW_COUNT_VERIFY === "true";
    const fallbackTables = readFallbackTables();
    const fallbackBatchSize = Number.parseInt(process.env.FALLBACK_BATCH_SIZE || "25", 10);

    if (normalizeDatabaseIdentity(sourceUrl) === normalizeDatabaseIdentity(targetUrl)) {
        throw new Error("Source dan target database terlihat sama. Migrasi dibatalkan.");
    }

    if (!resetTargetSchema) {
        throw new Error("RESET_TARGET_SCHEMA=true wajib diisi karena full restore akan mengganti isi target.");
    }

    if (!Number.isInteger(fallbackBatchSize) || fallbackBatchSize < 1) {
        throw new Error("FALLBACK_BATCH_SIZE harus berupa angka positif.");
    }

    const tempDir = mkdtempSync(join(tmpdir(), "sparta-full-db-"));
    const dumpFile = join(tempDir, "full-database.sql");
    const resetFile = join(tempDir, "reset-target.sql");

    try {
        console.log(`Membuat dump penuh dari schema "${schemaName}"...`);
        await run(
            pgCommand("pg_dump"),
            buildPgDumpArgs(schemaName, dumpFile, fallbackTables),
            buildPgEnv({ url: sourceUrl, sslMode: sourceSslMode })
        );

        writeFileSync(
            resetFile,
            [
                "SELECT pg_advisory_lock(hashtext('sparta-full-database-migration'));",
                `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE;`
            ].join("\n"),
            "utf8"
        );

        console.log(
            process.env.RESTORE_SINGLE_TRANSACTION === "true"
                ? "Reset target dan restore data dalam satu transaksi..."
                : "Reset target dan restore data. Jika putus, run ulang akan reset target lagi."
        );
        await run(
            pgCommand("psql"),
            [
                "--set",
                "ON_ERROR_STOP=1",
                ...(process.env.RESTORE_SINGLE_TRANSACTION === "true" ? ["--single-transaction"] : []),
                "--file",
                resetFile,
                "--file",
                dumpFile
            ],
            buildPgEnv({ url: targetUrl, sslMode: targetSslMode })
        );

        if (fallbackTables.length > 0) {
            await copyFallbackTablesInBatches({
                sourceUrl,
                targetUrl,
                sourceSslMode,
                targetSslMode,
                schemaName,
                tableNames: fallbackTables,
                batchSize: fallbackBatchSize
            });
        }

        if (!skipVerify) {
            await verifyRowCounts(sourceUrl, targetUrl, sourceSslMode, targetSslMode, schemaName);
        }

        console.log("Migrasi full database selesai.");
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("Migrasi full database gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
});
