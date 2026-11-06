

-- Name: idx_dc_tender_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_tender_type_status ON public.dc_tender USING btree (tender_type, status);

