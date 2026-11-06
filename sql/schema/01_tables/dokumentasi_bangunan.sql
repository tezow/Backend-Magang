-- Name: dokumentasi_bangunan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokumentasi_bangunan (
    id integer NOT NULL,
    nomor_ulok character varying(255),
    nama_toko character varying(255),
    kode_toko character varying(255),
    cabang character varying(255),
    tanggal_go character varying(255),
    tanggal_serah_terima character varying(255),
    tanggal_ambil_foto character varying(255),
    spk_awal character varying(255),
    spk_akhir character varying(255),
    kontraktor_sipil character varying(255),
    kontraktor_me character varying(255),
    link_pdf character varying(500),
    email_pengirim character varying(255),
    status_validasi character varying(255),
    alasan_revisi character varying(255),
    pic_dokumentasi character varying(255),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()),
    jenis_toko character varying(50) DEFAULT 'REGULAR'::character varying NOT NULL,
    jenis_dokumentasi character varying(50) DEFAULT 'BANGUNAN_TOKO_BARU'::character varying NOT NULL
);

