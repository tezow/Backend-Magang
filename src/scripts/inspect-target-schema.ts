import { config } from "dotenv";
import { Client } from "pg";

config();

async function main() {
    const targetUrl = process.env.TARGET_DATABASE_URL?.trim();
    if (!targetUrl) throw new Error("TARGET_DATABASE_URL wajib diisi.");

    const client = new Client({
        connectionString: targetUrl,
        ssl: process.env.TARGET_PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });

    await client.connect();

    try {
        const tables = await client.query<{ table_name: string }>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        console.log(`Total tabel public: ${tables.rows.length}`);
        for (const { table_name } of tables.rows) {
            const count = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${table_name}"`);
            console.log(`${table_name}: ${count.rows[0].count} row`);
        }
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error("Inspect target gagal:", error instanceof Error ? error.message : error);
    process.exit(1);
});
