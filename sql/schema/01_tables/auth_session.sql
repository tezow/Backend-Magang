-- Name: auth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_session (
    id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    email_sat character varying(255) NOT NULL,
    cabang character varying(255) NOT NULL,
    nama_lengkap character varying(255),
    jabatan character varying(255),
    roles text[] DEFAULT ARRAY[]::text[] NOT NULL,
    nama_pt character varying(255),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

