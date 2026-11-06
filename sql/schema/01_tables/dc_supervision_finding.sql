-- Name: dc_supervision_finding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_supervision_finding (
    id integer NOT NULL,
    visit_id integer NOT NULL,
    category character varying(120),
    description text NOT NULL,
    severity character varying(40) DEFAULT 'MEDIUM'::character varying NOT NULL,
    assigned_to_type character varying(80),
    due_date date,
    status character varying(80) DEFAULT 'OPEN'::character varying NOT NULL,
    follow_up_notes text,
    close_notes text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

