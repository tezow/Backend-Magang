

-- Name: idx_dc_supervision_visit_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_supervision_visit_project ON public.dc_supervision_visit USING btree (project_id);

