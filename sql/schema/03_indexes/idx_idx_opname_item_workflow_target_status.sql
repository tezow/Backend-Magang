

-- Name: idx_opname_item_workflow_target_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_item_workflow_target_status ON public.opname_item USING btree (workflow_version, id_pengawasan_gantt_target, status);

