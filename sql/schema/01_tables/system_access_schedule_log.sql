-- Name: system_access_schedule_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_access_schedule_log (
    id bigint NOT NULL,
    is_enabled boolean NOT NULL,
    weekday_enabled boolean NOT NULL,
    weekend_enabled boolean NOT NULL,
    general_start_minutes integer NOT NULL,
    general_end_minutes integer NOT NULL,
    contractor_start_minutes integer NOT NULL,
    contractor_end_minutes integer NOT NULL,
    actor_email text,
    actor_role text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

