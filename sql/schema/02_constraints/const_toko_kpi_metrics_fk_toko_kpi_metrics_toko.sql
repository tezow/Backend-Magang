

-- Name: toko_kpi_metrics fk_toko_kpi_metrics_toko; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toko_kpi_metrics
    ADD CONSTRAINT fk_toko_kpi_metrics_toko FOREIGN KEY (id_toko) REFERENCES public.toko(id) ON DELETE CASCADE;

