

-- Name: idx_auth_session_active_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_session_active_token ON public.auth_session USING btree (token_hash, expires_at) WHERE (revoked_at IS NULL);

