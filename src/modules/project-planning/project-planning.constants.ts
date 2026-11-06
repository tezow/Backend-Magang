// ============================================================
// STATUS CONSTANTS — Project Planning State Machine
// ============================================================

export const PP_STATUS = {
    DRAFT: "DRAFT",
    WAITING_BM_APPROVAL: "WAITING_BM_APPROVAL",
    WAITING_PP_APPROVAL_1: "WAITING_PP_APPROVAL_1",
    PP_DESIGN_3D_REQUIRED: "PP_DESIGN_3D_REQUIRED",
    WAITING_RAB_UPLOAD: "WAITING_RAB_UPLOAD",
    WAITING_BM_APPROVAL_2: "WAITING_BM_APPROVAL_2",
    WAITING_BM_REGIONAL_APPROVAL: "WAITING_BM_REGIONAL_APPROVAL",
    WAITING_PP_MANAGER_APPROVAL: "WAITING_PP_MANAGER_APPROVAL",
    WAITING_PP_APPROVAL_2: "WAITING_PP_APPROVAL_2",
    COMPLETED: "COMPLETED",
    REJECTED: "REJECTED",
} as const;

export type PpStatus = (typeof PP_STATUS)[keyof typeof PP_STATUS];

// Status yang dianggap "aktif" (tidak bisa disubmit ulang kecuali DRAFT/REJECTED)
export const ACTIVE_PP_STATUSES: PpStatus[] = [
    PP_STATUS.WAITING_BM_APPROVAL,
    PP_STATUS.WAITING_PP_APPROVAL_1,
    PP_STATUS.PP_DESIGN_3D_REQUIRED,
    PP_STATUS.WAITING_RAB_UPLOAD,
    PP_STATUS.WAITING_BM_APPROVAL_2,
    PP_STATUS.WAITING_BM_REGIONAL_APPROVAL,
    PP_STATUS.WAITING_PP_MANAGER_APPROVAL,
    PP_STATUS.WAITING_PP_APPROVAL_2,
    PP_STATUS.COMPLETED,
];

// ============================================================
// ROLE CONSTANTS
// ============================================================

export const PP_ROLE = {
    COORDINATOR: "COORDINATOR",
    BM: "BM",
    BM_REGIONAL: "BM_REGIONAL",
    PP_SPECIALIST: "PP_SPECIALIST",
    PP_MANAGER: "PP_MANAGER",
    SUPER_HUMAN: "SUPER_HUMAN",
} as const;

export type PpRole = (typeof PP_ROLE)[keyof typeof PP_ROLE];

// ============================================================
// AKSI CONSTANTS
// ============================================================

export const PP_AKSI = {
    SUBMIT: "SUBMIT",
    APPROVE: "APPROVE",
    REJECT: "REJECT",
    UPLOAD_3D: "UPLOAD_3D",
    UPLOAD_RAB: "UPLOAD_RAB",
    COMPLETE: "COMPLETE",
    INTERVENTION: "INTERVENTION",
} as const;

export type PpAksi = (typeof PP_AKSI)[keyof typeof PP_AKSI];

// ============================================================
// LABEL STATUS (untuk keperluan display / notifikasi)
// ============================================================

export const PP_STATUS_LABEL: Record<PpStatus, string> = {
    DRAFT: "Draft - Menunggu Pengajuan",
    WAITING_BM_APPROVAL: "Menunggu Persetujuan B&M Manager",
    WAITING_PP_APPROVAL_1: "Menunggu Persetujuan PP (Tahap 1)",
    PP_DESIGN_3D_REQUIRED: "Menunggu Upload Desain 3D oleh PP",
    WAITING_RAB_UPLOAD: "Menunggu Input RAB Sparta, Fasilitas & Gambar Final oleh Cabang",
    WAITING_BM_APPROVAL_2: "Menunggu Persetujuan B&M Manager Tahap 2",
    WAITING_BM_REGIONAL_APPROVAL: "Menunggu Persetujuan B&M Regional Manager",
    WAITING_PP_MANAGER_APPROVAL: "Menunggu Persetujuan PP Manager",
    WAITING_PP_APPROVAL_2: "Menunggu Persetujuan PP (Final)",
    COMPLETED: "Selesai - FPD Telah Disetujui",
    REJECTED: "Ditolak",
};

// ============================================================
// JENIS PENGAJUAN DESIGN
// ============================================================

export const JENIS_PENGAJUAN = [
    "DRIVE THRU",
    "BEAN SPOT",
    "FASADE",
    "LAINNYA",
] as const;

export type JenisPengajuan = (typeof JENIS_PENGAJUAN)[number];
