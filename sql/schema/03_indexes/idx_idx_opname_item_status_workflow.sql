

-- Name: idx_opname_item_status_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_item_status_workflow ON public.opname_item USING btree (status, workflow_version);

