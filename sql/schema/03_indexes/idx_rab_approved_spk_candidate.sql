

-- Name: rab_approved_spk_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rab_approved_spk_candidate ON public.rab USING btree (id_toko, created_at DESC, id DESC) WHERE ((status)::text = 'Disetujui'::text);

