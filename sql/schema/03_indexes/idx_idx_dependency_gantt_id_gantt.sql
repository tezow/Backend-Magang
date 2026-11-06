

-- Name: idx_dependency_gantt_id_gantt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dependency_gantt_id_gantt ON public.dependency_gantt USING btree (id_gantt, id);

