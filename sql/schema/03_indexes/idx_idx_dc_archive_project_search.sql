

-- Name: idx_dc_archive_project_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_archive_project_search ON public.dc_archive_project USING btree (archive_code, archive_name);

