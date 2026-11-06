

-- Name: idx_dc_document_status_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_status_project ON public.dc_document USING btree (project_id, status);

