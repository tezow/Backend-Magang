import crypto from "crypto";
import { env } from "../../config/env";
import { authSessionRepository, type AuthSessionRow } from "./auth-session.repository";

export type AuthenticatedUser = {
    session_id: number;
    email_sat: string;
    cabang: string;
    nama_lengkap: string | null;
    jabatan: string | null;
    roles: string[];
    nama_pt: string | null;
    expires_at: string;
};

export type CreatedAuthSession = {
    access_token: string;
    expires_at: string;
};

const TOKEN_PREFIX = "sparta";
const AUTH_CACHE_TTL_MS = 15_000;
const ROLLING_EXTENSION_MIN_INTERVAL_MS = 5 * 60_000;

const authenticatedUserCache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();
const rollingExtensionCache = new Map<number, number>();

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeRoles(roles: Array<string | null | undefined>): string[] {
    return Array.from(
        new Set(
            roles
                .map((role) => String(role ?? "").trim().toUpperCase())
                .filter(Boolean)
        )
    );
}

function calculateExpiry(): Date {
    return new Date(Date.now() + env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000);
}

function toAuthenticatedUser(row: AuthSessionRow): AuthenticatedUser {
    return {
        session_id: row.id,
        email_sat: row.email_sat,
        cabang: row.cabang,
        nama_lengkap: row.nama_lengkap,
        jabatan: row.jabatan,
        roles: normalizeRoles(row.roles),
        nama_pt: row.nama_pt,
        expires_at: row.expires_at
    };
}

export const authSessionService = {
    hashToken,

    async createForUser(input: {
        email_sat: string;
        cabang: string;
        nama_lengkap?: string | null;
        jabatan?: string | null;
        roles?: Array<string | null | undefined>;
        nama_pt?: string | null;
    }): Promise<CreatedAuthSession> {
        const token = `${TOKEN_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
        const expiresAt = calculateExpiry();
        const roles = normalizeRoles(input.roles?.length ? input.roles : [input.jabatan]);

        const row = await authSessionRepository.create({
            token_hash: hashToken(token),
            email_sat: input.email_sat,
            cabang: input.cabang,
            nama_lengkap: input.nama_lengkap ?? null,
            jabatan: input.jabatan ?? roles[0] ?? null,
            roles,
            nama_pt: input.nama_pt ?? null,
            expires_at: expiresAt
        });

        return {
            access_token: token,
            expires_at: row.expires_at
        };
    },

    async authenticateToken(token: string): Promise<AuthenticatedUser | null> {
        const normalizedToken = token.trim();
        if (!normalizedToken) return null;

        const tokenHash = hashToken(normalizedToken);
        const now = Date.now();
        const cached = authenticatedUserCache.get(tokenHash);
        if (cached && cached.expiresAt > now && Date.parse(cached.user.expires_at) > now) {
            return cached.user;
        }

        const row = await authSessionRepository.findActiveByTokenHash(tokenHash);
        if (!row) return null;

        if (env.AUTH_ROLLING_SESSION) {
            const lastExtendedAt = rollingExtensionCache.get(row.id) ?? 0;
            if (now - lastExtendedAt >= ROLLING_EXTENSION_MIN_INTERVAL_MS) {
                rollingExtensionCache.set(row.id, now);
                authSessionRepository.extendExpiry(row.id, calculateExpiry()).catch((error) => {
                    rollingExtensionCache.delete(row.id);
                    console.warn("Gagal memperpanjang session auth:", error);
                });
            }
        }

        const user = toAuthenticatedUser(row);
        authenticatedUserCache.set(tokenHash, {
            user,
            expiresAt: now + AUTH_CACHE_TTL_MS
        });

        return user;
    },

    async revokeToken(token: string): Promise<void> {
        const normalizedToken = token.trim();
        if (!normalizedToken) return;
        const tokenHash = hashToken(normalizedToken);
        authenticatedUserCache.delete(tokenHash);
        await authSessionRepository.revokeByTokenHash(tokenHash);
    }
};
