-- Name: pengawasan_gantt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pengawasan_gantt (
    id integer NOT NULL,
    id_gantt integer,
    tanggal_pengawasan character varying(255),
    id_pic_pengawasan integer,
    workflow_version text DEFAULT 'legacy'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_pengawasan_gantt_workflow_version CHECK ((workflow_version = ANY (ARRAY['legacy'::text, 'contractor_first'::text])))
);

