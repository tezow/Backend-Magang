import { Router } from "express";
import multer from "multer";
import {
    createBulkPengawasan,
    createPengawasan,
    deletePengawasan,
    downloadPengawasanPdf,
    getPengawasanById,
    listPendingPengawasanMigrationPdfs,
    listPengawasan,
    updateBulkPengawasan,
    updatePengawasan
} from "./pengawasan.controller";
import { commitPengawasanMigration, previewPengawasanMigration } from "./pengawasan-migration.controller";

const pengawasanRouter = Router();
const pengawasanUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
const pengawasanMigrationUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024,
        fieldSize: 10 * 1024 * 1024
    }
});

pengawasanRouter.post(
    "/",
    pengawasanUpload.fields([
        { name: "file_dokumentasi", maxCount: 1 },
        { name: "rev_file_dokumentasi", maxCount: 1 }
    ]),
    createPengawasan
);
pengawasanRouter.post(
    "/bulk",
    pengawasanUpload.fields([
        { name: "file_dokumentasi", maxCount: 50 },
        { name: "file_foto_opname", maxCount: 50 }
    ]),
    createBulkPengawasan
);
pengawasanRouter.post("/migration/preview", pengawasanMigrationUpload.single("file"), previewPengawasanMigration);
pengawasanRouter.post("/migration/commit", pengawasanMigrationUpload.single("file"), commitPengawasanMigration);
pengawasanRouter.get("/migration/pending", listPendingPengawasanMigrationPdfs);
pengawasanRouter.get("/", listPengawasan);
pengawasanRouter.get("/:id/pdf", downloadPengawasanPdf);
pengawasanRouter.get("/:id", getPengawasanById);
pengawasanRouter.put(
    "/bulk",
    pengawasanUpload.fields([
        { name: "rev_file_dokumentasi", maxCount: 50 },
        { name: "file_foto_opname", maxCount: 50 },
        { name: "rev_file_foto_opname", maxCount: 50 }
    ]),
    updateBulkPengawasan
);
pengawasanRouter.put(
    "/:id",
    pengawasanUpload.fields([
        { name: "file_dokumentasi", maxCount: 1 },
        { name: "rev_file_dokumentasi", maxCount: 1 }
    ]),
    updatePengawasan
);
pengawasanRouter.delete("/:id", deletePengawasan);

export { pengawasanRouter };
