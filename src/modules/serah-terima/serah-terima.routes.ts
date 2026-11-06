import { Router } from "express";
import { correctSerahTerimaDate, createPdfSerahTerima, createUnifiedPdfSerahTerima, downloadBerkasSerahTerimaPdf, listBerkasSerahTerima, listSerahTerimaDateCorrectionHistory, regenerateBerkasSerahTerimaPdf } from "./serah-terima.controller";
import multer from "multer";
import {
    commitSerahTerimaMigration,
    previewSerahTerimaMigration
} from "./serah-terima-migration.controller";

const serahTerimaRouter = Router();
const migrationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 }
});

serahTerimaRouter.post("/serah-terima/migration/preview", migrationUpload.single("file"), previewSerahTerimaMigration);
serahTerimaRouter.post("/serah-terima/migration/commit", migrationUpload.single("file"), commitSerahTerimaMigration);
serahTerimaRouter.post("/create_pdf_serah_terima_unified", createUnifiedPdfSerahTerima);
serahTerimaRouter.post("/create_pdf_serah_terima", createPdfSerahTerima);
serahTerimaRouter.get("/serah-terima/date-correction/history", listSerahTerimaDateCorrectionHistory);
serahTerimaRouter.patch("/serah-terima/date-correction", correctSerahTerimaDate);
serahTerimaRouter.get("/berkas_serah_terima", listBerkasSerahTerima);
serahTerimaRouter.get("/berkas_serah_terima/:id/pdf", downloadBerkasSerahTerimaPdf);
serahTerimaRouter.post("/berkas_serah_terima/:id/pdf/regenerate", regenerateBerkasSerahTerimaPdf);

export { serahTerimaRouter };
