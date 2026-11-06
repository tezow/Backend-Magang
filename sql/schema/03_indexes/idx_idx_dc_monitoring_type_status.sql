

-- Name: idx_dc_monitoring_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dc_monitoring_type_status ON public.dc_monitoring_report USING btree (report_type, status);

