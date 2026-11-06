const MONTHS_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const normalize = (value: unknown): string => String(value ?? "").trim();

export const parseDashboardV2Date = (value: unknown): Date | null => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = normalize(value);
    if (!raw) return null;

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (iso) {
        return new Date(
            Number(iso[1]),
            Number(iso[2]) - 1,
            Number(iso[3]),
            iso[4] ? Number(iso[4]) : 0,
            iso[5] ? Number(iso[5]) : 0
        );
    }

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

export const formatDashboardV2Date = (value: unknown): string => {
    const date = parseDashboardV2Date(value);
    if (!date) return "-";
    return `${date.getDate()} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
};

export const formatDashboardV2DateTime = (value: unknown): string => {
    const date = parseDashboardV2Date(value);
    if (!date) return "-";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${formatDashboardV2Date(date)} pukul ${hours}:${minutes}`;
};

export const formatDashboardV2ApproverTime = (email: unknown, time: unknown): string => {
    const who = normalize(email);
    const when = formatDashboardV2DateTime(time);
    if (!who && when === "-") return "-";
    if (!who) return when;
    if (when === "-") return who;
    return `${who} / ${when}`;
};

export const parseDashboardV2Number = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = normalize(value)
        .replace(/^Rp\s*/i, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const formatDashboardV2Rupiah = (value: unknown): string => {
    const amount = parseDashboardV2Number(value);
    return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
};

export const formatDashboardV2Area = (value: unknown): string => {
    const amount = parseDashboardV2Number(value);
    if (amount <= 0) return "0 m2";
    return `${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m2`;
};

export const formatDashboardV2Days = (value: unknown): string => {
    const amount = parseDashboardV2Number(value);
    return `${Math.max(0, Math.round(amount))} hari`;
};

export const displayDashboardV2Status = (value: unknown): string => {
    const status = normalize(value).toUpperCase();
    if (!status) return "-";
    if (["DISETUJUI", "APPROVED", "SPK_APPROVED"].includes(status)) return "Approved";
    if (["AKTIF", "ACTIVE"].includes(status)) return "Aktif";
    if (["WAITING_FOR_BM_APPROVAL", "MENUNGGU_PERSETUJUAN", "PENDING", "WAITING_MANAGER"].includes(status)) {
        return "Menunggu Persetujuan";
    }
    if (["REJECTED", "REJECT", "DITOLAK"].includes(status)) return "Ditolak";
    if (["CANCELLED", "CANCEL", "DIBATALKAN"].includes(status)) return "Dibatalkan";
    if (["PROGRESS", "ONGOING", "PROSES"].includes(status)) return "Progress";
    if (["PROSES KTK", "PROSES_KTK"].includes(status)) return "Proses KTK";
    if (["APPROVAL KONTRAKTOR", "APPROVAL_KONTRAKTOR"].includes(status)) return "Approval Kontraktor";
    return status
        .toLowerCase()
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};
