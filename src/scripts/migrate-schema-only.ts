import { config } from "dotenv";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

config();

type PgEnvOptions = {
    url: string;
    sslMode?: string;
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

async function main() {
    const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim() || requiredEnv("DATABASE_URL");
    const targetUrl = requiredEnv("TARGET_DATABASE_URL");
    const sourceSslMode = process.env.SOURCE_PGSSLMODE?.trim() || "require";
    const targetSslMode = process.env.TARGET_PGSSLMODE?.trim() || "prefer";
    const schemaName = process.env.PG_SCHEMA?.trim() || "public";
    const resetTargetSchema = process.env.RESET_TARGET_SCHEMA === "true";

    const tempDir = mkdtempSync(join(tmpdir(), "sparta-schema-only-"));
    const dumpFile = join(tempDir, "schema.sql");

    try {
        console.log(`Membuat dump schema-only dari schema "${schemaName}"...`);
        await run(
            pgCommand("pg_dump"),
            [
                "--schema-only",
                "--no-owner",
                "--no-privileges",
                "--format=plain",
                "--schema",
                schemaName,
                "--file",
                dumpFile
            ],
            buildPgEnv({ url: sourceUrl, sslMode: sourceSslMode })
        );

        if (resetTargetSchema) {
            console.log(`RESET_TARGET_SCHEMA=true: reset schema "${schemaName}" di target...`);
            await run(
                pgCommand("psql"),
                [
                    "--set",
                    "ON_ERROR_STOP=1",
                    "--command",
                    `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`
                ],
                buildPgEnv({ url: targetUrl, sslMode: targetSslMode })
            );
        }

        console.log("Menerapkan schema ke target. Data row tidak ikut dimigrasikan...");
        await run(
            pgCommand("psql"),
            [
                "--set",
                "ON_ERROR_STOP=1",
                "--file",
                dumpFile
            ],
            buildPgEnv({ url: targetUrl, sslMode: targetSslMode })
        );

        console.log("Migrasi schema-only selesai.");
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("Migrasi schema-only gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
});
