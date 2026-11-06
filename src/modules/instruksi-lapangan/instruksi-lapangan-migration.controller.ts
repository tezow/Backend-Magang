import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import {
    instruksiLapanganMigrationCommitSchema,
    instruksiLapanganMigrationPreviewSchema
} from "./instruksi-lapangan-migration.schema";
import { instruksiLapanganMigrationService } from "./instruksi-lapangan-migration.service";

export const previewInstruksiLapanganMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File OPNAME_v1 tidak ditemukan", 400);
    const payload = instruksiLapanganMigrationPreviewSchema.parse(req.body);
    const data = await instruksiLapanganMigrationService.preview(req.file.buffer, payload.actor_role);
    res.json({ status: "success", message: "Preview migrasi Instruksi Lapangan berhasil dibuat", data });
});

export const commitInstruksiLapanganMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File OPNAME_v1 tidak ditemukan", 400);
    const payload = instruksiLapanganMigrationCommitSchema.parse(req.body);
    const data = await instruksiLapanganMigrationService.commit(req.file.buffer, payload);
    res.status(201).json({ status: "success", message: "Migrasi Instruksi Lapangan berhasil diproses", data });
});
