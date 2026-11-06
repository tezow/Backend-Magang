-- Name: projek_planning_ketentuan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projek_planning_ketentuan (
    id integer NOT NULL,
    projek_planning_id integer NOT NULL,
    isi_ketentuan text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

