

-- Name: pengajuan_spk_group_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pengajuan_spk_group_lookup ON public.pengajuan_spk USING btree (spk_group_id) WHERE (spk_group_id IS NOT NULL);

