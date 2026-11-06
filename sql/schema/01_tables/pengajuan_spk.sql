-- Name: pengajuan_spk; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pengajuan_spk (
    id integer NOT NULL,
    nomor_ulok character varying(255) NOT NULL,
    email_pembuat character varying(255) NOT NULL,
    lingkup_pekerjaan character varying(255) NOT NULL,
    nama_kontraktor character varying(255) NOT NULL,
    proyek character varying(255) NOT NULL,
    waktu_mulai date NOT NULL,
    durasi integer NOT NULL,
    waktu_selesai timestamp with time zone NOT NULL,
    grand_total numeric(18,2) NOT NULL,
    terbilang character varying(500) NOT NULL,
    nomor_spk character varying(255) NOT NULL,
    par character varying(255),
    spk_manual_1 character varying(255),
    spk_manual_2 character varying(255),
    status character varying(50) NOT NULL,
    link_pdf character varying(500),
    approver_email character varying(255),
    waktu_persetujuan timestamp with time zone,
    alasan_penolakan text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id_toko integer NOT NULL,
    spk_group_id uuid
);

