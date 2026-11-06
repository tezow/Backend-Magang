-- Name: dc_project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_project (
    id integer NOT NULL,
    project_code character varying(80) NOT NULL,
    project_name character varying(255) NOT NULL,
    location_name character varying(255),
    branch_name character varying(120),
    address text,
    area_size numeric(14,2),
    status character varying(80) DEFAULT 'PROJECT_CREATED'::character varying NOT NULL,
    current_stage character varying(80) DEFAULT 'PROJECT_CREATED'::character varying NOT NULL,
    created_by_email character varying(255),
    created_by_role character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

