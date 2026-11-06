

-- Name: idx_opname_final_ktk_export; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opname_final_ktk_export ON public.opname_final USING btree (id_toko, created_at DESC, id DESC) WHERE (upper((COALESCE(tipe_opname, ''::character varying))::text) = 'OPNAME_FINAL'::text);

