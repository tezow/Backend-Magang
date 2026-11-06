import { Router } from "express";
import {
    addDayItems,
    createGanttNote,
    deleteGantt,
    getDetailByToko,
    getGanttById,
    getSupervisionWorkspace,
    interveneGantt,
    listGanttNotes,
    listGantt,
    lockGantt,
    managePengawasan,
    submitGantt,
    updateGantt,
    updateKecepatan,
    updateKeterlambatan,
    previewGanttMigration,
    commitGanttMigration,
    submitTakeoverInspection
} from "./gantt.controller";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });
const ganttRouter = Router();

ganttRouter.post("/migration/preview", upload.single("file"), previewGanttMigration);
ganttRouter.post("/migration/commit", upload.single("file"), commitGanttMigration);
ganttRouter.post("/submit", submitGantt);
ganttRouter.post("/takeover-inspection", upload.any(), submitTakeoverInspection);
ganttRouter.get("/", listGantt);
ganttRouter.get("/supervision-workspace/:nomor_ulok", getSupervisionWorkspace);
ganttRouter.get("/detail/:id_toko", getDetailByToko);
ganttRouter.get("/:id/notes", listGanttNotes);
ganttRouter.post("/:id/notes", createGanttNote);
ganttRouter.get("/:id", getGanttById);
ganttRouter.put("/:id", updateGantt);
ganttRouter.post("/:id/lock", lockGantt);
ganttRouter.post("/:id/intervention", interveneGantt);
ganttRouter.delete("/:id", deleteGantt);
ganttRouter.post("/:id/day", addDayItems);
ganttRouter.post("/:id/day/keterlambatan", updateKeterlambatan);
ganttRouter.post("/:id/day/kecepatan", updateKecepatan);
ganttRouter.post("/:id/pengawasan", managePengawasan);

export { ganttRouter };
