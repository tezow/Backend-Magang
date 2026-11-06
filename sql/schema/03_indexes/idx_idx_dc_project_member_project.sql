

-- Name: idx_dc_project_member_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_project_member_project ON public.dc_project_member USING btree (project_id);

