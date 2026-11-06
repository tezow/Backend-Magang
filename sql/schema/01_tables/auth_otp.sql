-- Name: auth_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_otp (
    id integer NOT NULL,
    email_sat character varying(255) NOT NULL,
    cabang character varying(255) NOT NULL,
    otp_hash character varying(255) NOT NULL,
    otp_token character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('Asia/Jakarta'::text, now()),
    consumed_at timestamp with time zone
);

