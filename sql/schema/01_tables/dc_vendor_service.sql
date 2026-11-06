-- Name: dc_vendor_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_vendor_service (
    id integer NOT NULL,
    vendor_company_id integer NOT NULL,
    service_type character varying(80) NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

