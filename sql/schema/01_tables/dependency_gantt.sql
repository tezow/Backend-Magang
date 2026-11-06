-- Name: dependency_gantt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dependency_gantt (
    id integer NOT NULL,
    id_gantt integer,
    id_kategori integer,
    id_kategori_terikat integer
);

