

-- Name: opname_item fk_opname_item_revision_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_item
    ADD CONSTRAINT fk_opname_item_revision_parent FOREIGN KEY (revision_parent_id) REFERENCES public.opname_item(id) ON DELETE SET NULL;

