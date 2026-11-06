import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler";
import { canManageSystemMaintenance, systemMaintenanceService } from "./system-maintenance.service";

const updateSystemMaintenanceSchema = z.object({
    is_active: z.boolean(),
});

export const getSystemMaintenanceStatus = asyncHandler(async (req: Request, res: Response) => {
    const data = await systemMaintenanceService.getStatus();
    res.json({
        status: "success",
        data: {
            ...data,
            can_manage: canManageSystemMaintenance(req.user),
        },
    });
});

export const updateSystemMaintenanceStatus = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateSystemMaintenanceSchema.parse(req.body);
    const data = await systemMaintenanceService.setActive({
        is_active: payload.is_active,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: payload.is_active
            ? "Mode pemeliharaan sistem diaktifkan."
            : "Mode pemeliharaan sistem dinonaktifkan.",
        data: {
            ...data,
            can_manage: true,
        },
    });
});
