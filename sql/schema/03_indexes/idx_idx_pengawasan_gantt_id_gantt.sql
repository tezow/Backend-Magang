

-- Name: idx_pengawasan_gantt_id_gantt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pengawasan_gantt_id_gantt ON public.pengawasan_gantt USING btree (id_gantt, id);

