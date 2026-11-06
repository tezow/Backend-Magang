import { calculateDendaFromDates } from "../denda/denda-keterlambatan";
import { calculateEffectiveStDate } from "../../common/national-holidays";
import type { DashboardData } from "./dashboard.repository";
import type {
    DashboardV2CardType,
    DashboardV2Chart,
    DashboardV2Charts,
    DashboardV2Detail,
    DashboardV2DocumentType,
    DashboardV2JobType,
    DashboardV2Metric,
    DashboardV2Period,
    DashboardV2Row,
    DashboardV2Summary,
    DashboardV2SummaryCard,
    DashboardV2Timeline,
    DashboardV2TimelineNode,
    DashboardV2Tone
} from "./dashboard-v2.types";
import {
    displayDashboardV2Status,
    formatDashboardV2ApproverTime,
    formatDashboardV2Area,
    formatDashboardV2Date,
    formatDashboardV2DateTime,
    formatDashboardV2Days,
    formatDashboardV2Rupiah,
    parseDashboardV2Date,
    parseDashboardV2Number
} from "./dashboard-v2.formatters";

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();
const plain = (value: unknown, fallback = "-") => String(value ?? "").trim() || fallback;

const metric = (label: string, value: string | number, tone: DashboardV2Tone = "neutral"): DashboardV2Metric => ({
    label,
    value,
    tone
});

const dateKey = (value: unknown): string | null => {
    const date = parseDashboardV2Date(value);
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const dayDiff = (from: Date | null, to: Date | null = new Date()): number => {
    if (!from || !to) return 0;
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
};

const latestByDate = <T>(items: T[], readDate: (item: T) => unknown): T | undefined =>
    [...items].sort((a, b) => {
        const bTime = parseDashboardV2Date(readDate(b))?.getTime() ?? 0;
        const aTime = parseDashboardV2Date(readDate(a))?.getTime() ?? 0;
        return bTime - aTime;
    })[0];

export const isDashboardV2RenovasiProject = (project: DashboardData): boolean => {
    const proyek = normalize(project.toko?.proyek);
    return proyek.includes("RENOVASI") || proyek.includes("PERBAIKAN") || proyek.includes("PEREMAJAAN");
};

export const isDashboardV2RegulerProject = (project: DashboardData): boolean => {
    const proyek = normalize(project.toko?.proyek);
    return proyek === "REGULER" || proyek === "ALFAMART REGULER" || proyek.includes("REGULER");
};

export const matchesDashboardV2JobType = (project: DashboardData, jobType: DashboardV2JobType): boolean => {
    if (jobType === "ALL") return true;
    if (jobType === "RENOVASI") return isDashboardV2RenovasiProject(project);
    return isDashboardV2RegulerProject(project);
};

export const isDashboardV2ApprovedSpkStatus = (status: unknown): boolean =>
    ["APPROVED", "ACTIVE", "SPK_APPROVED", "DISETUJUI", "AKTIF", "SELESAI"].includes(normalize(status));

export const isDashboardV2RejectedOrCancelled = (status: unknown): boolean =>
    ["REJECTED", "REJECT", "CANCELLED", "CANCEL", "DITOLAK", "DIBATALKAN"].includes(normalize(status));

export const isDashboardV2OpnameParsialKtkProcess = (status: unknown): boolean =>
    ["PROSES KTK", "PROSES_KTK", "APPROVAL KONTRAKTOR", "APPROVAL_KONTRAKTOR"].includes(normalize(status));

export const getDashboardV2RabContractValue = (project: DashboardData): number =>
    parseDashboardV2Number(project.rab?.[0]?.grand_total_final);

export const getDashboardV2ApprovedSpks = (project: DashboardData) =>
    project.spk.filter((spk) => isDashboardV2ApprovedSpkStatus(spk.status));

export const getDashboardV2Stage = (project: DashboardData): string => {
    const rab = project.rab?.[0];
    const rabStatus = normalize(rab?.status);
    const approvedSpks = getDashboardV2ApprovedSpks(project);
    const waitingSpk = project.spk.some((spk) => normalize(spk.status) === "WAITING_FOR_BM_APPROVAL");
    const stDocs = project.berkas_serah_terima.filter((st) => String(st.link_pdf || "").trim());
    const opname = project.opname_final?.[0];
    const opnameStatus = normalize(opname?.status_opname_final);

    if (stDocs.length > 0 || opnameStatus === "DISETUJUI") return "Done";
    if (opname && !isDashboardV2OpnameParsialKtkProcess(opnameStatus)) return "Kerja Tambah Kurang";
    if (approvedSpks.length > 0 || isDashboardV2OpnameParsialKtkProcess(opnameStatus)) return "Ongoing";
    if (waitingSpk) return "Approval SPK";
    if (rabStatus === "DISETUJUI") return "Proses PJU";
    if (rab && rabStatus === "MENUNGGU GANTT CHART") return "Proses Gantt";
    return "Approval RAB";
};

export const isDashboardV2PastSla = (project: DashboardData, stage = getDashboardV2Stage(project), now = new Date()): boolean => {
    if (stage === "Proses Gantt" || stage === "Done") return false;
    const rab = project.rab?.[0];

    if (stage === "Approval RAB") {
        return dayDiff(parseDashboardV2Date(rab?.created_at), parseDashboardV2Date(rab?.waktu_persetujuan_manager) || now) > 2;
    }

    if (stage === "Proses PJU") {
        const firstSpk = project.spk
            .map((spk) => parseDashboardV2Date(spk.created_at))
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        return dayDiff(parseDashboardV2Date(rab?.waktu_persetujuan_manager), firstSpk || now) > 10;
    }

    if (stage === "Approval SPK") {
        const spk = project.spk.find((item) => normalize(item.status) === "WAITING_FOR_BM_APPROVAL") || project.spk[0];
        return dayDiff(parseDashboardV2Date(spk?.created_at), parseDashboardV2Date(spk?.waktu_persetujuan) || now) > 2;
    }

    if (stage === "Ongoing") {
        const approved = getDashboardV2ApprovedSpks(project);
        const starts = approved
            .map((spk) => parseDashboardV2Date(spk.waktu_mulai || spk.created_at))
            .filter((date): date is Date => Boolean(date))
            .sort((a, b) => a.getTime() - b.getTime());
        const allowedDays = Math.max(0, ...approved.map((spk) => Number(spk.durasi || 0) + spk.pertambahan_spk
            .filter((pt) => ["APPROVED", "DISETUJUI", "DISETUJUI BM"].includes(normalize(pt.status_persetujuan)))
            .reduce((sum, pt) => sum + Number(pt.pertambahan_hari || 0), 0)));
        return dayDiff(starts[0] ?? null, now) > allowedDays;
    }

    if (stage === "Kerja Tambah Kurang") {
        const latestSt = latestByDate(project.berkas_serah_terima, (item) => item.created_at);
        const opname = project.opname_final?.[0];
        return dayDiff(parseDashboardV2Date(latestSt?.created_at), parseDashboardV2Date(opname?.created_at) || now) > 14;
    }

    return false;
};

export const getDashboardV2DendaInfo = (project: DashboardData) => {
    const approved = getDashboardV2ApprovedSpks(project);
    const endDates = approved
        .map((spk) => {
            const extension = spk.pertambahan_spk
                .filter((pt) => ["APPROVED", "DISETUJUI", "DISETUJUI BM"].includes(normalize(pt.status_persetujuan)))
                .map((pt) => parseDashboardV2Date(pt.tanggal_spk_akhir_setelah_perpanjangan))
                .filter((date): date is Date => Boolean(date))
                .sort((a, b) => b.getTime() - a.getTime())[0];
            return extension || parseDashboardV2Date(spk.waktu_selesai);
        })
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime());
    const end = endDates[0] ?? null;
    const st = parseDashboardV2Date(project.berkas_serah_terima?.[0]?.created_at);
    const target = end ? calculateEffectiveStDate(end).effectiveStDate : null;
    const calculated = calculateDendaFromDates(end, st || new Date());
    const official = project.opname_final?.[0];
    const officialDateSynced = !official?.tanggal_serah_terima_denda
        || !project.berkas_serah_terima?.[0]?.created_at
        || dateKey(official.tanggal_serah_terima_denda) === dateKey(project.berkas_serah_terima[0].created_at);
    const officialDays = officialDateSynced ? Number(official?.hari_denda || 0) : 0;
    const officialAmount = officialDateSynced ? parseDashboardV2Number(official?.nilai_denda) : 0;
    return {
        late_days: officialDays || calculated.hari_denda || 0,
        amount: officialAmount,
        target_st_label: target ? formatDashboardV2Date(target) : "-",
        actual_st_label: st ? formatDashboardV2Date(st) : "-",
        end_spk_label: end ? formatDashboardV2Date(end) : "-"
    };
};

const baseRow = (project: DashboardData, cardType: DashboardV2CardType, valueLabel = "-"): DashboardV2Row => ({
    key: `${cardType}-${project.toko.id}`,
    toko_id: project.toko.id,
    nomor_ulok: plain(project.toko.nomor_ulok),
    nama_toko: plain(project.toko.nama_toko),
    cabang: plain(project.toko.cabang),
    lingkup_pekerjaan: plain(project.toko.lingkup_pekerjaan),
    proyek: plain(project.toko.proyek),
    stage: getDashboardV2Stage(project),
    status_label: displayDashboardV2Status(getDashboardV2Stage(project)),
    value_label: valueLabel,
    metrics: []
});

const pengawasanCounts = (project: DashboardData) => {
    let selesai = 0;
    let progress = 0;
    let terlambat = 0;
    for (const gantt of project.gantt) {
        for (const item of gantt.pengawasan) {
            const status = normalize(item.status);
            if (["SELESAI", "CLOSED", "DONE", "SESUAI"].includes(status)) selesai++;
            else if (["TERLAMBAT", "LATE"].includes(status)) terlambat++;
            else progress++;
        }
    }
    return { selesai, progress, terlambat };
};

const latestApprovedExtension = (project: DashboardData) =>
    project.spk
        .flatMap((spk) => spk.pertambahan_spk)
        .filter((pt) => ["APPROVED", "DISETUJUI", "DISETUJUI BM"].includes(normalize(pt.status_persetujuan)))
        .sort((a, b) => (parseDashboardV2Date(b.created_at)?.getTime() ?? 0) - (parseDashboardV2Date(a.created_at)?.getTime() ?? 0))[0];

export const buildDashboardV2SummaryCards = (projects: DashboardData[]): DashboardV2Summary => {
    const stageCounts = new Map<string, number>();
    let attention = 0;
    let penawaran = 0;
    let totalDenda = 0;
    let dendaRows = 0;
    let spkAktif = 0;
    let rabApproved = 0;
    let rabOngoing = 0;
    let tambahHariCount = 0;
    let tambahHariTotal = 0;
    let pengawasanSelesai = 0;
    let pengawasanProgress = 0;
    let pengawasanTerlambat = 0;
    let ilApproved = 0;
    let ilOngoing = 0;
    let nilaiIl = 0;
    let ktkCount = 0;
    let stCount = 0;
    const cost = calculateDashboardV2CostMetrics(projects);

    for (const project of projects) {
        const stage = getDashboardV2Stage(project);
        stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
        if (isDashboardV2PastSla(project, stage)) attention++;
        const denda = getDashboardV2DendaInfo(project);
        if (denda.late_days > 0) dendaRows++;
        totalDenda += denda.amount;
        penawaran += getDashboardV2RabContractValue(project);
        if (project.rab[0] && normalize(project.rab[0].status) === "DISETUJUI") rabApproved++;
        else if (project.rab[0]) rabOngoing++;

        if (stage !== "Done") {
            spkAktif += getDashboardV2ApprovedSpks(project).length;
        }

        if (stage === "Kerja Tambah Kurang") ktkCount++;
        if (project.berkas_serah_terima.some((st) => String(st.link_pdf || "").trim())) stCount++;

        for (const spk of project.spk) {
            for (const pt of spk.pertambahan_spk) {
                if (pt.link_pdf || pt.created_at) {
                    tambahHariCount++;
                    tambahHariTotal += Number(pt.pertambahan_hari || 0);
                }
            }
        }

        const counts = pengawasanCounts(project);
        pengawasanSelesai += counts.selesai;
        pengawasanProgress += counts.progress;
        pengawasanTerlambat += counts.terlambat;

        for (const il of project.instruksi_lapangan) {
            nilaiIl += parseDashboardV2Number(il.grand_total_final || il.grand_total);
            if (normalize(il.status) === "APPROVED" || normalize(il.status) === "DISETUJUI") ilApproved++;
            else ilOngoing++;
        }
    }

    return {
        generated_at: new Date().toISOString(),
        total_projects: projects.length,
        cards: [
            {
                type: "TOTAL_TOKO",
                title: "TOTAL TOKO",
                value: projects.length,
                subtitle: `Done: ${stageCounts.get("Done") || 0} · Ongoing: ${(stageCounts.get("Ongoing") || 0) + (stageCounts.get("Kerja Tambah Kurang") || 0)}`,
                tone: "blue",
                metrics: [metric("Done", stageCounts.get("Done") || 0, "green"), metric("Ongoing", stageCounts.get("Ongoing") || 0, "orange")]
            },
            {
                type: "SLA",
                title: "SLA PERHATIAN",
                value: attention,
                subtitle: `PJU: ${projects.filter((p) => getDashboardV2Stage(p) === "Proses PJU" && isDashboardV2PastSla(p)).length} · SPK: ${projects.filter((p) => getDashboardV2Stage(p) === "Approval SPK" && isDashboardV2PastSla(p)).length} · Ongoing: ${projects.filter((p) => getDashboardV2Stage(p) === "Ongoing" && isDashboardV2PastSla(p)).length}`,
                tone: "yellow",
                metrics: [metric("Lewat SLA", attention, "yellow")]
            },
            {
                type: "SPK_AKTIF",
                title: "SPK AKTIF",
                value: spkAktif,
                subtitle: "SPK approved/aktif dan belum serah terima",
                tone: "green",
                metrics: [metric("Aktif", spkAktif, "green")]
            },
            {
                type: "TOTAL_DENDA",
                title: "TOTAL DENDA",
                value: formatDashboardV2Rupiah(totalDenda),
                subtitle: `${dendaRows} ULOK melampaui batas waktu`,
                tone: "red",
                metrics: [metric("Terlambat", dendaRows, "red")]
            },
            {
                type: "NILAI_PENAWARAN",
                title: "NILAI PENAWARAN",
                value: formatDashboardV2Rupiah(penawaran),
                subtitle: "Grand total final RAB",
                tone: "blue",
                metrics: [metric("Disetujui", rabApproved, "green"), metric("Ongoing", rabOngoing, "orange")]
            },
            {
                type: "TAMBAH_HARI_SPK",
                title: "TAMBAH HARI SPK",
                value: tambahHariCount ? formatDashboardV2Days(Math.round(tambahHariTotal / tambahHariCount)) : "0 hari",
                subtitle: `${tambahHariCount} dokumen tambah hari SPK`,
                tone: "blue",
                metrics: [metric("Jumlah", tambahHariCount, "blue")]
            },
            {
                type: "ITEM_PENGAWASAN",
                title: "ITEM PENGAWASAN",
                value: pengawasanSelesai + pengawasanProgress + pengawasanTerlambat,
                subtitle: `Selesai: ${pengawasanSelesai} · Progress: ${pengawasanProgress} · Terlambat: ${pengawasanTerlambat}`,
                tone: "purple",
                metrics: [metric("Selesai", pengawasanSelesai, "green"), metric("Progress", pengawasanProgress, "blue"), metric("Terlambat", pengawasanTerlambat, "red")]
            },
            {
                type: "INSTRUKSI_LAPANGAN",
                title: "INSTRUKSI LAPANGAN",
                value: formatDashboardV2Rupiah(nilaiIl),
                subtitle: `Approved: ${ilApproved} · Ongoing: ${ilOngoing}`,
                tone: "orange",
                metrics: [metric("Approved", ilApproved, "green"), metric("Ongoing", ilOngoing, "orange")]
            },
            {
                type: "KERJA_TAMBAH_KURANG",
                title: "KERJA TAMBAH KURANG",
                value: ktkCount,
                subtitle: "Sudah melewati proses KTK/approval kontraktor",
                tone: "purple",
                metrics: [metric("KTK", ktkCount, "purple")]
            },
            {
                type: "SERAH_TERIMA",
                title: "SERAH TERIMA",
                value: stCount,
                subtitle: "Dokumen serah terima tersedia",
                tone: "green",
                metrics: [metric("Done", stCount, "green")]
            },
            {
                type: "COST_M2_BANGUNAN",
                title: "COST/M2 BANGUNAN",
                value: formatDashboardV2Rupiah(cost.avgBangunan),
                subtitle: "Rata-rata bangunan/terbangun",
                tone: "green",
                metrics: [metric("ULOK", cost.countBangunan, "green")]
            },
            {
                type: "COST_M2_TERBUKA",
                title: "COST/M2 TERBUKA",
                value: formatDashboardV2Rupiah(cost.avgTerbuka),
                subtitle: "Rata-rata area terbuka",
                tone: "green",
                metrics: [metric("ULOK", cost.countTerbuka, "green")]
            }
        ]
    };
};

export const buildDashboardV2CardRows = (projects: DashboardData[], cardType: DashboardV2CardType): DashboardV2Row[] => {
    const rows = projects.flatMap((project) => {
        const stage = getDashboardV2Stage(project);
        if (cardType === "SLA" && !isDashboardV2PastSla(project, stage)) return [];
        if (cardType === "SPK_AKTIF" && !(getDashboardV2ApprovedSpks(project).length > 0 && stage === "Ongoing")) return [];
        if (cardType === "TOTAL_DENDA" && getDashboardV2DendaInfo(project).late_days <= 0) return [];
        if (cardType === "NILAI_PENAWARAN" && project.rab.length === 0) return [];
        if (cardType === "TAMBAH_HARI_SPK" && !project.spk.some((spk) => spk.pertambahan_spk.length > 0)) return [];
        if (cardType === "ITEM_PENGAWASAN" && !project.gantt.some((gantt) => gantt.pengawasan.length > 0)) return [];
        if (cardType === "INSTRUKSI_LAPANGAN" && project.instruksi_lapangan.length === 0) return [];
        if (cardType === "KERJA_TAMBAH_KURANG" && stage !== "Kerja Tambah Kurang") return [];
        if (cardType === "SERAH_TERIMA" && !project.berkas_serah_terima.some((st) => String(st.link_pdf || "").trim())) return [];
        if ((cardType === "COST_M2_BANGUNAN" || cardType === "COST_M2_TERBUKA") && project.rab.length === 0) return [];

        const valueLabel = valueForCard(project, cardType);
        const row = baseRow(project, cardType, valueLabel);
        row.status_label = statusForCard(project, cardType);
        row.metrics = metricsForCard(project, cardType);
        return [row];
    });

    if (cardType === "COST_M2_BANGUNAN" || cardType === "COST_M2_TERBUKA") {
        return aggregateCostRows(rows, cardType);
    }

    return rows.sort((a, b) => a.nama_toko.localeCompare(b.nama_toko, "id"));
};

const valueForCard = (project: DashboardData, cardType: DashboardV2CardType): string => {
    if (cardType === "TOTAL_DENDA") return formatDashboardV2Rupiah(getDashboardV2DendaInfo(project).amount);
    if (cardType === "NILAI_PENAWARAN") return formatDashboardV2Rupiah(getDashboardV2RabContractValue(project));
    if (cardType === "SPK_AKTIF") return formatDashboardV2Rupiah(getDashboardV2RabContractValue(project));
    if (cardType === "TAMBAH_HARI_SPK") return formatDashboardV2Days(latestApprovedExtension(project)?.pertambahan_hari || 0);
    if (cardType === "INSTRUKSI_LAPANGAN") return formatDashboardV2Rupiah(project.instruksi_lapangan.reduce((sum, il) => sum + parseDashboardV2Number(il.grand_total_final || il.grand_total), 0));
    if (cardType === "COST_M2_BANGUNAN") return formatDashboardV2Rupiah(costValue(project, "bangunan"));
    if (cardType === "COST_M2_TERBUKA") return formatDashboardV2Rupiah(costValue(project, "terbuka"));
    return getDashboardV2Stage(project);
};

const statusForCard = (project: DashboardData, cardType: DashboardV2CardType): string => {
    if (cardType === "NILAI_PENAWARAN") return displayDashboardV2Status(project.rab[0]?.status);
    if (cardType === "SPK_AKTIF") return "Aktif";
    if (cardType === "TAMBAH_HARI_SPK") return displayDashboardV2Status(latestApprovedExtension(project)?.status_persetujuan);
    if (cardType === "TOTAL_DENDA") return "Terlambat";
    return displayDashboardV2Status(getDashboardV2Stage(project));
};

const metricsForCard = (project: DashboardData, cardType: DashboardV2CardType): DashboardV2Metric[] => {
    if (cardType === "TOTAL_DENDA") {
        const denda = getDashboardV2DendaInfo(project);
        return [
            metric("Terlambat", formatDashboardV2Days(denda.late_days), "red"),
            metric("Target ST", denda.target_st_label, "yellow"),
            metric("Tanggal ST", denda.actual_st_label, "green")
        ];
    }
    if (cardType === "TAMBAH_HARI_SPK") {
        const pt = latestApprovedExtension(project);
        return [
            metric("Akhir SPK", formatDashboardV2Date(pt?.tanggal_spk_akhir), "neutral"),
            metric("Setelah Perpanjangan", formatDashboardV2Date(pt?.tanggal_spk_akhir_setelah_perpanjangan), "blue")
        ];
    }
    if (cardType === "ITEM_PENGAWASAN") {
        const counts = pengawasanCounts(project);
        return [metric("Selesai", counts.selesai, "green"), metric("Progress", counts.progress, "blue"), metric("Terlambat", counts.terlambat, "red")];
    }
    return [metric("Lingkup", plain(project.toko.lingkup_pekerjaan), "neutral")];
};

export const buildDashboardV2TimelineNodes = (project: DashboardData): DashboardV2Timeline => ({
    toko_id: project.toko.id,
    nomor_ulok: plain(project.toko.nomor_ulok),
    nama_toko: plain(project.toko.nama_toko),
    cabang: plain(project.toko.cabang),
    lingkup_pekerjaan: plain(project.toko.lingkup_pekerjaan),
    nodes: [
        ...project.rab.map((rab): DashboardV2TimelineNode => ({
            id: `RAB-${rab.id}`,
            type: "RAB",
            title: "RAB",
            subtitle: plain(rab.no_sph),
            status_label: displayDashboardV2Status(rab.status),
            date_label: formatDashboardV2Date(rab.created_at),
            value_label: formatDashboardV2Rupiah(rab.grand_total_final),
            pdf_url: rab.link_pdf_gabungan || rab.link_pdf_rekapitulasi || rab.link_pdf_non_sbo,
            raw_id: rab.id
        })),
        ...project.gantt.map((gantt): DashboardV2TimelineNode => ({
            id: `GANTT-${gantt.id}`,
            type: "GANTT",
            title: "Gantt Chart",
            subtitle: `${gantt.day_items.length} hari`,
            status_label: displayDashboardV2Status(gantt.status),
            date_label: formatDashboardV2Date(gantt.timestamp),
            value_label: "-",
            pdf_url: null,
            raw_id: gantt.id
        })),
        ...project.spk.map((spk): DashboardV2TimelineNode => ({
            id: `SPK-${spk.id}`,
            type: "SPK",
            title: "SPK",
            subtitle: spk.nomor_spk || "-",
            status_label: displayDashboardV2Status(spk.status),
            date_label: formatDashboardV2Date(spk.created_at),
            value_label: formatDashboardV2Rupiah(getDashboardV2RabContractValue(project)),
            pdf_url: spk.link_pdf,
            raw_id: spk.id
        })),
        ...project.spk.flatMap((spk) => spk.pertambahan_spk.map((pt): DashboardV2TimelineNode => ({
            id: `TAMBAH_HARI_SPK-${pt.id}`,
            type: "TAMBAH_HARI_SPK",
            title: "Tambah Hari SPK",
            subtitle: spk.nomor_spk || "-",
            status_label: displayDashboardV2Status(pt.status_persetujuan),
            date_label: formatDashboardV2Date(pt.created_at),
            value_label: formatDashboardV2Days(pt.pertambahan_hari),
            pdf_url: pt.link_pdf,
            raw_id: pt.id
        }))),
        ...project.gantt.flatMap((gantt) => gantt.pengawasan_gantt.map((pw): DashboardV2TimelineNode => {
            const berkas = gantt.berkas_pengawasan.find((item) => item.id_pengawasan_gantt === pw.id);
            return {
                id: `PENGAWASAN-${pw.id}`,
                type: "PENGAWASAN",
                title: "Pengawasan",
                subtitle: `ID Gantt ${gantt.id}`,
                status_label: "Progress",
                date_label: formatDashboardV2Date(pw.tanggal_pengawasan),
                value_label: `${gantt.pengawasan.filter((item) => item.id_pengawasan_gantt === pw.id).length} item`,
                pdf_url: berkas?.link_pdf_pengawasan || null,
                raw_id: pw.id
            };
        })),
        ...project.instruksi_lapangan.map((il): DashboardV2TimelineNode => ({
            id: `INSTRUKSI_LAPANGAN-${il.id}`,
            type: "INSTRUKSI_LAPANGAN",
            title: "Instruksi Lapangan",
            subtitle: plain(il.email_pembuat),
            status_label: displayDashboardV2Status(il.status),
            date_label: formatDashboardV2Date(il.created_at),
            value_label: formatDashboardV2Rupiah(il.grand_total_final || il.grand_total),
            pdf_url: il.link_pdf_gabungan || il.link_pdf_rekapitulasi || il.link_pdf_non_sbo,
            raw_id: il.id
        })),
        ...project.opname_final.map((opname): DashboardV2TimelineNode => ({
            id: `OPNAME_FINAL-${opname.id}`,
            type: normalize(opname.tipe_opname).includes("PARSIAL") ? "OPNAME_PARSIAL" : "OPNAME_FINAL",
            title: normalize(opname.tipe_opname).includes("PARSIAL") ? "Opname Parsial" : "Opname Final",
            subtitle: plain(opname.aksi),
            status_label: displayDashboardV2Status(opname.status_opname_final),
            date_label: formatDashboardV2Date(opname.created_at),
            value_label: formatDashboardV2Rupiah(opname.grand_total_final || opname.grand_total_opname),
            pdf_url: opname.link_pdf_opname,
            raw_id: opname.id
        })),
        ...project.berkas_serah_terima.map((st): DashboardV2TimelineNode => ({
            id: `SERAH_TERIMA-${st.id}`,
            type: "SERAH_TERIMA",
            title: "Serah Terima",
            subtitle: "Dokumen serah terima",
            status_label: "Selesai",
            date_label: formatDashboardV2Date(st.created_at),
            value_label: "-",
            pdf_url: st.link_pdf,
            raw_id: st.id
        }))
    ].sort((a, b) => {
        const at = parseDashboardV2Date(a.date_label)?.getTime() ?? 0;
        const bt = parseDashboardV2Date(b.date_label)?.getTime() ?? 0;
        return at - bt;
    })
});

export const buildDashboardV2Detail = (project: DashboardData, documentType: DashboardV2DocumentType, rawId: number): DashboardV2Detail => {
    if (documentType === "RAB") {
        const rab = project.rab.find((item) => item.id === rawId) || project.rab[0];
        return {
            title: "Detail RAB",
            subtitle: `${plain(project.toko.nama_toko)} · ${plain(project.toko.lingkup_pekerjaan)}`,
            type: "RAB",
            status_label: displayDashboardV2Status(rab?.status),
            pdf_url: rab?.link_pdf_gabungan || rab?.link_pdf_rekapitulasi || rab?.link_pdf_non_sbo || null,
            fields: [
                { label: "Nilai Kontrak", value: formatDashboardV2Rupiah(rab?.grand_total_final) },
                { label: "Dibuat", value: formatDashboardV2Date(rab?.created_at) },
                { label: "Approval Manager", value: formatDashboardV2ApproverTime(rab?.pemberi_persetujuan_manager, rab?.waktu_persetujuan_manager) },
                { label: "Approval Koordinator", value: formatDashboardV2ApproverTime(rab?.pemberi_persetujuan_koordinator, rab?.waktu_persetujuan_koordinator) },
                { label: "Approval Direktur", value: formatDashboardV2ApproverTime(rab?.pemberi_persetujuan_direktur, rab?.waktu_persetujuan_direktur) },
                { label: "Berlaku Polis", value: formatDashboardV2Date(rab?.berlaku_polis) },
                { label: "Luas Bangunan", value: formatDashboardV2Area(rab?.luas_bangunan) },
                { label: "Luas Terbangun", value: formatDashboardV2Area(rab?.luas_terbangun) },
                { label: "Luas Area Terbuka", value: formatDashboardV2Area(rab?.luas_area_terbuka) },
                { label: "Luas Area Parkir", value: formatDashboardV2Area(rab?.luas_area_parkir) },
                { label: "Luas Area Sales", value: formatDashboardV2Area(rab?.luas_area_sales) },
                { label: "Luas Gudang", value: formatDashboardV2Area(rab?.luas_gudang) },
                { label: "Durasi Pekerjaan", value: formatDashboardV2Days(rab?.durasi_pekerjaan) }
            ],
            items: (rab?.items || []).map((item) => ({
                kategori: item.kategori_pekerjaan,
                pekerjaan: item.jenis_pekerjaan,
                volume: item.volume,
                satuan: item.satuan,
                total: formatDashboardV2Rupiah(item.total_harga)
            }))
        };
    }

    if (documentType === "SPK") {
        const spk = project.spk.find((item) => item.id === rawId) || project.spk[0];
        return {
            title: "Detail SPK",
            subtitle: `${plain(spk?.nomor_spk)} · ${plain(project.toko.lingkup_pekerjaan)}`,
            type: "SPK",
            status_label: displayDashboardV2Status(spk?.status),
            pdf_url: spk?.link_pdf || null,
            fields: [
                { label: "Nilai Kontrak RAB", value: formatDashboardV2Rupiah(getDashboardV2RabContractValue(project)) },
                { label: "Nomor SPK", value: plain(spk?.nomor_spk) },
                { label: "Waktu Mulai", value: formatDashboardV2Date(spk?.waktu_mulai) },
                { label: "Waktu Selesai", value: formatDashboardV2Date(spk?.waktu_selesai) },
                { label: "Durasi", value: formatDashboardV2Days(spk?.durasi) },
                { label: "Approval", value: formatDashboardV2ApproverTime(spk?.approver_email, spk?.waktu_persetujuan) }
            ],
            items: (spk?.approval_logs || []).map((log) => ({
                approver: log.approver_email,
                tindakan: log.tindakan,
                waktu: formatDashboardV2DateTime(log.waktu_tindakan)
            }))
        };
    }

    if (documentType === "TAMBAH_HARI_SPK") {
        const pt = project.spk.flatMap((spk) => spk.pertambahan_spk).find((item) => item.id === rawId);
        return {
            title: "Detail Tambah Hari SPK",
            subtitle: plain(pt?.alasan_perpanjangan),
            type: "TAMBAH_HARI_SPK",
            status_label: displayDashboardV2Status(pt?.status_persetujuan),
            pdf_url: pt?.link_pdf || null,
            fields: [
                { label: "Pertambahan Hari", value: formatDashboardV2Days(pt?.pertambahan_hari) },
                { label: "Tanggal Akhir SPK", value: formatDashboardV2Date(pt?.tanggal_spk_akhir) },
                { label: "Tanggal Akhir SPK Setelah Perpanjangan", value: formatDashboardV2Date(pt?.tanggal_spk_akhir_setelah_perpanjangan) },
                { label: "Dibuat Oleh", value: plain(pt?.dibuat_oleh) },
                { label: "Approval", value: formatDashboardV2ApproverTime(pt?.disetujui_oleh, pt?.waktu_persetujuan) }
            ],
            items: []
        };
    }

    if (documentType === "PENGAWASAN") {
        const gantt = project.gantt.find((item) => item.pengawasan_gantt.some((pw) => pw.id === rawId));
        const pw = gantt?.pengawasan_gantt.find((item) => item.id === rawId);
        const berkas = gantt?.berkas_pengawasan.find((item) => item.id_pengawasan_gantt === rawId);
        const items = gantt?.pengawasan.filter((item) => item.id_pengawasan_gantt === rawId) || [];
        return {
            title: "Detail Pengawasan",
            subtitle: `${items.length} item pengawasan`,
            type: "PENGAWASAN",
            status_label: "Progress",
            pdf_url: berkas?.link_pdf_pengawasan || null,
            fields: [
                { label: "Tanggal Dibuat", value: formatDashboardV2Date(berkas?.created_at || items[0]?.created_at) },
                { label: "ID Gantt", value: String(gantt?.id || "-") },
                { label: "ID Pengawasan Gantt", value: String(pw?.id || "-") },
                { label: "Tanggal Pengawasan", value: formatDashboardV2Date(pw?.tanggal_pengawasan) }
            ],
            items: items.map((item) => ({
                kategori: item.kategori_pekerjaan,
                pekerjaan: item.jenis_pekerjaan,
                status: displayDashboardV2Status(item.status),
                catatan: item.catatan
            }))
        };
    }

    if (documentType === "INSTRUKSI_LAPANGAN") {
        const il = project.instruksi_lapangan.find((item) => item.id === rawId) || project.instruksi_lapangan[0];
        return {
            title: "Detail Instruksi Lapangan",
            subtitle: plain(project.toko.nama_toko),
            type: "INSTRUKSI_LAPANGAN",
            status_label: displayDashboardV2Status(il?.status),
            pdf_url: il?.link_pdf_gabungan || il?.link_pdf_rekapitulasi || il?.link_pdf_non_sbo || null,
            fields: [
                { label: "Nilai Instruksi", value: formatDashboardV2Rupiah(il?.grand_total_final || il?.grand_total) },
                { label: "Dibuat", value: formatDashboardV2Date(il?.created_at) },
                { label: "Approval Koordinator", value: formatDashboardV2ApproverTime(il?.pemberi_persetujuan_koordinator, il?.waktu_persetujuan_koordinator) },
                { label: "Approval Manager", value: formatDashboardV2ApproverTime(il?.pemberi_persetujuan_manager, il?.waktu_persetujuan_manager) },
                { label: "Approval Kontraktor", value: formatDashboardV2ApproverTime(il?.pemberi_persetujuan_kontraktor, il?.waktu_persetujuan_kontraktor) }
            ],
            items: (il?.items || []).map((item) => ({
                kategori: item.kategori_pekerjaan,
                pekerjaan: item.jenis_pekerjaan,
                volume: item.volume,
                total: formatDashboardV2Rupiah(item.total_harga)
            }))
        };
    }

    if (documentType === "SERAH_TERIMA") {
        const st = project.berkas_serah_terima.find((item) => item.id === rawId) || project.berkas_serah_terima[0];
        return {
            title: "Detail Serah Terima",
            subtitle: plain(project.toko.nama_toko),
            type: "SERAH_TERIMA",
            status_label: "Selesai",
            pdf_url: st?.link_pdf || null,
            fields: [
                { label: "Tanggal Serah Terima", value: formatDashboardV2Date(st?.created_at) },
                { label: "Nomor ULOK", value: plain(project.toko.nomor_ulok) },
                { label: "Lingkup", value: plain(project.toko.lingkup_pekerjaan) }
            ],
            items: []
        };
    }

    const opname = project.opname_final.find((item) => item.id === rawId) || project.opname_final[0];
    return {
        title: documentType === "OPNAME_PARSIAL" ? "Detail Opname Parsial" : "Detail Opname Final",
        subtitle: plain(project.toko.nama_toko),
        type: documentType,
        status_label: displayDashboardV2Status(opname?.status_opname_final),
        pdf_url: opname?.link_pdf_opname || null,
        fields: [
            { label: "Grand Total Opname", value: formatDashboardV2Rupiah(opname?.grand_total_final || opname?.grand_total_opname) },
            { label: "Tanggal Akhir SPK", value: formatDashboardV2Date(opname?.tanggal_akhir_spk_denda) },
            { label: "Tanggal Serah Terima", value: formatDashboardV2Date(opname?.tanggal_serah_terima_denda) },
            { label: "Denda", value: formatDashboardV2Rupiah(opname?.nilai_denda) },
            { label: "Hari Denda", value: formatDashboardV2Days(opname?.hari_denda) },
            { label: "Approval Direktur", value: formatDashboardV2ApproverTime(opname?.pemberi_persetujuan_direktur, opname?.waktu_persetujuan_direktur) }
        ],
        items: (opname?.items || []).map((item) => ({
            kategori: item.kategori_pekerjaan,
            pekerjaan: item.jenis_pekerjaan,
            status: displayDashboardV2Status(item.status),
            total: formatDashboardV2Rupiah(item.total_harga_opname)
        }))
    };
};

const costValue = (project: DashboardData, kind: "bangunan" | "terbuka"): number => {
    const rab = project.rab[0];
    if (!rab) return 0;
    const total = kind === "terbuka" ? parseDashboardV2Number(rab.cost_terbuka) : parseDashboardV2Number(rab.cost_bangunan);
    const luas = kind === "terbuka"
        ? parseDashboardV2Number(rab.luas_area_terbuka)
        : (parseDashboardV2Number(rab.luas_terbangun) || parseDashboardV2Number(rab.luas_bangunan));
    return luas > 0 ? Math.round(total / luas) : 0;
};

const calculateDashboardV2CostMetrics = (projects: DashboardData[]) => {
    const groups = groupByUlok(projects);
    let sumBangunan = 0;
    let countBangunan = 0;
    let sumTerbuka = 0;
    let countTerbuka = 0;
    for (const group of groups.values()) {
        const bangunan = average(group.map((project) => costValue(project, "bangunan")).filter((value) => value > 0));
        const terbuka = average(group.map((project) => costValue(project, "terbuka")).filter((value) => value > 0));
        if (bangunan > 0) {
            sumBangunan += bangunan;
            countBangunan++;
        }
        if (terbuka > 0) {
            sumTerbuka += terbuka;
            countTerbuka++;
        }
    }
    return {
        avgBangunan: countBangunan ? Math.round(sumBangunan / countBangunan) : 0,
        countBangunan,
        avgTerbuka: countTerbuka ? Math.round(sumTerbuka / countTerbuka) : 0,
        countTerbuka
    };
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const groupByUlok = (projects: DashboardData[]) => {
    const map = new Map<string, DashboardData[]>();
    for (const project of projects) {
        const key = normalize(project.toko.nomor_ulok) || String(project.toko.id);
        const items = map.get(key) || [];
        items.push(project);
        map.set(key, items);
    }
    return map;
};

const aggregateCostRows = (rows: DashboardV2Row[], cardType: DashboardV2CardType): DashboardV2Row[] => {
    const map = new Map<string, DashboardV2Row[]>();
    for (const row of rows) {
        const items = map.get(normalize(row.nomor_ulok)) || [];
        items.push(row);
        map.set(normalize(row.nomor_ulok), items);
    }
    return [...map.values()].map((items) => {
        const first = items[0];
        const values = items.map((row) => parseDashboardV2Number(row.value_label)).filter((value) => value > 0);
        return {
            ...first,
            key: `${cardType}-${first.nomor_ulok}`,
            lingkup_pekerjaan: items.map((row) => row.lingkup_pekerjaan).filter(Boolean).join(" + "),
            value_label: formatDashboardV2Rupiah(average(values)),
            metrics: [metric("Lingkup", items.map((row) => row.lingkup_pekerjaan).filter(Boolean).join(" + "), "green")]
        };
    });
};

export const buildDashboardV2CostRows = (projects: DashboardData[], kind: "bangunan" | "terbuka"): DashboardV2Row[] =>
    buildDashboardV2CardRows(projects, kind === "bangunan" ? "COST_M2_BANGUNAN" : "COST_M2_TERBUKA");

const periodStart = (period: DashboardV2Period, now = new Date()): Date | null => {
    if (period === "all") return null;
    const date = new Date(now);
    if (period === "1m") date.setMonth(date.getMonth() - 1);
    if (period === "3m") date.setMonth(date.getMonth() - 3);
    if (period === "6m") date.setMonth(date.getMonth() - 6);
    if (period === "1y") date.setFullYear(date.getFullYear() - 1);
    return date;
};

const monthLabel = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const incrementMonth = (map: Map<string, number>, value: unknown, amount = 1, minDate: Date | null = null) => {
    const date = parseDashboardV2Date(value);
    if (!date || (minDate && date < minDate)) return;
    const key = monthLabel(date);
    map.set(key, (map.get(key) || 0) + amount);
};

const chartFromMaps = (id: DashboardV2Chart["id"], title: string, maps: Array<{ label: string; map: Map<string, number>; kind: "count" | "currency" }>): DashboardV2Chart => {
    const labels = [...new Set(maps.flatMap((item) => [...item.map.keys()]))].sort();
    return {
        id,
        title,
        labels,
        datasets: maps.map((item) => ({
            label: item.label,
            data: labels.map((label) => item.map.get(label) || 0),
            kind: item.kind
        }))
    };
};

export const buildDashboardV2Charts = (projects: DashboardData[], period: DashboardV2Period): DashboardV2Charts => {
    const minDate = periodStart(period);
    const rabCreated = new Map<string, number>();
    const rabApproved = new Map<string, number>();
    const spkCreated = new Map<string, number>();
    const spkApproved = new Map<string, number>();
    const stCreated = new Map<string, number>();
    let nilaiSpk = 0;
    let nilaiOpname = 0;

    for (const project of projects) {
        for (const rab of project.rab) {
            incrementMonth(rabCreated, rab.created_at, 1, minDate);
            if (normalize(rab.status) === "DISETUJUI") incrementMonth(rabApproved, rab.waktu_persetujuan_manager || rab.created_at, 1, minDate);
        }
        for (const spk of project.spk) {
            incrementMonth(spkCreated, spk.created_at, 1, minDate);
            if (isDashboardV2ApprovedSpkStatus(spk.status)) {
                incrementMonth(spkApproved, spk.waktu_persetujuan || spk.created_at, 1, minDate);
                nilaiSpk += parseDashboardV2Number(spk.grand_total);
            }
        }
        for (const st of project.berkas_serah_terima) {
            if (st.link_pdf) incrementMonth(stCreated, st.created_at, 1, minDate);
        }
        for (const opname of project.opname_final) {
            nilaiOpname += parseDashboardV2Number(opname.grand_total_final || opname.grand_total_opname);
        }
    }

    return {
        period,
        charts: [
            chartFromMaps("rab", "RAB Dibuat vs RAB Approved", [
                { label: "RAB Dibuat", map: rabCreated, kind: "count" },
                { label: "RAB Approved", map: rabApproved, kind: "count" }
            ]),
            chartFromMaps("spk", "SPK Dibuat vs SPK Approved", [
                { label: "SPK Dibuat", map: spkCreated, kind: "count" },
                { label: "SPK Approved", map: spkApproved, kind: "count" }
            ]),
            chartFromMaps("release_st", "SPK Release vs Serah Terima", [
                { label: "SPK Release", map: spkApproved, kind: "count" },
                { label: "Serah Terima", map: stCreated, kind: "count" }
            ]),
            {
                id: "spk_vs_opname",
                title: "Nilai SPK vs Grand Opname Final",
                labels: ["Nominal"],
                datasets: [
                    { label: "Nilai SPK", data: [nilaiSpk], kind: "currency" },
                    { label: "Grand Opname Final", data: [nilaiOpname], kind: "currency" }
                ]
            }
        ]
    };
};
