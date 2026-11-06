-- Name: toko_kpi_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toko_kpi_metrics (
    id integer NOT NULL,
    id_toko integer NOT NULL,
    tanggal_notaris_start date,
    tanggal_notaris_end date,
    persentase_temuan numeric(5,2),
    deviasi_pe numeric(5,2),
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    updated_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

