-- Name: rab_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rab_item (
    id bigint NOT NULL,
    id_rab bigint,
    kategori_pekerjaan character varying(1000),
    jenis_pekerjaan character varying(1000),
    satuan character varying(1000),
    volume character varying(1000),
    harga_material character varying(1000),
    harga_upah character varying(1000),
    total_material bigint,
    total_upah bigint,
    total_harga bigint,
    catatan text
);

