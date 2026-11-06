

-- Name: idx_pengawasan_pdf_pending_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pengawasan_pdf_pending_lookup ON public.pengawasan_pdf_migration_pending USING btree (nomor_ulok, h_day, status);

