

-- Name: idx_gantt_chart_id_toko_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gantt_chart_id_toko_latest ON public.gantt_chart USING btree (id_toko, "timestamp" DESC NULLS LAST, id DESC);

