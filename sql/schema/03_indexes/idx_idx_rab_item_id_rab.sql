

-- Name: idx_rab_item_id_rab; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rab_item_id_rab ON public.rab_item USING btree (id_rab, id);

