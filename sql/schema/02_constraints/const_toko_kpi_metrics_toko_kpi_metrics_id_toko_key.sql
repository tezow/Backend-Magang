

-- Name: toko_kpi_metrics toko_kpi_metrics_id_toko_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toko_kpi_metrics
    ADD CONSTRAINT toko_kpi_metrics_id_toko_key UNIQUE (id_toko);

