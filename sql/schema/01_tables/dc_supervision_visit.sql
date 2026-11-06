-- Name: dc_supervision_visit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_supervision_visit (
    id integer NOT NULL,
    project_id integer NOT NULL,
    visit_date date NOT NULL,
    visitor_email character varying(255),
    visitor_role character varying(255),
    location text,
    summary text,
    status character varying(80) DEFAULT 'COMPLETED'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

