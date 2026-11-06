

-- Name: idx_rab_link_pdf_materai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rab_link_pdf_materai ON public.rab USING btree (link_pdf_materai) WHERE (link_pdf_materai IS NOT NULL);

