-- Name: request_intervensi_approval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_intervensi_approval_log (
    id integer NOT NULL,
    request_intervensi_id integer NOT NULL,
    approver_email character varying(255),
    approver_role character varying(255),
    stage character varying(60) NOT NULL,
    tindakan character varying(30) NOT NULL,
    status_before character varying(60),
    status_after character varying(60),
    alasan_penolakan text,
    catatan_approval text,
    reject_disposition character varying(20),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

