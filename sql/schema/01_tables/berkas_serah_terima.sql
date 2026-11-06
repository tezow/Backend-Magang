-- Name: berkas_serah_terima; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.berkas_serah_terima (
    id integer NOT NULL,
    id_toko integer NOT NULL,
    link_pdf character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

