-- Name: projek_planning_foto_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projek_planning_foto_item (
    id integer NOT NULL,
    id_projek_planning integer NOT NULL,
    item_index integer NOT NULL,
    link_foto character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now())
);

