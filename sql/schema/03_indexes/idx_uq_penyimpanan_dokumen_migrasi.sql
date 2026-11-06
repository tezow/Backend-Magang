

-- Name: uq_penyimpanan_dokumen_migrasi; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_penyimpanan_dokumen_migrasi ON public.penyimpanan_dokumen USING btree (kode_toko, cabang, kategori_dokumen, nama_dokumen, link_dokumen) WHERE ((kode_toko IS NOT NULL) AND (link_dokumen IS NOT NULL));

