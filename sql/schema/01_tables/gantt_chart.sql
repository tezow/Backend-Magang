-- Name: gantt_chart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gantt_chart (
    id integer NOT NULL,
    id_toko integer,
    status character varying(255),
    email_pembuat character varying(255),
    "timestamp" date,
    lingkup_pekerjaan character varying(50) DEFAULT NULL::character varying
);

