

-- Name: idx_toko_ulok_lingkup_seq_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_toko_ulok_lingkup_seq_normalized ON public.toko USING btree (upper(TRIM(BOTH FROM nomor_ulok)), COALESCE(upper(TRIM(BOTH FROM lingkup_pekerjaan)), ''::text), takeover_sequence);

