import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import {
    pertambahanSpkMigrationCommitSchema,
    pertambahanSpkMigrationPreviewSchema
} from "./pertambahan-spk-migration.schema";
import { pertambahanSpkMigrationService } from "./pertambahan-spk-migration.service";

export const previewPertambahanSpkMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File Excel tidak ditemukan", 400);

    const payload = pertambahanSpkMigrationPreviewSchema.parse(req.body);
    const data = await pertambahanSpkMigrationService.preview(req.file.buffer, payload.actor_role);

    res.json({
        status: "success",
        message: "Preview migrasi Pertambahan SPK berhasil dibuat",
        data
    });
});

export const commitPertambahanSpkMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File Excel tidak ditemukan", 400);

    const payload = pertambahanSpkMigrationCommitSchema.parse(req.body);
    const data = await pertambahanSpkMigrationService.commit(req.file.buffer, payload);

    res.status(201).json({
        status: "success",
        message: "Migrasi Pertambahan SPK berhasil diproses",
        data
    });
});
