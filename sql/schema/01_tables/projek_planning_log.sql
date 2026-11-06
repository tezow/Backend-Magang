-- Name: projek_planning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projek_planning_log (
    id integer NOT NULL,
    projek_planning_id integer NOT NULL,
    actor_email character varying(255) NOT NULL,
    role character varying(100) NOT NULL,
    aksi character varying(50) NOT NULL,
    status_sebelum character varying(50),
    status_sesudah character varying(50) NOT NULL,
    alasan_penolakan text,
    keterangan text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

