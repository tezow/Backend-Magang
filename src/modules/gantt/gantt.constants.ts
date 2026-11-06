export const GANTT_STATUS = {
    ACTIVE: "active",
    TERKUNCI: "terkunci"
} as const;

export type GanttStatus = (typeof GANTT_STATUS)[keyof typeof GANTT_STATUS];

export const ALL_GANTT_STATUSES: GanttStatus[] = [
    GANTT_STATUS.ACTIVE,
    GANTT_STATUS.TERKUNCI
];
