

-- Name: idx_opname_item_rab_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_item_rab_target ON public.opname_item USING btree (id_toko, id_rab_item, id_pengawasan_gantt_target);

