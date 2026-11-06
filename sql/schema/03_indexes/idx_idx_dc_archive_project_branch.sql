

-- Name: idx_dc_archive_project_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_archive_project_branch ON public.dc_archive_project USING btree (branch_name);

