

-- Name: pengajuan_spk_group_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pengajuan_spk_group_scope_unique ON public.pengajuan_spk USING btree (spk_group_id, upper(TRIM(BOTH FROM lingkup_pekerjaan))) WHERE (spk_group_id IS NOT NULL);

