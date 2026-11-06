-- Name: dc_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_document (
    id integer NOT NULL,
    project_id integer,
    tender_id integer,
    participant_id integer,
    entity_type character varying(80) NOT NULL,
    entity_id integer,
    document_type character varying(120) NOT NULL,
    stage character varying(80),
    status character varying(80) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_email character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    deleted_at timestamp without time zone
);

