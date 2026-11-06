

-- Name: toko_kpi_metrics update_toko_kpi_metrics_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_toko_kpi_metrics_updated_at_trigger BEFORE UPDATE ON public.toko_kpi_metrics FOR EACH ROW EXECUTE FUNCTION public.update_toko_kpi_metrics_updated_at();

