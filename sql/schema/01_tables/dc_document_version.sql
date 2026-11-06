-- Name: dc_document_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dc_document_version (
    id integer NOT NULL,
    document_id integer NOT NULL,
    version_no integer NOT NULL,
    drive_file_id character varying(255),
    file_name character varying(255),
    mime_type character varying(180),
    size_bytes bigint,
    notes text,
    uploaded_by_email character varying(255),
    uploaded_by_role character varying(255),
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('Asia/Jakarta'::text, now()) NOT NULL,
    drive_folder_id character varying(255),
    link_dokumen text,
    link_folder text
);

