

-- Name: ux_penyimpanan_dokumen_toko_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_penyimpanan_dokumen_toko_identity ON public.penyimpanan_dokumen_toko USING btree (COALESCE(lower((kode_toko)::text), ''::text), COALESCE(lower((nama_toko)::text), ''::text), COALESCE(lower((cabang)::text), ''::text));

