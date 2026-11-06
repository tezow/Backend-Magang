

-- Name: dc_document_custom_item dc_document_custom_item_archive_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dc_document_custom_item
    ADD CONSTRAINT dc_document_custom_item_archive_project_id_fkey FOREIGN KEY (archive_project_id) REFERENCES public.dc_archive_project(id) ON DELETE CASCADE;

