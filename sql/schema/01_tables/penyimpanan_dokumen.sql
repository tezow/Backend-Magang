-- Name: penyimpanan_dokumen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.penyimpanan_dokumen (
    id integer NOT NULL,
    id_toko integer,
    nama_dokumen character varying(255) NOT NULL,
    link_dokumen character varying(500),
    link_folder character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    drive_file_id character varying(255),
    drive_folder_id character varying(255),
    kode_toko character varying(255),
    nama_toko character varying(255),
    cabang character varying(255),
    kategori_dokumen character varying(100),
    source_timestamp timestamp without time zone,
    source_last_edit character varying(255),
    migrated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now())
);

