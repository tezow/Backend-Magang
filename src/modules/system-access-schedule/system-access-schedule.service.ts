import { AppError } from "../../common/app-error";
import type { AuthenticatedUser } from "../auth/auth-session.service";
import {
    systemAccessScheduleRepository,
    type SystemAccessScheduleRow,
    type UpdateSystemAccessScheduleInput,
} from "./system-access-schedule.repository";

const normalizeText = (value: unknown): string =>
    String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export const canManageSystemControls = (user?: AuthenticatedUser | null): boolean =>
    Boolean(user?.roles.some((role) => normalizeText(role).includes("SUPER HUMAN")));

const SCHEDULE_CACHE_MS = 60_000;
let cachedSchedule: { data: SystemAccessScheduleRow; expiresAt: number } | null = null;

const fallbackSchedule = (): SystemAccessScheduleRow => ({
    id: 1,
    is_enabled: true,
    weekday_enabled: true,
    weekend_enabled: false,
    general_start_minutes: 360,
    general_end_minutes: 1440,
    contractor_start_minutes: 360,
    contractor_end_minutes: 1440,
    updated_by_email: null,
    updated_by_role: null,
    updated_at: new Date().toISOString(),
});

export const systemAccessScheduleService = {
    ensureSchema: () => systemAccessScheduleRepository.ensureSchema(),

    async getSchedule(): Promise<SystemAccessScheduleRow> {
        const now = Date.now();
        if (cachedSchedule && cachedSchedule.expiresAt > now) {
            return cachedSchedule.data;
        }

        try {
            const data = await systemAccessScheduleRepository.getSchedule();
            cachedSchedule = { data, expiresAt: now + SCHEDULE_CACHE_MS };
            return data;
        } catch (error) {
            console.warn("[system-access-schedule] Gagal membaca jadwal, memakai fallback cache/default:", error);
            return cachedSchedule?.data ?? fallbackSchedule();
        }
    },

    async updateSchedule(input: Omit<UpdateSystemAccessScheduleInput, "actor_email" | "actor_role"> & { actor?: AuthenticatedUser | null }): Promise<SystemAccessScheduleRow> {
        if (!canManageSystemControls(input.actor)) {
            throw new AppError("Anda tidak memiliki akses untuk mengubah jadwal akses aplikasi.", 403);
        }

        // Validasi: minimal satu hari harus diaktifkan jika schedule enabled
        if (input.is_enabled && !input.weekday_enabled && !input.weekend_enabled) {
            throw new AppError("Minimal satu hari akses harus diaktifkan jika jadwal akses diaktifkan.", 400);
        }

        // Validasi: jam mulai harus lebih kecil dari jam selesai (kecuali end = 1440)
        if (input.general_start_minutes >= input.general_end_minutes && input.general_end_minutes !== 1440) {
            throw new AppError("Jam mulai akses umum harus lebih kecil dari jam selesai.", 400);
        }
        if (input.contractor_start_minutes >= input.contractor_end_minutes && input.contractor_end_minutes !== 1440) {
            throw new AppError("Jam mulai akses kontraktor harus lebih kecil dari jam selesai.", 400);
        }

        // Validasi: rentang menit harus 0-1440
        const minutes = [
            input.general_start_minutes,
            input.general_end_minutes,
            input.contractor_start_minutes,
            input.contractor_end_minutes,
        ];
        if (minutes.some((m) => m < 0 || m > 1440)) {
            throw new AppError("Rentang jam akses harus antara 00:00 sampai 24:00.", 400);
        }

        const data = await systemAccessScheduleRepository.updateSchedule({
            is_enabled: input.is_enabled,
            weekday_enabled: input.weekday_enabled,
            weekend_enabled: input.weekend_enabled,
            general_start_minutes: input.general_start_minutes,
            general_end_minutes: input.general_end_minutes,
            contractor_start_minutes: input.contractor_start_minutes,
            contractor_end_minutes: input.contractor_end_minutes,
            actor_email: input.actor?.email_sat ?? null,
            actor_role: input.actor?.jabatan ?? input.actor?.roles.join(", ") ?? null,
        });
        cachedSchedule = { data, expiresAt: Date.now() + SCHEDULE_CACHE_MS };
        return data;
    },
};
