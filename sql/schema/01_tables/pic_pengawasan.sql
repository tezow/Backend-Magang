-- Name: pic_pengawasan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pic_pengawasan (
    id integer NOT NULL,
    nomor_ulok character varying(255) NOT NULL,
    id_rab integer NOT NULL,
    id_spk integer NOT NULL,
    kategori_lokasi character varying(255) NOT NULL,
    durasi character varying(255) NOT NULL,
    tanggal_mulai_spk character varying(255) NOT NULL,
    plc_building_support character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    id_toko integer NOT NULL
);

