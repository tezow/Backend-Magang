

-- Name: idx_opname_final_tipe_aksi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_final_tipe_aksi ON public.opname_final USING btree (tipe_opname, aksi);

