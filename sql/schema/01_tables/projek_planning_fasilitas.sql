-- Name: projek_planning_fasilitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projek_planning_fasilitas (
    id integer NOT NULL,
    projek_planning_id integer NOT NULL,
    jenis_fasilitas character varying(100) NOT NULL,
    nama_fasilitas_lainnya character varying(255),
    is_tersedia boolean DEFAULT false NOT NULL,
    keterangan text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

