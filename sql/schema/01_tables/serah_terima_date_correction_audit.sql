-- Name: serah_terima_date_correction_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serah_terima_date_correction_audit (
    id integer NOT NULL,
    berkas_serah_terima_id integer CONSTRAINT serah_terima_date_correction_au_berkas_serah_terima_id_not_null NOT NULL,
    id_toko integer NOT NULL,
    nomor_ulok text,
    cabang text,
    old_created_at timestamp without time zone,
    new_created_at timestamp without time zone NOT NULL,
    old_hari_denda integer,
    old_nilai_denda numeric,
    old_tanggal_akhir_spk_denda date,
    old_tanggal_serah_terima_denda date,
    actor_email text,
    actor_role text,
    catatan text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

