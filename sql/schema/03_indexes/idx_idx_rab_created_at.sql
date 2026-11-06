

-- Name: idx_rab_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rab_created_at ON public.rab USING btree (created_at DESC, id DESC);

