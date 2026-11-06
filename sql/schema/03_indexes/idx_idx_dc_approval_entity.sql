

-- Name: idx_dc_approval_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_approval_entity ON public.dc_approval USING btree (entity_type, entity_id);

