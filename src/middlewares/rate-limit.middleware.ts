import type { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
    windowMs: number;
    max: number;
    message?: string;
    keyPrefix?: string;
}

interface ClientRecord {
    count: number;
    resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions) {
    const { windowMs, max, message = "Terlalu banyak permintaan. Silakan tunggu beberapa saat.", keyPrefix = "rl" } = options;
    const store = new Map<string, ClientRecord>();

    // Periodic sweep to prevent memory leakage
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of store.entries()) {
            if (record.resetAt <= now) {
                store.delete(key);
            }
        }
    }, Math.max(30000, windowMs));

    // Allow process to exit cleanly without keeping the timer alive
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return (req: Request, res: Response, next: NextFunction): void => {
        const forwarded = req.headers["x-forwarded-for"];
        const rawIp = (typeof forwarded === "string" ? forwarded.split(",")[0] : req.ip) || req.socket.remoteAddress || "127.0.0.1";
        const clientKey = `${keyPrefix}:${rawIp.trim()}`;
        const now = Date.now();

        let record = store.get(clientKey);

        if (!record || record.resetAt <= now) {
            record = {
                count: 1,
                resetAt: now + windowMs
            };
            store.set(clientKey, record);
        } else {
            record.count += 1;
        }

        const remaining = Math.max(0, max - record.count);
        const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

        res.setHeader("X-RateLimit-Limit", max);
        res.setHeader("X-RateLimit-Remaining", remaining);
        res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));

        if (record.count > max) {
            res.setHeader("Retry-After", resetSeconds);
            res.status(429).json({
                status: "error",
                code: "TOO_MANY_REQUESTS",
                message,
                retry_after_seconds: resetSeconds
            });
            return;
        }

        next();
    };
}

// Strict rate limiter for sensitive authentication endpoints (15 attempts / 60 seconds)
export const authRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    keyPrefix: "auth",
    message: "Terlalu banyak percobaan autentikasi. Silakan tunggu 1 menit sebelum mencoba kembali."
});

// General rate limiter for all API endpoints (300 requests / 60 seconds)
export const globalApiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    keyPrefix: "global",
    message: "Batas permintaan API tercapai. Silakan coba beberapa saat lagi."
});
