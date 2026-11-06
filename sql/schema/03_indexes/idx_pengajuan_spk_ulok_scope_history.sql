

-- Name: pengajuan_spk_ulok_scope_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pengajuan_spk_ulok_scope_history ON public.pengajuan_spk USING btree (upper(TRIM(BOTH FROM nomor_ulok)), upper(TRIM(BOTH FROM lingkup_pekerjaan)), created_at DESC, id DESC);

