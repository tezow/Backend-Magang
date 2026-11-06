-- Name: dc_term_claim; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_term_claim (
    id integer NOT NULL,
    term_schedule_id integer NOT NULL,
    claimed_amount numeric(18,2) NOT NULL,
    status character varying(80) DEFAULT 'SUBMITTED'::character varying NOT NULL,
    submitted_by_email character varying(255),
    review_notes text,
    submitted_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

