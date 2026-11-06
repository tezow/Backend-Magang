

-- Name: idx_request_intervensi_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_intervensi_status ON public.request_intervensi USING btree (status_request, current_approval_stage);

