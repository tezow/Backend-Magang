import { pool } from "../../db/pool";

type AuthOtpRow = {
    id: number;
    email_sat: string;
    cabang: string;
    otp_hash: string;
    otp_token: string;
    expires_at: Date | string;
    created_at: Date | string;
    consumed_at: Date | string | null;
};

export const authOtpRepository = {
    async ensureSchema(): Promise<void> {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auth_otp (
                id SERIAL PRIMARY KEY,
                email_sat VARCHAR(255) NOT NULL,
                cabang VARCHAR(255) NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                otp_token VARCHAR(64) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                consumed_at TIMESTAMPTZ DEFAULT NULL
            );

            DO $$
            DECLARE
                seq_name text;
            BEGIN
                SELECT pg_get_serial_sequence('auth_otp', 'id') INTO seq_name;

                IF seq_name IS NULL THEN
                    CREATE SEQUENCE IF NOT EXISTS auth_otp_id_seq OWNED BY auth_otp.id;
                    ALTER TABLE auth_otp
                        ALTER COLUMN id SET DEFAULT nextval('auth_otp_id_seq'::regclass);
                    seq_name := 'auth_otp_id_seq';
                END IF;

                EXECUTE format(
                    'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM auth_otp), 0) + 1, 1), false)',
                    seq_name
                );
            END $$;

            CREATE INDEX IF NOT EXISTS idx_auth_otp_lookup
                ON auth_otp (email_sat, cabang, otp_token);

            CREATE INDEX IF NOT EXISTS idx_auth_otp_active
                ON auth_otp (email_sat, cabang, expires_at)
                WHERE consumed_at IS NULL;
        `);
    },

    async invalidateActive(emailSat: string, cabang: string) {
        await pool.query(
            `
            UPDATE auth_otp
            SET consumed_at = timezone('Asia/Jakarta', now())
            WHERE LOWER(email_sat) = LOWER($1)
              AND LOWER(cabang) = LOWER($2)
              AND consumed_at IS NULL
                            AND expires_at > now()
            `,
            [emailSat, cabang]
        );
    },

    async create(input: {
        email_sat: string;
        cabang: string;
        otp_hash: string;
        otp_token: string;
        expires_at: Date;
    }): Promise<AuthOtpRow> {
        const result = await pool.query<AuthOtpRow>(
            `
            INSERT INTO auth_otp (email_sat, cabang, otp_hash, otp_token, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email_sat, cabang, otp_hash, otp_token, expires_at, created_at, consumed_at
            `,
            [input.email_sat, input.cabang, input.otp_hash, input.otp_token, input.expires_at]
        );

        return result.rows[0];
    },

    async findActiveByToken(emailSat: string, cabang: string, otpToken: string): Promise<AuthOtpRow | null> {
        const result = await pool.query<AuthOtpRow>(
            `
            SELECT id, email_sat, cabang, otp_hash, otp_token, expires_at, created_at, consumed_at
            FROM auth_otp
            WHERE LOWER(email_sat) = LOWER($1)
              AND LOWER(cabang) = LOWER($2)
              AND otp_token = $3
              AND consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [emailSat, cabang, otpToken]
        );

        return result.rows[0] ?? null;
    },

    async consumeById(id: number) {
        await pool.query(
            `
            UPDATE auth_otp
            SET consumed_at = timezone('Asia/Jakarta', now())
            WHERE id = $1
            `,
            [id]
        );
    }
};
