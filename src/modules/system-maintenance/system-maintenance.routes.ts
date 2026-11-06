import { Router } from "express";
import {
    getSystemMaintenanceStatus,
    updateSystemMaintenanceStatus,
} from "./system-maintenance.controller";

const systemMaintenanceRouter = Router();

systemMaintenanceRouter.get("/status", getSystemMaintenanceStatus);
systemMaintenanceRouter.put("/status", updateSystemMaintenanceStatus);

export { systemMaintenanceRouter };
