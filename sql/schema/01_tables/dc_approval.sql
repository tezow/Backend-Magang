-- Name: dc_approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_approval (
    id integer NOT NULL,
    project_id integer,
    entity_type character varying(80) NOT NULL,
    entity_id integer NOT NULL,
    approval_type character varying(80) NOT NULL,
    required_role character varying(255) NOT NULL,
    status character varying(80) DEFAULT 'PENDING'::character varying NOT NULL,
    actor_email character varying(255),
    actor_role character varying(255),
    action character varying(80),
    notes text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    acted_at timestamp without time zone
);

