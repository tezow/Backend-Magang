-- Name: activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    actor_email character varying(255),
    actor_role character varying(255),
    action character varying(100) NOT NULL,
    status_before text,
    status_after text,
    reason text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

