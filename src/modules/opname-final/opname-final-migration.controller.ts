import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import {
    opnameFinalMigrationCommitSchema,
    opnameFinalMigrationPreviewSchema
} from "./opname-final-migration.schema";
import { opnameFinalMigrationService } from "./opname-final-migration.service";

export const previewOpnameFinalMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File OPNAME_v1 tidak ditemukan", 400);
    const payload = opnameFinalMigrationPreviewSchema.parse(req.body);
    const data = await opnameFinalMigrationService.preview(req.file.buffer, payload.actor_role);
    res.json({ status: "success", message: "Preview migrasi Opname Final berhasil dibuat", data });
});

export const commitOpnameFinalMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File OPNAME_v1 tidak ditemukan", 400);
    const payload = opnameFinalMigrationCommitSchema.parse(req.body);
    const data = await opnameFinalMigrationService.commit(req.file.buffer, payload);
    res.status(201).json({ status: "success", message: "Migrasi Opname Final berhasil diproses", data });
});
