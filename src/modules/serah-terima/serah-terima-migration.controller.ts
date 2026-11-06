import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import {
    serahTerimaMigrationCommitSchema,
    serahTerimaMigrationPreviewSchema
} from "./serah-terima-migration.schema";
import { serahTerimaMigrationService } from "./serah-terima-migration.service";

export const previewSerahTerimaMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File PENGAWASAN tidak ditemukan", 400);
    const payload = serahTerimaMigrationPreviewSchema.parse(req.body);
    const data = await serahTerimaMigrationService.preview(req.file.buffer, payload.actor_role);
    res.json({ status: "success", message: "Preview migrasi Serah Terima berhasil dibuat", data });
});

export const commitSerahTerimaMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File PENGAWASAN tidak ditemukan", 400);
    const payload = serahTerimaMigrationCommitSchema.parse(req.body);
    const data = await serahTerimaMigrationService.commit(req.file.buffer, payload);
    res.status(201).json({ status: "success", message: "Migrasi Serah Terima berhasil diproses", data });
});
