-- Name: dc_tender; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_tender (
    id integer NOT NULL,
    project_id integer NOT NULL,
    tender_type character varying(80) NOT NULL,
    status character varying(80) DEFAULT 'DRAFT'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    owner_estimate_amount numeric(18,2),
    oe_tolerance_percent numeric(5,2) DEFAULT 10 NOT NULL,
    winner_participant_id integer,
    created_by_email character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

