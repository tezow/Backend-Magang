import { Router } from "express";
import multer from "multer";
import {
    commitPenyimpananDokumenMigration,
    createPenyimpananDokumenArchiveStore,
    createPenyimpananDokumen,
    deletePenyimpananDokumen,
    getPenyimpananDokumenDetail,
    listPenyimpananDokumen,
    listPenyimpananDokumenArchiveStores,
    previewPenyimpananDokumenMigration,
    updatePenyimpananDokumen
} from "./document.controller";

const documentRouter = Router();

const dokumenUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

documentRouter.post(
    "/penyimpanan-dokumen",
    dokumenUpload.any(),
    createPenyimpananDokumen
);

documentRouter.get("/penyimpanan-dokumen", listPenyimpananDokumen);

documentRouter.get(
    "/penyimpanan-dokumen/archive-stores",
    listPenyimpananDokumenArchiveStores
);

documentRouter.post(
    "/penyimpanan-dokumen/archive-stores",
    createPenyimpananDokumenArchiveStore
);

documentRouter.post(
    "/penyimpanan-dokumen/migration-preview",
    dokumenUpload.any(),
    previewPenyimpananDokumenMigration
);

documentRouter.post(
    "/penyimpanan-dokumen/migration-commit",
    dokumenUpload.any(),
    commitPenyimpananDokumenMigration
);

documentRouter.get(
    "/penyimpanan-dokumen/:id",
    getPenyimpananDokumenDetail
);

documentRouter.put(
    "/penyimpanan-dokumen/:id",
    dokumenUpload.any(),
    updatePenyimpananDokumen
);

documentRouter.delete(
    "/penyimpanan-dokumen/:id",
    deletePenyimpananDokumen
);

export { documentRouter };
