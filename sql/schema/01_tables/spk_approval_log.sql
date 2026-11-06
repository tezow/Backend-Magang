-- Name: spk_approval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spk_approval_log (
    id integer NOT NULL,
    pengajuan_spk_id integer NOT NULL,
    approver_email character varying(255) NOT NULL,
    tindakan character varying(20) NOT NULL,
    alasan_penolakan text,
    waktu_tindakan timestamp with time zone DEFAULT now() NOT NULL,
    catatan_approval text
);

