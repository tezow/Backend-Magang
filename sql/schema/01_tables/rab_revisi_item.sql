-- Name: rab_revisi_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rab_revisi_item (
    id integer NOT NULL,
    id_rab integer NOT NULL,
    id_rab_item integer,
    approver_email character varying(255),
    approver_role character varying(80),
    catatan_item text,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    revision_round integer DEFAULT 1
);

