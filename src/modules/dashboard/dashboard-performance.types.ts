export type DashboardPerformanceQueryInput = {
    actor_cabang: string; // "HEAD OFFICE" or specific branch
    cabang?: string;
    coordinator?: string;
    support?: string;
    job_type?: string;
    search?: string;
};

export type DashboardPerformanceDrilldownInput = DashboardPerformanceQueryInput & {
    card_type:
        | 'sla'
        | 'cost_m2'
        | 'jhk'
        | 'denda'
        | 'kerja_tambah'
        | 'kerja_kurang'
        | 'ketepatan_st'
        | 'sla_ktk';
    sla_role?: 'coord' | 'manager' | 'bm';
    sla_doc?: 'rab' | 'spk' | 'tambah_spk' | 'il' | 'ktk' | 'pp';
    person_role?: 'coord' | 'support';
    person_name?: string;
    page: number;
    limit: number;
};
