import { Router } from "express";
import { listActivityLogs } from "./activity-log.controller";

const activityLogRouter = Router();

activityLogRouter.get("/", listActivityLogs);

export { activityLogRouter };
