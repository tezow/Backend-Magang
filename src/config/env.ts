import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
    PORT: z.coerce.number().default(8081),
    DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
    MAINTENANCE_DATABASE_URL: z.string().optional(),
    CORS_ORIGINS: z.string().default("*"),

    // Google credentials – Penyimpanan dokumen
    GOOGLE_TOKEN_PATH: z.string().optional(),
    GOOGLE_DOC_TOKEN_PATH: z.string().optional(),
    MASTER_DRIVE_FOLDER_ID: z.string().default("1SY5gg3Yw6BQZ4UQrAuxUk_adCW00gYwM"),
    SPREADSHEET_ID: z.string().default("1LA1TlhgltT2bqSN3H-LYasq9PtInVlqq98VPru8txoo"),
    DOC_SHEET_ID: z.string().optional(),
    DOC_SPREADSHEET_ID: z.string().default("1bEslAY1gGm1QgYl_ZL88_rt5z-errU7HU3GkqbWcNOw"),
    DOC_DRIVE_ROOT_ID: z.string().default("14hjuP33ez1v1WDxkTi7A3k-XfKOZKVTc"),
    DC_DOC_DRIVE_ROOT_ID: z.string().optional(),
    DB_BACKUP_DRIVE_ROOT_ID: z.string().optional(),
    DB_BACKUP_DRIVE_FOLDER_NAME: z.string().default("backup database building"),
    DB_BACKUP_RETENTION_COUNT: z.coerce.number().int().positive().default(10),
    PROJECT_PLANNING_DRIVE_FOLDER_ID: z.string().default("1BBZQZtHJV0dN6rQMp0EQ7aLpG5kcPPCF"),
    DOC_SHEET_NAME: z.string().default("penyimpanan_dokumen"),

    // Google credentials / config - dokumentasi bangunan
    DOC_BANGUNAN_SPREADSHEET_ID: z.string().default("1LA1TlhgltT2bqSN3H-LYasq9PtInVlqq98VPru8txoo"),
    DOC_BANGUNAN_DRIVE_FOLDER_ID: z.string().default("1ZTHC7vvvKOIejATqAYeluxfVDaGax1cd"),
    DOC_BANGUNAN_DEFAULT_PHOTO_ID: z.string().default("14x-tF0TDAZA9t4lbk6GrHXL8RccxxnjQ"),
    DOC_BANGUNAN_SHEET_TEMP: z.string().default("dokumentasi_temp"),
    DOC_BANGUNAN_SHEET_FINAL: z.string().default("dokumentasi_bangunan"),
    CABANG_SHEET_NAME: z.string().default("Cabang"),
    SPK_DATA_SHEET_NAME: z.string().default("SPK_Data"),
    KONTRAKTOR_SHEET_ID: z.string().default("1s95mAc0yXEyDwUDyyOzsDdIqIPEETZkA62_jQQBWXyw"),
    KONTRAKTOR_SHEET_NAME: z.string().default("Monitoring Kontraktor"),

    // PDF RAB storage – same as Python config.PDF_STORAGE_FOLDER_ID
    PDF_STORAGE_FOLDER_ID: z.string().default("1lvPxOwNILXHmagVfPGkVlNEtfv3U4Emj"),

    // Email sender
    EMAIL_USER: z.string().optional(),
    FRONTEND_URL: z.string().default("https://building.sparta-alfamart.web.id"),
    SPARTA_BACKEND_BASE_URL: z.string().optional(),

    // Puppeteer / Chrome runtime (useful on Render)
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
    PUPPETEER_CACHE_DIR: z.string().optional(),
    PUPPETEER_NAVIGATION_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

    // Postgres pool
    PG_POOL_MAX: z.coerce.number().int().positive().default(1),
    PG_KEEP_ALIVE: z.coerce.boolean().default(true),
    PG_CONN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    PG_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

    // API auth rollout
    AUTH_ENFORCEMENT_MODE: z.enum(["compat", "strict"]).default("strict"),
    AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
    AUTH_ROLLING_SESSION: z.coerce.boolean().default(true),
    AUTH_SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

    // S2S Sync Config
    SPARTA_SSO_API_URL: z.string().default("http://localhost:10000"),
    SPARTA_INTERNAL_API_KEY: z.string().min(16, "SPARTA_INTERNAL_API_KEY minimal 16 karakter").default(
        process.env.SPARTA_INTERNAL_API_KEY || (process.env.NODE_ENV === "production" ? "" : "dev_internal_key_12345678")
    ),
    SSO_JWT_SECRET: z.string().min(16, "SSO_JWT_SECRET minimal 16 karakter").default(
        process.env.SSO_JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev_sso_secret_key_12345678")
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Konfigurasi environment tidak valid:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
