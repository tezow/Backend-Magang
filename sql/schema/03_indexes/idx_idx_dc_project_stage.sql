

-- Name: idx_dc_project_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_project_stage ON public.dc_project USING btree (current_stage);

