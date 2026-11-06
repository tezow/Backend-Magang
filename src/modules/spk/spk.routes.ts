import { Router } from "express";
import multer from "multer";
import { downloadSpkPdf, getSpkById, handleSpkApproval, handleSpkIntervention, listSpk, submitSpk } from "./spk.controller";
import { commitSpkMigration, previewSpkMigration } from "./spk-migration.controller";

const spkRouter = Router();
const spkMigrationUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 50 * 1024 * 1024,
		fieldSize: 10 * 1024 * 1024,
	}
});

spkRouter.post("/submit", submitSpk);
spkRouter.get("/", listSpk);
spkRouter.post("/migration/preview", spkMigrationUpload.single("file"), previewSpkMigration);
spkRouter.post("/migration/commit", spkMigrationUpload.single("file"), commitSpkMigration);
spkRouter.get("/:id", getSpkById);
spkRouter.get("/:id/pdf", downloadSpkPdf);
spkRouter.post("/:id/approval", handleSpkApproval);
spkRouter.post("/:id/intervention", handleSpkIntervention);

export { spkRouter };
