

-- Name: idx_dc_term_schedule_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_term_schedule_status ON public.dc_term_schedule USING btree (status);

