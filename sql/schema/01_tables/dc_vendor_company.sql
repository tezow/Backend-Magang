-- Name: dc_vendor_company; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_vendor_company (
    id integer NOT NULL,
    company_name character varying(255) NOT NULL,
    npwp character varying(80),
    address text,
    contact_name character varying(255),
    contact_email character varying(255),
    contact_phone character varying(80),
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_email character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

