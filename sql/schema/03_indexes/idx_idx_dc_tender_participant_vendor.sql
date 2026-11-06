

-- Name: idx_dc_tender_participant_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_tender_participant_vendor ON public.dc_tender_participant USING btree (vendor_company_id);

