-- Name: user_branch_coverage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_branch_coverage (
    id integer NOT NULL,
    user_cabang_id integer NOT NULL,
    covered_cabang character varying(255) NOT NULL,
    coverage_label character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

