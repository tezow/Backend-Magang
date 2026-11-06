import { Router } from "express";
import multer from "multer";
import {
	deleteRabItems,
	downloadRabInsuranceFile,
	downloadRabLogo,
	downloadRabPdf,
	getRabById,
	handleRabApproval,
	listRab,
	regenerateAndDownloadRabPdf,
	regenerateRabPdf,
	replaceRabItems,
	syncRabItemsWithBranchPrices,
	submitRab,
	updateRabItemsBulk,
	updateRabStatus,
    exportRabExcel,
} from "./rab.controller";
import { commitRabMigration, previewRabMigration } from "./rab-migration.controller";

const rabRouter = Router();
const RAB_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const rabUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: RAB_UPLOAD_LIMIT_BYTES,
		fieldSize: RAB_UPLOAD_LIMIT_BYTES,
	}
});
const rabMigrationUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 50 * 1024 * 1024,
		fieldSize: 10 * 1024 * 1024,
	}
});

rabRouter.post(
	"/submit",
	rabUpload.fields([
		{ name: "file_asuransi", maxCount: 1 },
		{ name: "rev_file_asuransi", maxCount: 1 },
		{ name: "rev_logo", maxCount: 1 },
	]),
	submitRab
);
rabRouter.get("/", listRab);
rabRouter.post(
	"/migration/preview",
	rabMigrationUpload.fields([
		{ name: "file", maxCount: 1 },
		{ name: "materai_file", maxCount: 1 },
	]),
	previewRabMigration
);
rabRouter.post(
	"/migration/commit",
	rabMigrationUpload.fields([
		{ name: "file", maxCount: 1 },
		{ name: "materai_file", maxCount: 1 },
	]),
	commitRabMigration
);
rabRouter.get("/:id", getRabById);
rabRouter.put("/:id/items", updateRabItemsBulk);
rabRouter.put("/:id/items/replace", replaceRabItems);
rabRouter.post("/:id/sync-branch-prices", syncRabItemsWithBranchPrices);
rabRouter.delete("/:id/items", deleteRabItems);
rabRouter.post("/:id/pdf/regenerate", regenerateRabPdf);
rabRouter.post("/:id/pdf/regenerate-download", regenerateAndDownloadRabPdf);
rabRouter.get("/:id/pdf", downloadRabPdf);
rabRouter.get("/:id/logo", downloadRabLogo);
rabRouter.get("/:id/file-asuransi", downloadRabInsuranceFile);
rabRouter.get("/:id/excel", exportRabExcel);
rabRouter.post("/:id/approval", handleRabApproval);
rabRouter.put("/update-status", updateRabStatus);

export { rabRouter };
