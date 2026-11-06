

-- Name: idx_dc_term_claim_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_term_claim_schedule ON public.dc_term_claim USING btree (term_schedule_id);

