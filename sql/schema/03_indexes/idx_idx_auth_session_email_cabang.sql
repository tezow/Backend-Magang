

-- Name: idx_auth_session_email_cabang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_session_email_cabang ON public.auth_session USING btree (email_sat, cabang, expires_at) WHERE (revoked_at IS NULL);

