

-- Name: idx_dc_archive_project_parent_dc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_archive_project_parent_dc ON public.dc_archive_project USING btree (parent_dc_code);

