

-- Name: idx_dc_term_schedule_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_term_schedule_participant ON public.dc_term_schedule USING btree (participant_id);

