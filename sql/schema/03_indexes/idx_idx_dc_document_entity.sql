

-- Name: idx_dc_document_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_entity ON public.dc_document USING btree (entity_type, entity_id);

