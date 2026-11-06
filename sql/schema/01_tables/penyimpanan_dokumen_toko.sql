-- Name: penyimpanan_dokumen_toko; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.penyimpanan_dokumen_toko (
    id integer NOT NULL,
    kode_toko character varying(100),
    nama_toko character varying(255),
    cabang character varying(150),
    folder_link text,
    source_timestamp timestamp without time zone,
    source_last_edit timestamp without time zone,
    migrated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    nomor_ulok character varying(100),
    proyek character varying(150)
);

