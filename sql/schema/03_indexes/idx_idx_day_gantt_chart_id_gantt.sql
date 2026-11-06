

-- Name: idx_day_gantt_chart_id_gantt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_day_gantt_chart_id_gantt ON public.day_gantt_chart USING btree (id_gantt, id);

