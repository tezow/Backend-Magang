

-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);



-- Name: alamat_cabang id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alamat_cabang ALTER COLUMN id SET DEFAULT nextval('public.alamat_cabang_id_seq'::regclass);



-- Name: audit_backfill_cross_lingkup_pertambahan_gantt_end_2026_07_20 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_backfill_cross_lingkup_pertambahan_gantt_end_2026_07_20 ALTER COLUMN id SET DEFAULT nextval('public.audit_backfill_cross_lingkup_pertambahan_gantt_end_2026__id_seq'::regclass);



-- Name: audit_backfill_target_st_workday_checkpoints_2026_07_20 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_backfill_target_st_workday_checkpoints_2026_07_20 ALTER COLUMN id SET DEFAULT nextval('public.audit_backfill_target_st_workday_checkpoints_2026_07_20_id_seq'::regclass);



-- Name: audit_fix_cikakak_me_spk_extension_to_20_2026_07_20 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_fix_cikakak_me_spk_extension_to_20_2026_07_20 ALTER COLUMN id SET DEFAULT nextval('public.audit_fix_cikakak_me_spk_extension_to_20_2026_07_20_id_seq'::regclass);



-- Name: audit_move_renovasi_base_gantt_to_r_ulok_2026_07_20 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_move_renovasi_base_gantt_to_r_ulok_2026_07_20 ALTER COLUMN id SET DEFAULT nextval('public.audit_move_renovasi_base_gantt_to_r_ulok_2026_07_20_id_seq'::regclass);



-- Name: audit_normalize_renovasi_ulok_project_2026_07_20 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_normalize_renovasi_ulok_project_2026_07_20 ALTER COLUMN id SET DEFAULT nextval('public.audit_normalize_renovasi_ulok_project_2026_07_20_id_seq'::regclass);



-- Name: auth_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp ALTER COLUMN id SET DEFAULT nextval('public.auth_otp_id_seq'::regclass);



-- Name: auth_session id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session ALTER COLUMN id SET DEFAULT nextval('public.auth_session_id_seq'::regclass);



-- Name: berkas_pengawasan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berkas_pengawasan ALTER COLUMN id SET DEFAULT nextval('public.berkas_pengawasan_id_seq'::regclass);



-- Name: berkas_serah_terima id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.berkas_serah_terima ALTER COLUMN id SET DEFAULT nextval('public.berkas_serah_terima_id_seq'::regclass);



-- Name: day_gantt_chart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_gantt_chart ALTER COLUMN id SET DEFAULT nextval('public.day_gantt_chart_id_seq'::regclass);



-- Name: dc_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_activity_log ALTER COLUMN id SET DEFAULT nextval('public.dc_activity_log_id_seq'::regclass);



-- Name: dc_approval id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_approval ALTER COLUMN id SET DEFAULT nextval('public.dc_approval_id_seq'::regclass);



-- Name: dc_archive_project id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_archive_project ALTER COLUMN id SET DEFAULT nextval('public.dc_archive_project_id_seq'::regclass);



-- Name: dc_bast id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_bast ALTER COLUMN id SET DEFAULT nextval('public.dc_bast_id_seq'::regclass);



-- Name: dc_document id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_document ALTER COLUMN id SET DEFAULT nextval('public.dc_document_id_seq'::regclass);



-- Name: dc_document_custom_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_document_custom_item ALTER COLUMN id SET DEFAULT nextval('public.dc_document_custom_item_id_seq'::regclass);



-- Name: dc_document_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_document_version ALTER COLUMN id SET DEFAULT nextval('public.dc_document_version_id_seq'::regclass);



-- Name: dc_monitoring_report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_monitoring_report ALTER COLUMN id SET DEFAULT nextval('public.dc_monitoring_report_id_seq'::regclass);



-- Name: dc_project id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_project ALTER COLUMN id SET DEFAULT nextval('public.dc_project_id_seq'::regclass);



-- Name: dc_project_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_project_member ALTER COLUMN id SET DEFAULT nextval('public.dc_project_member_id_seq'::regclass);



-- Name: dc_supervision_finding id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_supervision_finding ALTER COLUMN id SET DEFAULT nextval('public.dc_supervision_finding_id_seq'::regclass);



-- Name: dc_supervision_visit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_supervision_visit ALTER COLUMN id SET DEFAULT nextval('public.dc_supervision_visit_id_seq'::regclass);



-- Name: dc_tender id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_tender ALTER COLUMN id SET DEFAULT nextval('public.dc_tender_id_seq'::regclass);



-- Name: dc_tender_participant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_tender_participant ALTER COLUMN id SET DEFAULT nextval('public.dc_tender_participant_id_seq'::regclass);



-- Name: dc_tender_submission id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_tender_submission ALTER COLUMN id SET DEFAULT nextval('public.dc_tender_submission_id_seq'::regclass);



-- Name: dc_term_claim id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_term_claim ALTER COLUMN id SET DEFAULT nextval('public.dc_term_claim_id_seq'::regclass);



-- Name: dc_term_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_term_schedule ALTER COLUMN id SET DEFAULT nextval('public.dc_term_schedule_id_seq'::regclass);



-- Name: dc_vendor_company id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_vendor_company ALTER COLUMN id SET DEFAULT nextval('public.dc_vendor_company_id_seq'::regclass);



-- Name: dc_vendor_service id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_vendor_service ALTER COLUMN id SET DEFAULT nextval('public.dc_vendor_service_id_seq'::regclass);



-- Name: dc_vendor_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_vendor_user ALTER COLUMN id SET DEFAULT nextval('public.dc_vendor_user_id_seq'::regclass);



-- Name: denda_keterlambatan_action id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.denda_keterlambatan_action ALTER COLUMN id SET DEFAULT nextval('public.denda_keterlambatan_action_id_seq'::regclass);



-- Name: dependency_gantt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dependency_gantt ALTER COLUMN id SET DEFAULT nextval('public.dependency_gantt_id_seq'::regclass);



-- Name: dokumentasi_bangunan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumentasi_bangunan ALTER COLUMN id SET DEFAULT nextval('public.dokumentasi_bangunan_id_seq'::regclass);



-- Name: dokumentasi_bangunan_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumentasi_bangunan_item ALTER COLUMN id SET DEFAULT nextval('public.dokumentasi_bangunan_item_id_seq'::regclass);



-- Name: gantt_chart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gantt_chart ALTER COLUMN id SET DEFAULT nextval('public.gantt_chart_id_seq'::regclass);



-- Name: gantt_chart_note id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gantt_chart_note ALTER COLUMN id SET DEFAULT nextval('public.gantt_chart_note_id_seq'::regclass);



-- Name: instruksi_lapangan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instruksi_lapangan ALTER COLUMN id SET DEFAULT nextval('public.instruksi_lapangan_id_seq'::regclass);



-- Name: instruksi_lapangan_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instruksi_lapangan_item ALTER COLUMN id SET DEFAULT nextval('public.instruksi_lapangan_item_id_seq'::regclass);



-- Name: kategori_pekerjaan_gantt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategori_pekerjaan_gantt ALTER COLUMN id SET DEFAULT nextval('public.kategori_pekerjaan_gantt_id_seq'::regclass);



-- Name: opname_final id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_final ALTER COLUMN id SET DEFAULT nextval('public.opname_final_id_seq'::regclass);



-- Name: opname_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_item ALTER COLUMN id SET DEFAULT nextval('public.opname_item_id_seq'::regclass);



-- Name: opname_item_revision_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_item_revision_history ALTER COLUMN id SET DEFAULT nextval('public.opname_item_revision_history_id_seq'::regclass);



-- Name: pengajuan_spk id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengajuan_spk ALTER COLUMN id SET DEFAULT nextval('public.pengajuan_spk_id_seq'::regclass);



-- Name: pengawasan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengawasan ALTER COLUMN id SET DEFAULT nextval('public.pengawasan_id_seq'::regclass);



-- Name: pengawasan_duplicate_cleanup_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengawasan_duplicate_cleanup_audit ALTER COLUMN id SET DEFAULT nextval('public.pengawasan_duplicate_cleanup_audit_id_seq'::regclass);



-- Name: pengawasan_gantt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengawasan_gantt ALTER COLUMN id SET DEFAULT nextval('public.pengawasan_gantt_id_seq'::regclass);



-- Name: pengawasan_pdf_migration_pending id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengawasan_pdf_migration_pending ALTER COLUMN id SET DEFAULT nextval('public.pengawasan_pdf_migration_pending_id_seq'::regclass);



-- Name: pengawasan_stale_blocker_cleanup_audit audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pengawasan_stale_blocker_cleanup_audit ALTER COLUMN audit_id SET DEFAULT nextval('public.pengawasan_stale_blocker_cleanup_audit_audit_id_seq'::regclass);



-- Name: penyimpanan_dokumen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penyimpanan_dokumen ALTER COLUMN id SET DEFAULT nextval('public.penyimpanan_dokumen_id_seq'::regclass);



-- Name: penyimpanan_dokumen_toko id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penyimpanan_dokumen_toko ALTER COLUMN id SET DEFAULT nextval('public.penyimpanan_dokumen_toko_id_seq'::regclass);



-- Name: pertambahan_spk id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pertambahan_spk ALTER COLUMN id SET DEFAULT nextval('public.pertambahan_spk_id_seq'::regclass);



-- Name: pic_pengawasan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pic_pengawasan ALTER COLUMN id SET DEFAULT nextval('public.pic_pengawasan_id_seq'::regclass);



-- Name: projek_planning id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_id_seq'::regclass);



-- Name: projek_planning_catatan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning_catatan ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_catatan_id_seq'::regclass);



-- Name: projek_planning_fasilitas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning_fasilitas ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_fasilitas_id_seq'::regclass);



-- Name: projek_planning_foto_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning_foto_item ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_foto_item_id_seq'::regclass);



-- Name: projek_planning_ketentuan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning_ketentuan ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_ketentuan_id_seq'::regclass);



-- Name: projek_planning_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projek_planning_log ALTER COLUMN id SET DEFAULT nextval('public.projek_planning_log_id_seq'::regclass);



-- Name: rab id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rab ALTER COLUMN id SET DEFAULT nextval('public.rab_id_seq'::regclass);



-- Name: rab_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rab_item ALTER COLUMN id SET DEFAULT nextval('public.rab_item_id_seq'::regclass);



-- Name: rab_revisi_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rab_revisi_item ALTER COLUMN id SET DEFAULT nextval('public.rab_revisi_item_id_seq'::regclass);



-- Name: request_intervensi id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_intervensi ALTER COLUMN id SET DEFAULT nextval('public.request_intervensi_id_seq'::regclass);



-- Name: request_intervensi_approval_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_intervensi_approval_log ALTER COLUMN id SET DEFAULT nextval('public.request_intervensi_approval_log_id_seq'::regclass);



-- Name: serah_terima_date_correction_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima_date_correction_audit ALTER COLUMN id SET DEFAULT nextval('public.serah_terima_date_correction_audit_id_seq'::regclass);



-- Name: serah_terima_date_fix_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima_date_fix_audit ALTER COLUMN id SET DEFAULT nextval('public.serah_terima_date_fix_audit_id_seq'::regclass);



-- Name: serah_terima_invalid_readiness_cleanup_audit audit_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima_invalid_readiness_cleanup_audit ALTER COLUMN audit_id SET DEFAULT nextval('public.serah_terima_invalid_readiness_cleanup_audit_audit_id_seq'::regclass);



-- Name: serah_terima_specific_date_fix_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.serah_terima_specific_date_fix_audit ALTER COLUMN id SET DEFAULT nextval('public.serah_terima_specific_date_fix_audit_id_seq'::regclass);



-- Name: spk_approval_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spk_approval_log ALTER COLUMN id SET DEFAULT nextval('public.spk_approval_log_id_seq'::regclass);



-- Name: spk_backdate_branch_policy_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spk_backdate_branch_policy_log ALTER COLUMN id SET DEFAULT nextval('public.spk_backdate_branch_policy_log_id_seq'::regclass);



-- Name: system_access_schedule_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_access_schedule_log ALTER COLUMN id SET DEFAULT nextval('public.system_access_schedule_log_id_seq'::regclass);



-- Name: system_maintenance_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_maintenance_log ALTER COLUMN id SET DEFAULT nextval('public.system_maintenance_log_id_seq'::regclass);



-- Name: takeover_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.takeover_inspections ALTER COLUMN id SET DEFAULT nextval('public.takeover_inspections_id_seq'::regclass);



-- Name: toko id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toko ALTER COLUMN id SET DEFAULT nextval('public.toko_id_seq'::regclass);



-- Name: toko_kpi_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toko_kpi_metrics ALTER COLUMN id SET DEFAULT nextval('public.toko_kpi_metrics_id_seq'::regclass);



-- Name: user_branch_coverage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch_coverage ALTER COLUMN id SET DEFAULT nextval('public.user_branch_coverage_id_seq'::regclass);



-- Name: user_cabang id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_cabang ALTER COLUMN id SET DEFAULT nextval('public.user_cabang_id_seq'::regclass);



-- Name: backfill_2sz1_2603_0006_me_carry_forward_20260824 id; Type: DEFAULT; Schema: sparta_audit; Owner: -
--

ALTER TABLE ONLY sparta_audit.backfill_2sz1_2603_0006_me_carry_forward_20260824 ALTER COLUMN id SET DEFAULT nextval('sparta_audit.backfill_2sz1_2603_0006_me_carry_forward_20260824_id_seq'::regclass);

