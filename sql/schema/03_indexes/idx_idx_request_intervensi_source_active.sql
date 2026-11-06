

-- Name: idx_request_intervensi_source_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_intervensi_source_active ON public.request_intervensi USING btree (jenis_intervensi, nomor_ulok, dokumen_sumber_id, status_request);

