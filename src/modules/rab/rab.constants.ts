export const RAB_STATUS = {
    WAITING_FOR_GANTT: "Menunggu Gantt Chart",
    WAITING_FOR_DIREKTUR: "Menunggu Persetujuan Direktur Kontraktor",
    WAITING_FOR_COORDINATOR: "Menunggu Persetujuan Koordinator",
    WAITING_FOR_MANAGER: "Menunggu Persetujuan Manajer",
    APPROVED: "Disetujui",
    REJECTED_BY_COORDINATOR: "Ditolak oleh Koordinator",
    REJECTED_BY_MANAGER: "Ditolak oleh Manajer",
    REJECTED_BY_DIREKTUR: "Ditolak oleh Direktur Kontraktor"
} as const;

export type RabStatus = (typeof RAB_STATUS)[keyof typeof RAB_STATUS];

export const ACTIVE_RAB_STATUSES: RabStatus[] = [
    RAB_STATUS.WAITING_FOR_GANTT,
    RAB_STATUS.WAITING_FOR_DIREKTUR,
    RAB_STATUS.WAITING_FOR_COORDINATOR,
    RAB_STATUS.WAITING_FOR_MANAGER,
    RAB_STATUS.APPROVED
];

export const REJECTED_RAB_STATUSES: RabStatus[] = [
    RAB_STATUS.REJECTED_BY_DIREKTUR,
    RAB_STATUS.REJECTED_BY_COORDINATOR,
    RAB_STATUS.REJECTED_BY_MANAGER
];
