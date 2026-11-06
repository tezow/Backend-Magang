import { AppError } from "../../common/app-error";
import type { AuthenticatedUser } from "../auth/auth-session.service";
import {
    SYSTEM_MAINTENANCE_TEMPLATE,
    systemMaintenanceRepository,
    type SystemMaintenanceRow,
} from "./system-maintenance.repository";

const normalizeText = (value: unknown): string =>
    String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export const canManageSystemMaintenance = (user?: AuthenticatedUser | null): boolean =>
    Boolean(user?.roles.some((role) => normalizeText(role).includes("SUPER HUMAN")));

const STATUS_CACHE_MS = 60_000;
let cachedStatus: { data: SystemMaintenanceRow; expiresAt: number } | null = null;

const fallbackStatus = (): SystemMaintenanceRow => ({
    id: 1,
    is_active: false,
    title: SYSTEM_MAINTENANCE_TEMPLATE.title,
    message: SYSTEM_MAINTENANCE_TEMPLATE.message,
    started_at: null,
    ended_at: null,
    updated_by_email: null,
    updated_by_role: null,
    updated_at: new Date().toISOString(),
});

export const systemMaintenanceService = {
    ensureSchema: () => systemMaintenanceRepository.ensureSchema(),

    async getStatus(): Promise<SystemMaintenanceRow> {
        const now = Date.now();
        if (cachedStatus && cachedStatus.expiresAt > now) {
            return cachedStatus.data;
        }

        try {
            const data = await systemMaintenanceRepository.getStatus();
            cachedStatus = { data, expiresAt: now + STATUS_CACHE_MS };
            return data;
        } catch (error) {
            console.warn("[system-maintenance] Gagal membaca status, memakai fallback cache/default:", error);
            return cachedStatus?.data ?? fallbackStatus();
        }
    },

    async setActive(input: { is_active: boolean; actor?: AuthenticatedUser | null }): Promise<SystemMaintenanceRow> {
        if (!canManageSystemMaintenance(input.actor)) {
            throw new AppError("Anda tidak memiliki akses untuk mengubah status pemeliharaan sistem.", 403);
        }

        const data = await systemMaintenanceRepository.updateStatus({
            is_active: input.is_active,
            title: SYSTEM_MAINTENANCE_TEMPLATE.title,
            message: SYSTEM_MAINTENANCE_TEMPLATE.message,
            actor_email: input.actor?.email_sat ?? null,
            actor_role: input.actor?.jabatan ?? input.actor?.roles.join(", ") ?? null,
        });
        cachedStatus = { data, expiresAt: Date.now() + STATUS_CACHE_MS };
        return data;
    },
};
