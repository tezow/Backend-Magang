export const OPNAME_FINAL_STATUS = {
    WAITING_FOR_DIREKTUR: "Menunggu Persetujuan Direktur Kontraktor",
    WAITING_FOR_COORDINATOR: "Menunggu Persetujuan Koordinator",
    WAITING_FOR_MANAGER: "Menunggu Persetujuan Manajer",
    APPROVED: "Disetujui",
    REJECTED_BY_COORDINATOR: "Ditolak oleh Koordinator",
    REJECTED_BY_MANAGER: "Ditolak oleh Manajer",
    REJECTED_BY_DIREKTUR: "Ditolak oleh Direktur Kontraktor"
} as const;

export type OpnameFinalStatus = (typeof OPNAME_FINAL_STATUS)[keyof typeof OPNAME_FINAL_STATUS];

export const REJECTED_OPNAME_FINAL_STATUSES: OpnameFinalStatus[] = [
    OPNAME_FINAL_STATUS.REJECTED_BY_DIREKTUR,
    OPNAME_FINAL_STATUS.REJECTED_BY_COORDINATOR,
    OPNAME_FINAL_STATUS.REJECTED_BY_MANAGER
];
