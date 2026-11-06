import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { activityLogRepository } from "./activity-log.repository";
import { activityLogListQuerySchema } from "./activity-log.schema";

export const listActivityLogs = asyncHandler(async (req: Request, res: Response) => {
    const query = activityLogListQuerySchema.parse(req.query);
    const data = await activityLogRepository.list(query);

    res.json({ status: "success", data });
});
