

-- Name: idx_dc_approval_status_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_approval_status_role ON public.dc_approval USING btree (status, required_role);

