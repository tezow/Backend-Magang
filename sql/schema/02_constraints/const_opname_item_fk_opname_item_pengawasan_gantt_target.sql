

-- Name: opname_item fk_opname_item_pengawasan_gantt_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_item
    ADD CONSTRAINT fk_opname_item_pengawasan_gantt_target FOREIGN KEY (id_pengawasan_gantt_target) REFERENCES public.pengawasan_gantt(id) ON DELETE SET NULL;

