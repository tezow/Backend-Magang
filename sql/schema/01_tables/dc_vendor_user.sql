-- Name: dc_vendor_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_vendor_user (
    id integer NOT NULL,
    vendor_company_id integer NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255),
    phone character varying(80),
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

