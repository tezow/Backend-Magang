

-- Name: uq_rab_revisi_item_rab_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_rab_revisi_item_rab_item ON public.rab_revisi_item USING btree (id_rab, id_rab_item) WHERE (id_rab_item IS NOT NULL);

