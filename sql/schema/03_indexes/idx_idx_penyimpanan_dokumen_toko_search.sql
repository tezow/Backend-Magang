

-- Name: idx_penyimpanan_dokumen_toko_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_penyimpanan_dokumen_toko_search ON public.penyimpanan_dokumen_toko USING btree (kode_toko, nama_toko, cabang);

