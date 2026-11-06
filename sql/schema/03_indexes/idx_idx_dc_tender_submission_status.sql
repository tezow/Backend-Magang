

-- Name: idx_dc_tender_submission_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_tender_submission_status ON public.dc_tender_submission USING btree (status);

