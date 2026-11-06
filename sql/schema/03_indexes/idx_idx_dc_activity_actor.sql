

-- Name: idx_dc_activity_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_activity_actor ON public.dc_activity_log USING btree (actor_email, created_at DESC);

