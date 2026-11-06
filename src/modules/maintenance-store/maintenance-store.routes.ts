import { Router } from "express";
import { getMaintenanceStores } from "./maintenance-store.controller";

export const maintenanceStoreRouter = Router();

maintenanceStoreRouter.get("/", getMaintenanceStores);
