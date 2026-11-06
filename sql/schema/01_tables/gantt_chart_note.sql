-- Name: gantt_chart_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gantt_chart_note (
    id integer NOT NULL,
    id_gantt integer NOT NULL,
    author_email character varying(255) NOT NULL,
    author_name character varying(255) NOT NULL,
    author_role character varying(255) NOT NULL,
    note text NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

