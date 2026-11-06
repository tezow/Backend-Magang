-- Name: instruksi_lapangan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instruksi_lapangan (
    id integer NOT NULL,
    id_toko integer NOT NULL,
    status character varying(255),
    link_pdf_gabungan character varying(500),
    link_pdf_non_sbo character varying(500),
    link_pdf_rekapitulasi character varying(500),
    link_lampiran character varying(500),
    email_pembuat character varying(255),
    pemberi_persetujuan_koordinator character varying(255),
    waktu_persetujuan_koordinator timestamp without time zone,
    pemberi_persetujuan_manager character varying(255),
    waktu_persetujuan_manager timestamp without time zone,
    pemberi_persetujuan_kontraktor character varying(255),
    waktu_persetujuan_kontraktor timestamp without time zone,
    alasan_penolakan text,
    grand_total character varying(255),
    grand_total_non_sbo character varying(255),
    grand_total_final character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    tanggal_mulai date,
    tanggal_selesai date,
    catatan_persetujuan_koordinator text,
    catatan_persetujuan_manager text,
    catatan_persetujuan_kontraktor text,
    catatan_penolakan text
);

