-- Name: serah_terima_migration_backfill_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.serah_terima_migration_backfill_audit (
    audit_id integer NOT NULL,
    nomor_ulok text NOT NULL,
    lingkup_pekerjaan text CONSTRAINT serah_terima_migration_backfill_audi_lingkup_pekerjaan_not_null NOT NULL,
    id_toko integer NOT NULL,
    opname_final_id integer NOT NULL,
    old_berkas_serah_terima_id integer,
    tanggal_st date NOT NULL,
    link_pdf text,
    catatan text,
    backfilled_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL
);

