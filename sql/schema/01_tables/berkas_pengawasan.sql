-- Name: berkas_pengawasan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.berkas_pengawasan (
    id integer NOT NULL,
    id_pengawasan_gantt integer NOT NULL,
    link_pdf_pengawasan character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

