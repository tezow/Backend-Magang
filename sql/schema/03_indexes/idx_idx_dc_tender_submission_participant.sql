

-- Name: idx_dc_tender_submission_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_tender_submission_participant ON public.dc_tender_submission USING btree (participant_id);

