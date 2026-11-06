

-- Name: idx_berkas_serah_terima_toko_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_berkas_serah_terima_toko_created ON public.berkas_serah_terima USING btree (id_toko, created_at DESC, id DESC);

