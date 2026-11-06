import { Router } from "express";
import { getSystemAccessSchedule, updateSystemAccessSchedule } from "./system-access-schedule.controller";

const router = Router();

router.get("/schedule", getSystemAccessSchedule);
router.put("/schedule", updateSystemAccessSchedule);

export default router;
