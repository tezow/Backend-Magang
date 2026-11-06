

-- Name: idx_dc_activity_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_activity_project ON public.dc_activity_log USING btree (project_id, created_at DESC);

