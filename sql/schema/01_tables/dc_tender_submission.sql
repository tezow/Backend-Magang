-- Name: dc_tender_submission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_tender_submission (
    id integer NOT NULL,
    participant_id integer NOT NULL,
    submission_type character varying(80) NOT NULL,
    status character varying(80) DEFAULT 'SUBMITTED'::character varying NOT NULL,
    submitted_offer_amount numeric(18,2),
    offer_vs_oe_percent numeric(9,4),
    oe_review_required boolean DEFAULT false NOT NULL,
    oe_review_status character varying(80),
    notes text,
    submitted_by_email character varying(255),
    submitted_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

