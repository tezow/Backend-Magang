-- Name: pengawasan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pengawasan (
    id integer NOT NULL,
    id_gantt integer NOT NULL,
    kategori_pekerjaan character varying(500),
    jenis_pekerjaan text,
    status character varying(500) DEFAULT 'progress'::character varying,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    catatan text,
    dokumentasi text,
    id_pengawasan_gantt integer
);

