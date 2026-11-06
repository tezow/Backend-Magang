

-- Name: idx_dc_project_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_project_branch ON public.dc_project USING btree (branch_name);

