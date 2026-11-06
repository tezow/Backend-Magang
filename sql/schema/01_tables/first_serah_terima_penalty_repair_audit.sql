-- Name: first_serah_terima_penalty_repair_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.first_serah_terima_penalty_repair_audit (
    opname_final_id integer CONSTRAINT first_serah_terima_penalty_repair_audi_opname_final_id_not_null NOT NULL,
    id_toko integer NOT NULL,
    old_hari_denda integer,
    old_nilai_denda numeric,
    old_tanggal_akhir_spk_denda date,
    old_tanggal_serah_terima_denda date,
    repaired_hari_denda integer CONSTRAINT first_serah_terima_penalty_repair__repaired_hari_denda_not_null NOT NULL,
    repaired_nilai_denda numeric CONSTRAINT first_serah_terima_penalty_repair_repaired_nilai_denda_not_null NOT NULL,
    repaired_tanggal_akhir_spk_denda date,
    repaired_tanggal_serah_terima_denda date,
    repaired_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

