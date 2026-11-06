

-- Name: request_intervensi request_intervensi_nomor_request_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_intervensi
    ADD CONSTRAINT request_intervensi_nomor_request_key UNIQUE (nomor_request);

