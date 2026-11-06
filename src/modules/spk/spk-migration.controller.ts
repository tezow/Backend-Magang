import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { spkMigrationCommitSchema, spkMigrationPreviewSchema } from "./spk-migration.schema";
import { spkMigrationService } from "./spk-migration.service";

export const previewSpkMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = spkMigrationPreviewSchema.parse(req.body);
    const data = await spkMigrationService.preview(req.file.buffer, payload.actor_role);

    res.json({
        status: "success",
        message: "Preview migrasi SPK berhasil dibuat",
        data
    });
});

export const commitSpkMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = spkMigrationCommitSchema.parse(req.body);
    const data = await spkMigrationService.commit(req.file.buffer, payload);

    res.status(201).json({
        status: "success",
        message: "Migrasi SPK berhasil diproses",
        data
    });
});
