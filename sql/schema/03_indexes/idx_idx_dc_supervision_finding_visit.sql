

-- Name: idx_dc_supervision_finding_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_supervision_finding_visit ON public.dc_supervision_finding USING btree (visit_id);

