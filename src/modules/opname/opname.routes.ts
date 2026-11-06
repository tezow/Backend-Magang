import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import {
    bulkApproveOpname,
    createBulkOpname,
    createOpname,
    downloadOpnameFoto,
    deleteOpname,
    getOpnameById,
    listOpname,
    updateOpname
} from "./opname.controller";

const opnameRouter = Router();
const opnameUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        fieldSize: 10 * 1024 * 1024,
        files: 300,
        fields: 20
    }
});

const logBulkOpnameRequest = (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();

    res.on("finish", () => {
        const uploadedFiles = req.files as Record<string, Express.Multer.File[]> | undefined;
        const fotoCount = Array.isArray(uploadedFiles?.file_foto_opname)
            ? uploadedFiles.file_foto_opname.length
            : 0;
        const itemCount = (() => {
            if (Array.isArray(req.body?.items)) return req.body.items.length;
            if (typeof req.body?.items !== "string") return undefined;
            try {
                const parsed = JSON.parse(req.body.items);
                return Array.isArray(parsed) ? parsed.length : undefined;
            } catch {
                return undefined;
            }
        })();

        console.info("[OPNAME][BULK]", {
            status: res.statusCode,
            duration_ms: Date.now() - startedAt,
            id_toko: req.body?.id_toko,
            item_count: itemCount,
            foto_count: fotoCount,
            content_length: req.get("content-length")
        });
    });

    next();
};

opnameRouter.post(
    "/",
    opnameUpload.fields([
        { name: "file_foto_opname", maxCount: 1 }
    ]),
    createOpname
);
opnameRouter.post(
    "/bulk",
    logBulkOpnameRequest,
    opnameUpload.fields([
        { name: "file_foto_opname", maxCount: 300 }
    ]),
    createBulkOpname
);
opnameRouter.post("/bulk-approve", bulkApproveOpname);
opnameRouter.get("/", listOpname);
opnameRouter.get("/:id", getOpnameById);
opnameRouter.get("/:id/foto", downloadOpnameFoto);
opnameRouter.put(
    "/:id",
    opnameUpload.fields([
        { name: "rev_file_foto_opname", maxCount: 1 }
    ]),
    updateOpname
);
opnameRouter.delete("/:id", deleteOpname);

export { opnameRouter };
