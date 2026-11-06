import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import {
    instruksiLapanganMigrationCommitSchema,
    instruksiLapanganMigrationPreviewSchema
} from "./instruksi-lapangan-migration.schema";
import { instruksiLapanganMigrationRab2Service } from "./instruksi-lapangan-migration-rab2.service";

export const previewInstruksiLapanganMigrationRab2 = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File rab_kedua tidak ditemukan", 400);
    const payload = instruksiLapanganMigrationPreviewSchema.parse(req.body);
    const data = await instruksiLapanganMigrationRab2Service.preview(req.file.buffer, payload.actor_role);
    res.json({ status: "success", message: "Preview migrasi IL dari rab_kedua berhasil dibuat", data });
});

export const commitInstruksiLapanganMigrationRab2 = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new AppError("File rab_kedua tidak ditemukan", 400);
    const payload = instruksiLapanganMigrationCommitSchema.parse(req.body);
    const data = await instruksiLapanganMigrationRab2Service.commit(req.file.buffer, payload);
    res.status(201).json({ status: "success", message: "Migrasi IL dari rab_kedua berhasil diproses", data });
});
