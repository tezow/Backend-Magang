-- Name: opname_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opname_item (
    id integer NOT NULL,
    id_toko integer NOT NULL,
    id_rab_item integer,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    volume_akhir double precision NOT NULL,
    selisih_volume double precision NOT NULL,
    total_selisih integer NOT NULL,
    desain character varying(255),
    kualitas character varying(255),
    spesifikasi character varying(255),
    foto character varying(500),
    catatan character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    id_opname_final integer NOT NULL,
    total_harga_opname integer DEFAULT 0 NOT NULL,
    id_instruksi_lapangan_item integer,
    workflow_version text DEFAULT 'legacy'::text NOT NULL,
    id_pengawasan_gantt_target integer,
    tanggal_slot_opname date,
    submitted_by_email text,
    submitted_at timestamp with time zone,
    reviewed_by_email text,
    reviewed_at timestamp with time zone,
    alasan_penolakan_support text,
    revision_no integer DEFAULT 0 NOT NULL,
    revision_parent_id integer,
    locked_at timestamp with time zone,
    CONSTRAINT chk_opname_item_contractor_first_target CHECK (((workflow_version = 'legacy'::text) OR ((id_pengawasan_gantt_target IS NOT NULL) AND (tanggal_slot_opname IS NOT NULL)))),
    CONSTRAINT chk_opname_item_support_reject_reason CHECK (((workflow_version = 'legacy'::text) OR ((status)::text <> 'ditolak'::text) OR (NULLIF(TRIM(BOTH FROM alasan_penolakan_support), ''::text) IS NOT NULL))),
    CONSTRAINT chk_opname_item_workflow_version CHECK ((workflow_version = ANY (ARRAY['legacy'::text, 'contractor_first'::text])))
);

