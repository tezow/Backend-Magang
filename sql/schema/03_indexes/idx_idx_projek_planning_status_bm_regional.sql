

-- Name: idx_projek_planning_status_bm_regional; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projek_planning_status_bm_regional ON public.projek_planning USING btree (status) WHERE ((status)::text = 'WAITING_BM_REGIONAL_APPROVAL'::text);

