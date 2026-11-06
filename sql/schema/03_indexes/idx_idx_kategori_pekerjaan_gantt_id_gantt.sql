

-- Name: idx_kategori_pekerjaan_gantt_id_gantt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kategori_pekerjaan_gantt_id_gantt ON public.kategori_pekerjaan_gantt USING btree (id_gantt, id);

