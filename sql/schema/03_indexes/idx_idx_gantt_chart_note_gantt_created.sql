

-- Name: idx_gantt_chart_note_gantt_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gantt_chart_note_gantt_created ON public.gantt_chart_note USING btree (id_gantt, created_at, id);

