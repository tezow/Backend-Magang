

-- Name: idx_dc_document_custom_item_archive_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_document_custom_item_archive_stage ON public.dc_document_custom_item USING btree (archive_project_id, stage) WHERE ((status)::text <> 'DELETED'::text);

