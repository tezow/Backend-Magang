

-- Name: idx_dc_document_version_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_version_current ON public.dc_document_version USING btree (document_id, is_current);

