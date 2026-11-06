

-- Name: idx_dc_activity_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_activity_entity ON public.dc_activity_log USING btree (entity_type, entity_id, created_at DESC);

