

-- Name: idx_dc_document_version_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_version_document ON public.dc_document_version USING btree (document_id);

