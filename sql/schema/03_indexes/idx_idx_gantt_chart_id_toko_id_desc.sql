

-- Name: idx_gantt_chart_id_toko_id_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gantt_chart_id_toko_id_desc ON public.gantt_chart USING btree (id_toko, id DESC);

