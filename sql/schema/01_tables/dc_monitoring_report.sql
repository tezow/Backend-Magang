-- Name: dc_monitoring_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_monitoring_report (
    id integer NOT NULL,
    project_id integer NOT NULL,
    report_type character varying(40) NOT NULL,
    report_date date,
    period_start date,
    period_end date,
    physical_progress numeric(7,4),
    work_summary text,
    issues text,
    next_action text,
    status character varying(80) DEFAULT 'DRAFT'::character varying NOT NULL,
    submitted_by_email character varying(255),
    reviewed_by_email character varying(255),
    review_notes text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

