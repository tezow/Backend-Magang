

-- Name: idx_opname_item_il_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_item_il_target ON public.opname_item USING btree (id_toko, id_instruksi_lapangan_item, id_pengawasan_gantt_target);

