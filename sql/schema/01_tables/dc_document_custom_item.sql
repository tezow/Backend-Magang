-- Name: dc_document_custom_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_document_custom_item (
    id integer NOT NULL,
    archive_project_id integer NOT NULL,
    project_id integer NOT NULL,
    stage character varying(40) NOT NULL,
    title character varying(255) NOT NULL,
    slots jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(40) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_email character varying(255),
    created_by_role character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    deleted_at timestamp without time zone,
    CONSTRAINT ck_dc_document_custom_item_slots_array CHECK ((jsonb_typeof(slots) = 'array'::text)),
    CONSTRAINT ck_dc_document_custom_item_stage CHECK (((stage)::text = ANY ((ARRAY['PEMBANGUNAN'::character varying, 'RENOVASI'::character varying, 'PERLUASAN'::character varying])::text[])))
);

