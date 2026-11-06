-- Name: toko; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toko (
    id integer NOT NULL,
    nomor_ulok character varying(255),
    lingkup_pekerjaan character varying(255),
    nama_toko character varying(255),
    kode_toko character varying(255),
    proyek character varying(255),
    cabang character varying(255),
    alamat character varying(255),
    nama_kontraktor character varying(255),
    takeover_sequence integer DEFAULT 0
);

