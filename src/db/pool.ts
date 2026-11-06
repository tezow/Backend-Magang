import { Pool, type PoolClient, types } from "pg";
import { env } from "../config/env";

// Kembalikan tipe date & timestamp sebagai string mentah (bukan JS Date)
// sehingga tidak terjadi konversi timezone UTC yang tidak diinginkan.
types.setTypeParser(1082, (val: string) => val);          // date
types.setTypeParser(1114, (val: string) => val);          // timestamp without timezone
types.setTypeParser(1184, (val: string) => val);          // timestamp with timezone

type PgSslConfig = false | { rejectUnauthorized: boolean };

const parseDatabaseUrl = (rawUrl: string): URL => {
    const parsed = new URL(rawUrl);
    return parsed;
};

const buildConnectionString = (rawUrl: string): string => {
    const parsed = parseDatabaseUrl(rawUrl);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    // Set Timezone di level koneksi (tanpa query concurrent di event connect)
    parsed.searchParams.set("options", "-c timezone=Asia/Jakarta");
    return parsed.toString();
};

const buildSslConfig = (rawUrl: string): PgSslConfig => {
    const parsed = parseDatabaseUrl(rawUrl);
    const sslMode = (process.env.PGSSLMODE || parsed.searchParams.get("sslmode") || "require").trim().toLowerCase();

    if (sslMode === "disable") {
        if (process.env.NODE_ENV === "production") {
            console.warn("[SECURITY_ALERT] PostgreSQL terhubung tanpa SSL di mode production! Lalu lintas database rentan disadap. Wajib aktifkan sslmode=require.");
        }
        return false;
    }
    if (sslMode === "verify-full" || sslMode === "verify-ca") return { rejectUnauthorized: true };
    return { rejectUnauthorized: false };
};

const pgPoolMax = Math.min(Math.max(env.PG_POOL_MAX, 5), 20);

export const pool = new Pool({
    connectionString: buildConnectionString(env.DATABASE_URL),
    ssl: buildSslConfig(env.DATABASE_URL),
    max: pgPoolMax,
    keepAlive: env.PG_KEEP_ALIVE,
    connectionTimeoutMillis: env.PG_CONN_TIMEOUT_MS,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS
});

console.log(`[Postgres] Pool max efektif: ${pgPoolMax}`);

// Konfigurasi Timezone kini sudah tidak diset via event connect untuk
// menghindari concurrent query (pool corruption) dengan pg@8+.
// Sebaiknya di-set dari pg connection parameter atau default server postgres.

pool.on("error", (error) => {
    console.error("Postgres pool error:", error);
});

export const withTransaction = async <T>(
    executor: (client: PoolClient) => Promise<T>,
    existingClient?: PoolClient
): Promise<T> => {
    if (existingClient) {
        return executor(existingClient);
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await executor(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
