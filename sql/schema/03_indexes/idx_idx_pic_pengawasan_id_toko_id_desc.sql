

-- Name: idx_pic_pengawasan_id_toko_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pic_pengawasan_id_toko_id_desc ON public.pic_pengawasan USING btree (id_toko, id DESC);

