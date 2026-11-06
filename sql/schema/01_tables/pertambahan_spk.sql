-- Name: pertambahan_spk; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pertambahan_spk (
    id integer NOT NULL,
    id_spk integer NOT NULL,
    pertambahan_hari character varying(255) NOT NULL,
    tanggal_spk_akhir character varying(255) NOT NULL,
    tanggal_spk_akhir_setelah_perpanjangan character varying(255) NOT NULL,
    alasan_perpanjangan character varying(500) NOT NULL,
    dibuat_oleh character varying(255) NOT NULL,
    status_persetujuan character varying(255) NOT NULL,
    disetujui_oleh character varying(255),
    waktu_persetujuan timestamp without time zone,
    alasan_penolakan character varying(500),
    link_pdf character varying(500),
    link_lampiran_pendukung character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    catatan_approval text,
    catatan_penolakan text
);

