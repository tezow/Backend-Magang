

-- Name: idx_auth_otp_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_active ON public.auth_otp USING btree (email_sat, cabang, expires_at) WHERE (consumed_at IS NULL);

