

-- Name: ux_dc_project_member_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_dc_project_member_identity ON public.dc_project_member USING btree (project_id, lower((email)::text), COALESCE(source_entity_type, ''::character varying), COALESCE(source_entity_id, 0));

