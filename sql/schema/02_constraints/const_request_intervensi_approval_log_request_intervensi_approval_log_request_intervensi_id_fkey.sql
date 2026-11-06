

-- Name: request_intervensi_approval_log request_intervensi_approval_log_request_intervensi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_intervensi_approval_log
    ADD CONSTRAINT request_intervensi_approval_log_request_intervensi_id_fkey FOREIGN KEY (request_intervensi_id) REFERENCES public.request_intervensi(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict jLwMo5cRGSIq6PnzTKiU2fvIviPyOL0YxRpw0atAxXFRha4vxDnHpF07okWztwI

