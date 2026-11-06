import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { pengawasanMigrationCommitSchema, pengawasanMigrationPreviewSchema } from "./pengawasan-migration.schema";
import { pengawasanMigrationService } from "./pengawasan-migration.service";

export const previewPengawasanMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = pengawasanMigrationPreviewSchema.parse(req.body);
    const data = await pengawasanMigrationService.preview(req.file.buffer, payload.actor_role);

    res.json({
        status: "success",
        message: "Preview migrasi Pengawasan berhasil dibuat",
        data
    });
});

export const commitPengawasanMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = pengawasanMigrationCommitSchema.parse({
        ...req.body,
        selections: typeof req.body.selections === "string"
            ? JSON.parse(req.body.selections)
            : req.body.selections
    });
    const data = await pengawasanMigrationService.commit(req.file.buffer, payload);

    res.status(201).json({
        status: "success",
        message: "Migrasi Pengawasan berhasil diproses",
        data
    });
});
