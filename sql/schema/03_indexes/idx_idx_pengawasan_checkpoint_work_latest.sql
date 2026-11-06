

-- Name: idx_pengawasan_checkpoint_work_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pengawasan_checkpoint_work_latest ON public.pengawasan USING btree (id_pengawasan_gantt, id_gantt, upper(TRIM(BOTH FROM COALESCE(kategori_pekerjaan, ''::character varying))), upper(TRIM(BOTH FROM COALESCE(jenis_pekerjaan, ''::text))), id DESC);

