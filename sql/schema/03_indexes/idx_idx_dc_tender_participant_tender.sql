

-- Name: idx_dc_tender_participant_tender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_tender_participant_tender ON public.dc_tender_participant USING btree (tender_id);

