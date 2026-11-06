

-- Name: idx_dc_term_claim_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_term_claim_status ON public.dc_term_claim USING btree (status);

