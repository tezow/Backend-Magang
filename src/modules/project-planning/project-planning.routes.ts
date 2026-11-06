import { Router } from "express";
import multer from "multer";
import {
    submitProjekPlanning,
    resubmitProjekPlanning,
    listProjekPlanning,
    getProjekPlanningById,
    handleBmApproval,
    handleBmRegionalApproval,
    handlePpApproval1,
    handleUpload3d,
    handleUploadRab,
    handlePpManagerApproval,
    handlePpApproval2,
    getProjekPlanningLogs,
    getProjekPlanningTaskCounts,
    getRabRequests,
    getRabPrefill,
    handleProjekPlanningIntervention,
    downloadPdf,
    downloadPhotosPdf,
    proxyFile,
} from "./project-planning.controller";

const fpdUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

const projekPlanningRouter = Router();

// ── Coordinator ──────────────────────────────────────────────
projekPlanningRouter.post("/submit", fpdUpload.any(), submitProjekPlanning);
projekPlanningRouter.post("/:id/resubmit", fpdUpload.any(), resubmitProjekPlanning);
projekPlanningRouter.post(
    "/:id/upload-rab",
    fpdUpload.fields([
        { name: "file_gambar_kerja_final_sipil", maxCount: 2 },
        { name: "file_gambar_kerja_final_me", maxCount: 2 },
        { name: "file_rab_sipil_final", maxCount: 2 },
        { name: "file_rab_me_final", maxCount: 2 },
    ]),
    handleUploadRab
);

// ── Query ─────────────────────────────────────────────────────
projekPlanningRouter.get("/", listProjekPlanning);
projekPlanningRouter.get("/task-counts", getProjekPlanningTaskCounts);
projekPlanningRouter.get("/rab-requests", getRabRequests);
projekPlanningRouter.get("/:id/rab-prefill", getRabPrefill);
projekPlanningRouter.get("/:id", getProjekPlanningById);
projekPlanningRouter.get("/:id/logs", getProjekPlanningLogs);
projekPlanningRouter.get("/:id/pdf", downloadPdf);
projekPlanningRouter.get("/:id/photos-pdf", downloadPhotosPdf);
projekPlanningRouter.get("/:id/proxy-file", proxyFile);
projekPlanningRouter.post("/:id/intervention", handleProjekPlanningIntervention);

// ── BM Manager ───────────────────────────────────────────────
projekPlanningRouter.post("/:id/bm-approval", handleBmApproval);
projekPlanningRouter.post("/:id/bm-regional-approval", handleBmRegionalApproval);

// ── PP Specialist ─────────────────────────────────────────────
projekPlanningRouter.post("/:id/pp-approval-1", handlePpApproval1);
projekPlanningRouter.post("/:id/upload-3d", fpdUpload.single("file_desain_3d"), handleUpload3d);
projekPlanningRouter.post("/:id/pp-approval-2", handlePpApproval2);

// ── PP Manager ────────────────────────────────────────────────
projekPlanningRouter.post("/:id/pp-manager-approval", handlePpManagerApproval);

export { projekPlanningRouter };
