-- Name: dc_bast; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_bast (
    id integer NOT NULL,
    project_id integer NOT NULL,
    participant_id integer,
    bast_type character varying(80) NOT NULL,
    status character varying(80) DEFAULT 'DRAFT'::character varying NOT NULL,
    checklist jsonb,
    notes text,
    submitted_by_email character varying(255),
    approved_by_email character varying(255),
    submitted_at timestamp without time zone,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

