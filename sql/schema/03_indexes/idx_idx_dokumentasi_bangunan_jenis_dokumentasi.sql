

-- Name: idx_dokumentasi_bangunan_jenis_dokumentasi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dokumentasi_bangunan_jenis_dokumentasi ON public.dokumentasi_bangunan USING btree (jenis_dokumentasi);

