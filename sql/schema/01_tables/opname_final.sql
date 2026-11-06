-- Name: opname_final; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opname_final (
    id integer NOT NULL,
    id_toko integer NOT NULL,
    status_opname_final character varying(255) DEFAULT 'Proses KTK/Approval Kontraktor'::character varying NOT NULL,
    link_pdf_opname character varying(500),
    email_pembuat character varying(255),
    pemberi_persetujuan_direktur character varying(255),
    waktu_persetujuan_direktur character varying(255),
    pemberi_persetujuan_koordinator character varying(255),
    waktu_persetujuan_koordinator character varying(255),
    pemberi_persetujuan_manager character varying(255),
    waktu_persetujuan_manager character varying(255),
    alasan_penolakan character varying(255),
    grand_total_opname character varying(255),
    grand_total_rab character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    aksi character varying(20) DEFAULT 'active'::character varying NOT NULL,
    hari_denda integer DEFAULT 0 NOT NULL,
    nilai_denda numeric(18,2) DEFAULT 0 NOT NULL,
    tanggal_akhir_spk_denda date,
    tanggal_serah_terima_denda date,
    catatan_persetujuan_koordinator text,
    catatan_persetujuan_manager text,
    catatan_persetujuan_direktur text,
    catatan_penolakan text,
    tipe_opname character varying(50) DEFAULT 'OPNAME'::character varying NOT NULL,
    grand_total_final text,
    workflow_version text DEFAULT 'legacy'::text NOT NULL,
    CONSTRAINT chk_opname_final_workflow_version CHECK ((workflow_version = ANY (ARRAY['legacy'::text, 'contractor_first'::text])))
);

