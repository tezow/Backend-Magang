

-- Name: idx_denda_action_toko; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_denda_action_toko ON public.denda_keterlambatan_action USING btree (id_toko, created_at DESC);

