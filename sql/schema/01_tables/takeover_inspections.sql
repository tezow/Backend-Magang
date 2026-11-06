-- Name: takeover_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.takeover_inspections (
    id integer NOT NULL,
    nomor_ulok character varying(255) NOT NULL,
    tanggal_takeover date NOT NULL,
    diinspeksi_oleh character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now())
);

