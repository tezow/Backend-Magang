

-- Name: idx_penyimpanan_dokumen_toko_nama; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_penyimpanan_dokumen_toko_nama ON public.penyimpanan_dokumen USING btree (id_toko, nama_dokumen);

