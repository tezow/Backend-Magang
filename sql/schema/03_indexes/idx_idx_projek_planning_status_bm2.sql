

-- Name: idx_projek_planning_status_bm2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projek_planning_status_bm2 ON public.projek_planning USING btree (status) WHERE ((status)::text = 'WAITING_BM_APPROVAL_2'::text);

