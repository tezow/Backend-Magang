import { config } from "dotenv";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

config();

const SQL_DIR = join(__dirname, "..", "..", "sql");
const PRIMARY_SCHEMA_FILE = "sparta-schema.sql";
const ALWAYS_INCLUDE = new Set<string>();
const SKIP_FILES = new Set<string>();

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Environment ${name} wajib diisi.`);
    return value;
}

function stripLeadingComments(statement: string): string {
    let value = statement.trim();
    let changed = true;

    while (changed) {
        changed = false;
        const lineComment = value.match(/^--.*(?:\r?\n|$)/);
        if (lineComment) {
            value = value.slice(lineComment[0].length).trimStart();
            changed = true;
            continue;
        }

        const blockComment = value.match(/^\/\*[\s\S]*?\*\//);
        if (blockComment) {
            value = value.slice(blockComment[0].length).trimStart();
            changed = true;
        }
    }

    return value;
}

function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let quote: "'" | "\"" | null = null;
    let dollarTag: string | null = null;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];
        current += char;

        if (dollarTag) {
            if (sql.slice(index, index + dollarTag.length) === dollarTag) {
                current += sql.slice(index + 1, index + dollarTag.length);
                index += dollarTag.length - 1;
                dollarTag = null;
            }
            continue;
        }

        if (quote) {
            if (char === quote) {
                if (quote === "'" && next === "'") {
                    current += next;
                    index += 1;
                } else {
                    quote = null;
                }
            }
            continue;
        }

        const dollarMatch = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
        if (dollarMatch) {
            dollarTag = dollarMatch[0];
            current += sql.slice(index + 1, index + dollarTag.length);
            index += dollarTag.length - 1;
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }

        if (char === "-" && next === "-") {
            const newlineIndex = sql.indexOf("\n", index + 2);
            if (newlineIndex === -1) break;
            current += sql.slice(index + 1, newlineIndex + 1);
            index = newlineIndex;
            continue;
        }

        if (char === "/" && next === "*") {
            const endIndex = sql.indexOf("*/", index + 2);
            if (endIndex === -1) break;
            current += sql.slice(index + 1, endIndex + 2);
            index = endIndex + 1;
            continue;
        }

        if (char === ";") {
            const statement = current.trim();
            if (statement) statements.push(statement);
            current = "";
        }
    }

    const trailing = current.trim();
    if (trailing) statements.push(trailing);

    return statements;
}

function shouldExecuteStatement(statement: string): boolean {
    const normalized = stripLeadingComments(statement).trim().toUpperCase();
    return /^(CREATE|ALTER|DO|COMMENT)\b/.test(normalized);
}

function getSqlFiles(): string[] {
    const files: string[] = [];
    const schemaDir = join(SQL_DIR, "schema");
    const fs = require("fs");
    
    if (!fs.existsSync(schemaDir)) {
        if (fs.existsSync(join(SQL_DIR, "sparta-schema.sql"))) {
            return ["sparta-schema.sql"];
        }
        return [];
    }

    const stages = readdirSync(schemaDir)
        .filter((d) => fs.statSync(join(schemaDir, d)).isDirectory())
        .sort();
    
    for (const stage of stages) {
        const stagePath = join(schemaDir, stage);
        const stageFiles = readdirSync(stagePath)
            .filter((f) => f.endsWith(".sql"))
            .sort()
            .map((f) => join("schema", stage, f));
            
        files.push(...stageFiles);
    }
    
    return files;
}

async function main() {
    const targetUrl = requiredEnv("TARGET_DATABASE_URL");
    const targetSslMode = process.env.TARGET_PGSSLMODE?.trim() || "prefer";
    const resetTargetSchema = process.env.RESET_TARGET_SCHEMA === "true";

    const client = new Client({
        connectionString: targetUrl,
        ssl: targetSslMode === "disable" ? false : { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        if (resetTargetSchema) {
            console.log("RESET_TARGET_SCHEMA=true: reset schema public di target...");
            await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
        }

        let executed = 0;
        let skipped = 0;

        for (const file of getSqlFiles()) {
            const sql = readFileSync(join(SQL_DIR, file), "utf8");
            const statements = splitSqlStatements(sql);
            console.log(`Memproses ${file} (${statements.length} statement)...`);

            for (const statement of statements) {
                if (!shouldExecuteStatement(statement)) {
                    skipped += 1;
                    continue;
                }

                await client.query(statement);
                executed += 1;
            }
        }

        console.log(`Selesai. DDL dieksekusi: ${executed}. Statement data/non-DDL dilewati: ${skipped}.`);
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error("Apply schema lokal gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
});
