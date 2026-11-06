import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { rabMigrationCommitSchema, rabMigrationPreviewSchema } from "./rab-migration.schema";
import { rabMigrationService } from "./rab-migration.service";

const getMigrationFile = (req: Request, fieldName: "file" | "materai_file") => {
    if (req.file && fieldName === "file") return req.file;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    return files?.[fieldName]?.[0];
};

export const previewRabMigration = asyncHandler(async (req: Request, res: Response) => {
    const mainFile = getMigrationFile(req, "file");
    const materaiFile = getMigrationFile(req, "materai_file");
    if (!mainFile) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = rabMigrationPreviewSchema.parse(req.body);
    const data = await rabMigrationService.preview(mainFile.buffer, payload.actor_role, materaiFile?.buffer);

    res.json({
        status: "success",
        message: "Preview migrasi RAB berhasil dibuat",
        data
    });
});

export const commitRabMigration = asyncHandler(async (req: Request, res: Response) => {
    const mainFile = getMigrationFile(req, "file");
    const materaiFile = getMigrationFile(req, "materai_file");
    if (!mainFile) {
        throw new AppError("File Excel tidak ditemukan", 400);
    }

    const payload = rabMigrationCommitSchema.parse(req.body);
    const data = await rabMigrationService.commit(mainFile.buffer, payload, materaiFile?.buffer);

    res.status(201).json({
        status: "success",
        message: "Migrasi RAB berhasil diproses",
        data
    });
});
