-- Name: pengawasan_pdf_migration_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pengawasan_pdf_migration_pending (
    id bigint NOT NULL,
    nomor_ulok text NOT NULL,
    lingkup_pekerjaan text DEFAULT ''::text NOT NULL,
    h_day integer NOT NULL,
    tanggal_pengawasan text,
    link_pdf_pengawasan text NOT NULL,
    source_sheet text NOT NULL,
    source_row integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    id_pengawasan_gantt integer,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

