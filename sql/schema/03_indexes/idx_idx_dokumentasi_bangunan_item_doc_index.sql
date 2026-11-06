

-- Name: idx_dokumentasi_bangunan_item_doc_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dokumentasi_bangunan_item_doc_index ON public.dokumentasi_bangunan_item USING btree (id_dokumentasi_bangunan, item_index);

