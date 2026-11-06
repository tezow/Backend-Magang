-- Name: system_access_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_access_schedule (
    id integer DEFAULT 1 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    weekday_enabled boolean DEFAULT true NOT NULL,
    weekend_enabled boolean DEFAULT false NOT NULL,
    general_start_minutes integer DEFAULT 360 NOT NULL,
    general_end_minutes integer DEFAULT 1440 NOT NULL,
    contractor_start_minutes integer DEFAULT 360 NOT NULL,
    contractor_end_minutes integer DEFAULT 1440 NOT NULL,
    updated_by_email text,
    updated_by_role text,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

