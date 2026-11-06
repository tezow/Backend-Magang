

-- Name: idx_rab_id_toko_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rab_id_toko_latest ON public.rab USING btree (id_toko, id DESC);

