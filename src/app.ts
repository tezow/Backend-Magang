import cors from "cors";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "./config/env";
import { AppError } from "./common/app-error";
import { pool } from "./db/pool";
import { apiAuthMiddleware } from "./modules/auth/auth.middleware";
import { authRateLimiter, globalApiRateLimiter } from "./middlewares/rate-limit.middleware";
import { tokoRouter } from "./modules/toko/toko.routes";
import { maintenanceStoreRouter } from "./modules/maintenance-store/maintenance-store.routes";
import { rabRouter } from "./modules/rab/rab.routes";
import { spkRouter } from "./modules/spk/spk.routes";
import { documentRouter } from "./modules/document/document.routes";
import { dokumentasiRouter } from "./modules/dokumentasi/dokumentasi.routes";
import { ganttRouter } from "./modules/gantt/gantt.routes";
import { priceRabRouter } from "./modules/price-rab/price-rab.routes";
import { pertambahanSpkRouter } from "./modules/pertambahan-spk/pertambahan-spk.routes";
import { picPengawasanRouter } from "./modules/pic-pengawasan/pic-pengawasan.routes";
import { pengawasanRouter } from "./modules/pengawasan/pengawasan.routes";
import { opnameRouter } from "./modules/opname/opname.routes";
import { opnameFinalRouter } from "./modules/opname-final/opname-final.routes";
import { userCabangRouter } from "./modules/user-cabang/user-cabang.routes";
import { instruksiLapanganRouter } from "./modules/instruksi-lapangan/instruksi-lapangan.routes";
import { serahTerimaRouter } from "./modules/serah-terima/serah-terima.routes";
import { getKontraktor, loginUserCabang, verifyLoginOtp } from "./modules/toko/toko.controller";
import { ssoCallback, ssoResolve, ssoWebhookEmail } from "./modules/auth/sso.controller";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { dendaRouter } from "./modules/denda/denda.routes";
import { emailNotificationRouter } from "./modules/email-notification/email-notification.routes";
import { emailResendRouter } from "./modules/email-resend/email-resend.routes";
import { projekPlanningRouter } from "./modules/project-planning/project-planning.routes";
import { activityLogRouter } from "./modules/activity-log/activity-log.routes";
import { dcDevelopmentRouter } from "./modules/dc-development/dc-development.routes";
import { taskNotificationRouter } from "./modules/task-notification/task-notification.routes";
import { systemMaintenanceRouter } from "./modules/system-maintenance/system-maintenance.routes";
import systemAccessScheduleRouter from "./modules/system-access-schedule/system-access-schedule.routes";
import { spkBackdatePolicyRouter } from "./modules/spk-backdate-policy/spk-backdate-policy.routes";
// import { requestIntervensiRouter } from "./modules/request-intervensi/request-intervensi.routes";



const app = express();
app.disable("etag");
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_LOG_MS || 3000);
const POLLING_ENDPOINTS = new Set([
    "/api/system-maintenance/status",
    "/api/system-access-schedule/schedule"
]);

const isProduction = process.env.NODE_ENV === "production";

const shouldQuietPollingLog = (method: string, path: string): boolean => {
    if (!isProduction || method !== "GET") return false;
    const pathname = path.split("?")[0];
    return POLLING_ENDPOINTS.has(pathname);
};

const getPoolStats = () => ({
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
});

const configuredCorsOrigins = env.CORS_ORIGINS === "*"
    ? "*"
    : env.CORS_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);

const isAllowedCorsOrigin = (origin?: string): boolean => {
    if (!origin) return true;

    // In production, prohibit open wildcard reflection to arbitrary external origins
    if (configuredCorsOrigins === "*") {
        if (process.env.NODE_ENV === "production") {
            try {
                const hostname = new URL(origin).hostname.toLowerCase();
                return hostname === "sparta-alfamart.web.id" 
                    || hostname.endsWith(".sparta-alfamart.web.id")
                    || hostname === "localhost"
                    || hostname === "127.0.0.1";
            } catch {
                return false;
            }
        }
        return true;
    }

    if (Array.isArray(configuredCorsOrigins) && configuredCorsOrigins.includes(origin)) {
        return true;
    }

    try {
        const hostname = new URL(origin).hostname.toLowerCase();
        return hostname === "sparta-alfamart.web.id" || hostname.endsWith(".sparta-alfamart.web.id");
    } catch {
        return false;
    }
};

app.use(helmet({
    crossOriginResourcePolicy: false
}));
app.use(cors({
    origin: (origin, callback) => {
        callback(null, isAllowedCorsOrigin(origin) ? origin || true : false);
    },
    exposedHeaders: ["Content-Disposition", "X-SPARTA-PDF-Source"]
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
    const redactKeys = new Set([
        "password",
        "passwd",
        "token",
        "access_token",
        "refresh_token",
        "authorization",
        "auth",
        "secret",
        "api_key",
    ]);

    const sanitizeValue = (value: unknown, depth = 0): unknown => {
        if (depth > 2) return "[depth]";
        if (value === null || value === undefined) return value;
        if (Buffer.isBuffer(value)) return `[buffer ${value.length}]`;
        if (typeof value === "string") {
            return value.length > 200 ? `${value.slice(0, 200)}...` : value;
        }
        if (typeof value === "number" || typeof value === "boolean") return value;
        if (Array.isArray(value)) {
            const trimmed = value.slice(0, 5).map((item) => sanitizeValue(item, depth + 1));
            return value.length > 5 ? [...trimmed, "[+more]"] : trimmed;
        }
        if (typeof value === "object") {
            const result: Record<string, unknown> = {};
            for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
                if (redactKeys.has(key.toLowerCase())) {
                    result[key] = "[redacted]";
                } else {
                    result[key] = sanitizeValue(raw, depth + 1);
                }
            }
            return result;
        }
        return String(value);
    };

    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;

    const startAt = Date.now();
    const method = req.method;
    const path = req.originalUrl;
    const ip = req.ip;
    const userAgent = req.get("user-agent") || "-";
    const contentLength = req.get("content-length") || "-";

    const payloadLog = {
        ip,
        user_agent: userAgent,
        content_length: contentLength,
        params: sanitizeValue(req.params),
        query: sanitizeValue(req.query),
        body: sanitizeValue(req.body)
    };

    const quietPollingLog = shouldQuietPollingLog(method, path);

    if (!quietPollingLog) {
        console.log(`[REQ][${requestId}] ${method} ${path}`, payloadLog);
    }

    res.on("finish", () => {
        const durationMs = Date.now() - startAt;
        const isSlow = durationMs >= SLOW_REQUEST_MS;
        const shouldLogResponse = !quietPollingLog || res.statusCode >= 400 || isSlow;
        if (!shouldLogResponse) return;

        const responseLog: Record<string, unknown> = {
            status: res.statusCode,
            duration_ms: durationMs
        };

        const poolStats = getPoolStats();
        if (isSlow || poolStats.waiting > 0) {
            responseLog.pg_pool = poolStats;
        }

        console.log(`[RES][${requestId}] ${method} ${path}`, responseLog);
    });

    next();
});

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "sparta-api" });
});

app.use(globalApiRateLimiter);

import { proxyFile } from "./modules/surat-peringatan/sp.controller";

app.post("/api/auth/login", authRateLimiter, loginUserCabang);
app.post("/api/auth/verify-otp", authRateLimiter, verifyLoginOtp);
app.get("/api/auth/sso/callback", authRateLimiter, ssoCallback);
app.post("/api/auth/sso/resolve", authRateLimiter, ssoResolve);
app.post("/api/sso/webhook/email", ssoWebhookEmail);

// Direct file redirect to Google Drive (unauthenticated to allow browser open in new tab)
app.get("/api/denda/actions/proxy-file", proxyFile); // Legacy path
app.get("/api/proxy-file", proxyFile); // Generic path

app.use(apiAuthMiddleware);

app.use("/api/toko", tokoRouter);
app.use("/api/maintenance-stores", maintenanceStoreRouter);
app.get("/api/get_kontraktor", getKontraktor);
app.use("/api/rab", rabRouter);
app.use("/api/spk", spkRouter);
app.use("/api/doc", documentRouter);
app.use("/api/dok", dokumentasiRouter);
app.use("/api/gantt", ganttRouter);
app.use("/api/pertambahan-spk", pertambahanSpkRouter);
app.use("/api/pic_pengawasan", picPengawasanRouter);
app.use("/api/pengawasan", pengawasanRouter);
app.use("/api/opname", opnameRouter);
app.use("/api/final_opname", opnameFinalRouter);
app.use("/api/user-cabang", userCabangRouter); // FIX: Use hyphen for consistency
app.use("/api/instruksi-lapangan", instruksiLapanganRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/denda", dendaRouter);
app.use("/api/project-planning", projekPlanningRouter);
app.use("/api/projek-planning", projekPlanningRouter);
app.use("/api/activity-log", activityLogRouter);
app.use("/api/dc-development", dcDevelopmentRouter);
app.use("/api/task-notifications", taskNotificationRouter);
app.use("/api/system-maintenance", systemMaintenanceRouter);
app.use("/api/system-access-schedule", systemAccessScheduleRouter);
app.use("/api/spk-backdate-policy", spkBackdatePolicyRouter);
// app.use("/api/request-intervensi", requestIntervensiRouter);
app.use("/api", emailNotificationRouter);
app.use("/api", emailResendRouter);
app.use("/api", serahTerimaRouter);
app.use("/", priceRabRouter);
app.use("/api", priceRabRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = res.locals.requestId as string | undefined;
    if (error instanceof ZodError) {
        console.error(`[ZOD_ERROR][${requestId ?? "-"}] Validasi request gagal:`, error.issues);

        return res.status(422).json({
            status: "error",
            message: "Validasi request gagal",
            issues: error.issues
        });
    }

    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                status: "error",
                message: "Ukuran file melebihi batas maksimal yang diizinkan per file"
            });
        }

        if (error.code === "LIMIT_FIELD_VALUE") {
            return res.status(400).json({
                status: "error",
                message: "Data form upload melebihi batas maksimal. Kurangi jumlah item RAB atau ukuran lampiran teks."
            });
        }

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                status: "error",
                message: `Jumlah file dalam satu pengiriman terlalu banyak atau field file tidak valid (${error.field || "unknown"}). Kirim file secara bertahap.`
            });
        }

        return res.status(400).json({
            status: "error",
            message: `Upload file gagal (${error.code})`
        });
    }

    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            status: "error",
            message: error.message
        });
    }

    console.error("Unhandled error:", {
        request_id: requestId ?? "-",
        error
    });
    return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Terjadi kesalahan internal server"
    });
});

export { app };
