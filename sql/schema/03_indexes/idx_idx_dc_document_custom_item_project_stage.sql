

-- Name: idx_dc_document_custom_item_project_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_custom_item_project_stage ON public.dc_document_custom_item USING btree (project_id, stage) WHERE ((status)::text <> 'DELETED'::text);

