

-- Name: idx_dc_monitoring_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_monitoring_project ON public.dc_monitoring_report USING btree (project_id);

