import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler";
import { canManageSystemControls, systemAccessScheduleService } from "./system-access-schedule.service";

const updateSystemAccessScheduleSchema = z.object({
    is_enabled: z.boolean(),
    weekday_enabled: z.boolean(),
    weekend_enabled: z.boolean(),
    general_start_minutes: z.number().int().min(0).max(1440),
    general_end_minutes: z.number().int().min(0).max(1440),
    contractor_start_minutes: z.number().int().min(0).max(1440),
    contractor_end_minutes: z.number().int().min(0).max(1440),
});

export const getSystemAccessSchedule = asyncHandler(async (req: Request, res: Response) => {
    const data = await systemAccessScheduleService.getSchedule();
    res.json({
        status: "success",
        data: {
            ...data,
            can_manage: canManageSystemControls(req.user),
        },
    });
});

export const updateSystemAccessSchedule = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateSystemAccessScheduleSchema.parse(req.body);
    const data = await systemAccessScheduleService.updateSchedule({
        ...payload,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "Jadwal akses aplikasi berhasil diperbarui.",
        data: {
            ...data,
            can_manage: true,
        },
    });
});
