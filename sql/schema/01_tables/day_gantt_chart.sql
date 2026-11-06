-- Name: day_gantt_chart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.day_gantt_chart (
    id integer NOT NULL,
    id_gantt integer,
    id_kategori_pekerjaan_gantt integer,
    h_awal character varying(255),
    h_akhir character varying(255),
    keterlambatan character varying(255),
    kecepatan character varying(255)
);

