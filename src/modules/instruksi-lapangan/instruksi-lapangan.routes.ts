import { Router } from "express";
import multer from "multer";
import {
    submitInstruksiLapangan,
    listInstruksiLapangan,
    getInstruksiLapanganById,
    downloadInstruksiLapanganPdf,
    regenerateInstruksiLapanganPdf,
    downloadInstruksiLapanganLampiran,
    handleInstruksiLapanganApproval
} from "./instruksi-lapangan.controller";
import {
    commitInstruksiLapanganMigration,
    previewInstruksiLapanganMigration
} from "./instruksi-lapangan-migration.controller";
import {
    commitInstruksiLapanganMigrationRab2,
    previewInstruksiLapanganMigrationRab2
} from "./instruksi-lapangan-migration-rab2.controller";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const router = Router();
const migrationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 }
});

// Migrasi dari OPNAME_v1 (format lama — sheet data_rab + opname_final)
router.post("/migration/preview", migrationUpload.single("file"), previewInstruksiLapanganMigration);
router.post("/migration/commit", migrationUpload.single("file"), commitInstruksiLapanganMigration);

// Migrasi dari rab_kedua.xlsx (format baru — sheet Form2 + Form3, wide format)
router.post("/migration/rab2/preview", migrationUpload.single("file"), previewInstruksiLapanganMigrationRab2);
router.post("/migration/rab2/commit", migrationUpload.single("file"), commitInstruksiLapanganMigrationRab2);

router.post(
    "/submit",
    upload.fields([
        { name: "lampiran", maxCount: 1 }
    ]),
    submitInstruksiLapangan
);

router.get("/list", listInstruksiLapangan);
router.get("/:id", getInstruksiLapanganById);
router.get("/:id/pdf", downloadInstruksiLapanganPdf);
router.post("/:id/pdf/regenerate", regenerateInstruksiLapanganPdf);
router.get("/:id/lampiran", downloadInstruksiLapanganLampiran);
router.post("/:id/approval", handleInstruksiLapanganApproval);

export { router as instruksiLapanganRouter };
