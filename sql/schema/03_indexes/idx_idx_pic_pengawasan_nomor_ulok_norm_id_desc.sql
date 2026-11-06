

-- Name: idx_pic_pengawasan_nomor_ulok_norm_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pic_pengawasan_nomor_ulok_norm_id_desc ON public.pic_pengawasan USING btree (upper(TRIM(BOTH FROM COALESCE(nomor_ulok, ''::character varying))), id DESC);

