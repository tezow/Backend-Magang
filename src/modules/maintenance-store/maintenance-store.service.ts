import { Pool } from "pg";
import { env } from "../../config/env";

// Create a separate pool for the maintenance database
// Prioritize explicit env var 'maintenance' (or MAINTENANCE_DATABASE_URL), then fallback to replacing '/building' with '/maintenance'
const maintenanceDbUrl = process.env.maintenance || env.MAINTENANCE_DATABASE_URL || env.DATABASE_URL.replace("/building", "/maintenance");

const maintenancePool = new Pool({
    connectionString: maintenanceDbUrl,
    ssl: env.DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    max: 5, // smaller pool for this specific feature
    idleTimeoutMillis: 30000,
});

maintenancePool.on("error", (error) => {
    console.error("Maintenance DB pool error:", error);
});

export const maintenanceStoreService = {
    async getStores(branchName?: string) {
        // user requirement: "filter dropdown di kolom brand bawa ALFAMART aja LAWSON jangan"
        let query = `
            SELECT name, code, "branchName", brand
            FROM "Store"
            WHERE "isActive" = true 
              AND brand ILIKE '%ALFAMART%'
              AND brand NOT ILIKE '%LAWSON%'
        `;
        const params: any[] = [];

        // user requirement: "filter dropdown di kolom branchName itu isi nya induk cabang (kalau yg branch group dan cikokol cileungsi) filter per itu"
        if (branchName) {
            // we will do an ILIKE for the branchName to get the parent and its sub-branches if they share a common name or we can just match exactly.
            // Usually branch names might be like "CIKOKOL", we match it if it contains the word.
            query += ` AND "branchName" ILIKE $1`;
            params.push(`%${branchName}%`);
        }

        query += ` ORDER BY name ASC`;

        const result = await maintenancePool.query(query, params);
        return result.rows;
    }
};
