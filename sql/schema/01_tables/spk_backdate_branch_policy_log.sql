-- Name: spk_backdate_branch_policy_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spk_backdate_branch_policy_log (
    id bigint NOT NULL,
    branch_name text NOT NULL,
    is_enabled boolean NOT NULL,
    actor_email text,
    actor_role text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

