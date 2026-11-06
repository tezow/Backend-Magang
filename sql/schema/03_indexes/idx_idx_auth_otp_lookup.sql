

-- Name: idx_auth_otp_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_lookup ON public.auth_otp USING btree (email_sat, cabang, otp_token);

