

-- Name: idx_user_cabang_last_login_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_cabang_last_login_at ON public.user_cabang USING btree (last_login_at DESC);

