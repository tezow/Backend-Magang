-- Name: system_maintenance_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_maintenance_log (
    id bigint NOT NULL,
    is_active boolean NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    actor_email text,
    actor_role text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

