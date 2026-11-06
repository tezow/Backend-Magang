-- Name: dc_archive_project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_archive_project (
    id integer NOT NULL,
    project_id integer NOT NULL,
    archive_code character varying(80) NOT NULL,
    archive_name character varying(255) NOT NULL,
    branch_name character varying(120) NOT NULL,
    location_name character varying(255),
    project_type character varying(120) NOT NULL,
    address text,
    notes text,
    created_by_email character varying(255),
    created_by_role character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    archive_type character varying(40),
    initial_code character varying(80),
    parent_dc_code character varying(80),
    parent_dc_name character varying(255),
    parent_branch_name character varying(120)
);

