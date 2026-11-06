

-- Name: idx_instruksi_lapangan_toko_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruksi_lapangan_toko_status_created ON public.instruksi_lapangan USING btree (id_toko, status, created_at DESC);

