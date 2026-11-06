

-- Name: idx_pengajuan_spk_toko_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pengajuan_spk_toko_created ON public.pengajuan_spk USING btree (id_toko, created_at DESC, id DESC);

