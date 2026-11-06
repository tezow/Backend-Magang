import { Router } from "express";
import multer from "multer";
import {
    createPertambahanSpk,
    downloadPertambahanSpkLampiranPendukung,
    downloadPertambahanSpkPdf,
    deletePertambahanSpkById,
    getPertambahanSpkById,
    handlePertambahanSpkApproval,
    handlePertambahanSpkIntervention,
    listPertambahanSpk,
    updatePertambahanSpkById
} from "./pertambahan-spk.controller";
import {
    commitPertambahanSpkMigration,
    previewPertambahanSpkMigration
} from "./pertambahan-spk-migration.controller";

const pertambahanSpkRouter = Router();
const pertambahanSpkUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});
const pertambahanSpkMigrationUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024,
        fieldSize: 10 * 1024 * 1024
    }
});

pertambahanSpkRouter.post("/", pertambahanSpkUpload.single("file_lampiran_pendukung"), createPertambahanSpk);
pertambahanSpkRouter.get("/", listPertambahanSpk);
pertambahanSpkRouter.post(
    "/migration/preview",
    pertambahanSpkMigrationUpload.single("file"),
    previewPertambahanSpkMigration
);
pertambahanSpkRouter.post(
    "/migration/commit",
    pertambahanSpkMigrationUpload.single("file"),
    commitPertambahanSpkMigration
);
pertambahanSpkRouter.get("/:id", getPertambahanSpkById);
pertambahanSpkRouter.get("/:id/pdf", downloadPertambahanSpkPdf);
pertambahanSpkRouter.get("/:id/lampiran-pendukung", downloadPertambahanSpkLampiranPendukung);
pertambahanSpkRouter.put("/:id", pertambahanSpkUpload.single("file_lampiran_pendukung"), updatePertambahanSpkById);
pertambahanSpkRouter.post("/:id/approval", handlePertambahanSpkApproval);
pertambahanSpkRouter.post("/:id/intervensi", handlePertambahanSpkIntervention);
pertambahanSpkRouter.delete("/:id", deletePertambahanSpkById);

export { pertambahanSpkRouter };
