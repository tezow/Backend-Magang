import { Router } from "express";
import multer from "multer";
import {
    approveDendaAction,
    createDendaAction,
    listDendaActionKontraktor,
    listDendaActionKontraktorDebug,
    listDendaActionCandidates,
    listDendaActions,
    rejectDendaAction,
    proxyFile,
    listKontraktorSp,
    getKontraktorSpDetail,
    acknowledgeKontraktorSp,
    runSpCronJobs,
    getSpAnalytics,
    regeneratePdf,
    getDendaActionHistory,
} from "./sp.controller";

const spRouter = Router();

const spUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// Surat Peringatan (SP) routes
spRouter.get("/kontraktor", listDendaActionKontraktor);
spRouter.get("/kontraktor-debug", listDendaActionKontraktorDebug); // DEBUG endpoint
spRouter.get("/candidates", listDendaActionCandidates);
spRouter.get("/proxy-file", proxyFile);

// Kontraktor-specific routes (public-ish - checked by nama_kontraktor param)
spRouter.get("/kontraktor/list", listKontraktorSp);
spRouter.get("/kontraktor/:id", getKontraktorSpDetail);
spRouter.post("/kontraktor/:id/acknowledge", acknowledgeKontraktorSp);

// Manager routes
spRouter.get("/", listDendaActions);
spRouter.get("/:id/history", getDendaActionHistory);
spRouter.post("/", spUpload.single("lampiran"), createDendaAction);
spRouter.post("/:id/approve", approveDendaAction);
spRouter.post("/:id/regenerate-pdf", regeneratePdf);
spRouter.post("/:id/reject", rejectDendaAction);

// Analytics & Cron
spRouter.get("/analytics", getSpAnalytics);
spRouter.post("/cron/run-all", runSpCronJobs);

export { spRouter };
