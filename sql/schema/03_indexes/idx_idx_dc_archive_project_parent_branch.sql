

-- Name: idx_dc_archive_project_parent_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_archive_project_parent_branch ON public.dc_archive_project USING btree (parent_branch_name);

