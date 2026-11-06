-- Name: dc_term_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_term_schedule (
    id integer NOT NULL,
    participant_id integer NOT NULL,
    term_no integer NOT NULL,
    percentage numeric(7,4) NOT NULL,
    amount numeric(18,2) NOT NULL,
    requirements text,
    status character varying(80) DEFAULT 'PROPOSED'::character varying NOT NULL,
    approved_by_email character varying(255),
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

