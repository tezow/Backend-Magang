-- Name: dc_tender_participant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_tender_participant (
    id integer NOT NULL,
    tender_id integer NOT NULL,
    vendor_company_id integer NOT NULL,
    status character varying(80) DEFAULT 'INVITED'::character varying NOT NULL,
    invited_by_email character varying(255),
    invited_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    last_note text
);

