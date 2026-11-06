

-- Name: idx_denda_action_opname_final; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_denda_action_opname_final ON public.denda_keterlambatan_action USING btree (id_opname_final, created_at DESC);

