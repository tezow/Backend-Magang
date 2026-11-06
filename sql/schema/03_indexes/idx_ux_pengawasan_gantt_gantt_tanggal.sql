

-- Name: ux_pengawasan_gantt_gantt_tanggal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pengawasan_gantt_gantt_tanggal ON public.pengawasan_gantt USING btree (id_gantt, tanggal_pengawasan);

