

-- Name: idx_dc_project_member_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_project_member_email ON public.dc_project_member USING btree (lower((email)::text));

