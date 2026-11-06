

-- Name: idx_denda_action_status_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_denda_action_status_expiry ON public.denda_keterlambatan_action USING btree (status, expires_at);

