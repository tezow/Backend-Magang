

-- Name: opname_item_revision_history opname_item_revision_history_id_opname_item_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_item_revision_history
    ADD CONSTRAINT opname_item_revision_history_id_opname_item_fkey FOREIGN KEY (id_opname_item) REFERENCES public.opname_item(id) ON DELETE CASCADE;

