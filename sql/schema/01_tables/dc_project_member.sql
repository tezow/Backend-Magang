-- Name: dc_project_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_project_member (
    id integer NOT NULL,
    project_id integer NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(255),
    member_type character varying(40) DEFAULT 'INTERNAL'::character varying NOT NULL,
    access_level character varying(40) DEFAULT 'VIEW'::character varying NOT NULL,
    source_entity_type character varying(80),
    source_entity_id integer,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

