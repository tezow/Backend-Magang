-- Name: opname_item_revision_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opname_item_revision_history (
    id integer NOT NULL,
    id_opname_item integer NOT NULL,
    revision_no integer DEFAULT 0 NOT NULL,
    previous_status character varying,
    next_status character varying NOT NULL,
    volume_akhir numeric,
    desain character varying,
    kualitas character varying,
    spesifikasi character varying,
    foto text,
    catatan_kontraktor text,
    alasan_penolakan_support text,
    actor_email text,
    actor_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

