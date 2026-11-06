-- Name: spk_backdate_branch_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spk_backdate_branch_policy (
    branch_name text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_by_email text,
    updated_by_role text,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

