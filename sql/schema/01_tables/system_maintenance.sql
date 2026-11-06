-- Name: system_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_maintenance (
    id integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    title text DEFAULT 'Sistem sedang dalam pemeliharaan'::text NOT NULL,
    message text DEFAULT 'Akses sementara dibatasi agar pembaruan dapat berjalan stabil. Silakan kembali beberapa saat lagi.'::text NOT NULL,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    updated_by_email text,
    updated_by_role text,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

