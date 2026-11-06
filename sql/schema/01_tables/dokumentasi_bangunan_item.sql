-- Name: dokumentasi_bangunan_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokumentasi_bangunan_item (
    id integer NOT NULL,
    id_dokumentasi_bangunan integer NOT NULL,
    link_foto character varying(500),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()),
    sudut_foto character varying(255),
    item_index integer
);

