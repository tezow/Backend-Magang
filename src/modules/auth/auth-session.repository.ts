import { pool } from "../../db/pool";

export type AuthSessionRow = {
    id: number;
    token_hash: string;
    email_sat: string;
    cabang: string;
    nama_lengkap: string | null;
    jabatan: string | null;
    roles: string[];
    nama_pt: string | null;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    updated_at: string;
};

export type CreateAuthSessionInput = {
    token_hash: string;
    email_sat: string;
    cabang: string;
    nama_lengkap?: string | null;
    jabatan?: string | null;
    roles: string[];
    nama_pt?: string | null;
    expires_at: Date;
};

export const authSessionRepository = {
    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auth_session (
                id SERIAL PRIMARY KEY,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                email_sat VARCHAR(255) NOT NULL,
                cabang VARCHAR(255) NOT NULL,
                nama_lengkap VARCHAR(255),
                jabatan VARCHAR(255),
                roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
                nama_pt VARCHAR(255),
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ DEFAULT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            DO $$
            DECLARE
                seq_name text;
            BEGIN
                SELECT pg_get_serial_sequence('auth_session', 'id') INTO seq_name;

                IF seq_name IS NULL THEN
                    CREATE SEQUENCE IF NOT EXISTS auth_session_id_seq OWNED BY auth_session.id;
                    ALTER TABLE auth_session
                        ALTER COLUMN id SET DEFAULT nextval('auth_session_id_seq'::regclass);
                    seq_name := 'auth_session_id_seq';
                END IF;

                EXECUTE format(
                    'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM auth_session), 0) + 1, 1), false)',
                    seq_name
                );
            END $$;

            CREATE INDEX IF NOT EXISTS idx_auth_session_active_token
                ON auth_session (token_hash, expires_at)
                WHERE revoked_at IS NULL;

            CREATE INDEX IF NOT EXISTS idx_auth_session_email_cabang
                ON auth_session (email_sat, cabang, expires_at)
                WHERE revoked_at IS NULL;
        `);
    },

    async create(input: CreateAuthSessionInput): Promise<AuthSessionRow> {
        const result = await pool.query<AuthSessionRow>(
            `
            INSERT INTO auth_session (
                token_hash,
                email_sat,
                cabang,
                nama_lengkap,
                jabatan,
                roles,
                nama_pt,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, token_hash, email_sat, cabang, nama_lengkap, jabatan, roles, nama_pt,
                      expires_at::text, revoked_at::text, created_at::text, updated_at::text
            `,
            [
                input.token_hash,
                input.email_sat,
                input.cabang,
                input.nama_lengkap ?? null,
                input.jabatan ?? null,
                input.roles,
                input.nama_pt ?? null,
                input.expires_at
            ]
        );

        return result.rows[0];
    },

    async findActiveByTokenHash(tokenHash: string): Promise<AuthSessionRow | null> {
        const result = await pool.query<AuthSessionRow>(
            `
            SELECT id, token_hash, email_sat, cabang, nama_lengkap, jabatan, roles, nama_pt,
                   expires_at::text, revoked_at::text, created_at::text, updated_at::text
            FROM auth_session
            WHERE token_hash = $1
              AND revoked_at IS NULL
              AND expires_at > now()
            LIMIT 1
            `,
            [tokenHash]
        );

        return result.rows[0] ?? null;
    },

    async extendExpiry(id: number, expiresAt: Date): Promise<void> {
        await pool.query(
            `
            UPDATE auth_session
            SET expires_at = GREATEST(expires_at, $2),
                updated_at = now()
            WHERE id = $1
              AND revoked_at IS NULL
            `,
            [id, expiresAt]
        );
    },

    async revokeByTokenHash(tokenHash: string): Promise<void> {
        await pool.query(
            `
            UPDATE auth_session
            SET revoked_at = now(),
                updated_at = now()
            WHERE token_hash = $1
              AND revoked_at IS NULL
            `,
            [tokenHash]
        );
    },

    async deleteExpiredOlderThan(retentionDays: number): Promise<number> {
        const result = await pool.query(
            `
            DELETE FROM auth_session
            WHERE expires_at < now() - ($1::int * interval '1 day')
            `,
            [retentionDays]
        );

        return result.rowCount ?? 0;
    }
};
