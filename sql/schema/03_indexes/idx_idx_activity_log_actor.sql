

-- Name: idx_activity_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_log_actor ON public.activity_log USING btree (actor_email, created_at DESC);

