-- Name: instruksi_lapangan_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instruksi_lapangan_item (
    id integer NOT NULL,
    id_instruksi_lapangan integer NOT NULL,
    kategori_pekerjaan text,
    jenis_pekerjaan text,
    satuan character varying(50),
    volume double precision,
    harga_material integer,
    harga_upah integer,
    total_material numeric(18,2),
    total_upah numeric(18,2),
    total_harga numeric(18,2),
    catatan text
);

