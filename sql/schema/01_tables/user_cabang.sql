-- Name: user_cabang; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_cabang (
    cabang text,
    nama_lengkap text,
    jabatan text,
    email_sat text,
    nama_pt text,
    id integer NOT NULL,
    last_login_at timestamp with time zone
);

