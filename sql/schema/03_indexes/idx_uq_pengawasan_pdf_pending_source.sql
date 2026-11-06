

-- Name: uq_pengawasan_pdf_pending_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pengawasan_pdf_pending_source ON public.pengawasan_pdf_migration_pending USING btree (nomor_ulok, lingkup_pekerjaan, h_day, source_sheet, source_row);

