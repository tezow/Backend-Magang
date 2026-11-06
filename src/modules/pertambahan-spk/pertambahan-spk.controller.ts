import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import {
    createPertambahanSpkSchema,
    pertambahanSpkApprovalSchema,
    pertambahanSpkInterventionSchema,
    pertambahanSpkListQuerySchema,
    updatePertambahanSpkSchema
} from "./pertambahan-spk.schema";
import { pertambahanSpkService } from "./pertambahan-spk.service";
import { compressImage } from "../../common/image-compressor";
export const createPertambahanSpk = asyncHandler(async (req: Request, res: Response) => {
    const payload = createPertambahanSpkSchema.parse(req.body);
    let uploadedLampiranPendukung;
    if (req.file) {
        const compressed = await compressImage(req.file);
        uploadedLampiranPendukung = {
            originalname: compressed.originalname,
            mimetype: compressed.mimetype,
            buffer: compressed.buffer
        };
    }

    const data = await pertambahanSpkService.create(payload, uploadedLampiranPendukung);

    res.status(201).json({
        status: "success",
        message: "Data pertambahan SPK berhasil dibuat",
        data
    });
});

export const listPertambahanSpk = asyncHandler(async (req: Request, res: Response) => {
    let query = pertambahanSpkListQuerySchema.parse(req.query);
    
    const user = req.user;
    if (!user) {
        throw new AppError("User tidak terautentikasi", 401);
    }

    // Enforce branch filtering di backend
    query = await injectBranchFilter(user, query);
    
    // Security IDOR: Cegah Kontraktor melihat data PT lain dengan memanipulasi query parameter
    const isKontraktor = user.roles.some((r: string) => r.toUpperCase().includes('KONTRAKTOR') || r.toUpperCase().includes('DIREKTUR'));
    if (isKontraktor) {
        if (!user.nama_pt) {
            throw new AppError("Akses ditolak: Data PT tidak ditemukan untuk akun kontraktor ini.", 403);
        }
        query.nama_kontraktor = user.nama_pt;
    }
    
    const data = await pertambahanSpkService.list(query);

    res.json({ status: "success", data });
});

export const getPertambahanSpkById = asyncHandler(async (req: Request, res: Response) => {
    const data = await pertambahanSpkService.getById(req.params.id);

    res.json({ status: "success", data });
});

export const downloadPertambahanSpkPdf = asyncHandler(async (req: Request, res: Response) => {
    const result = await pertambahanSpkService.getDownloadPayload(req.params.id, "link_pdf");

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.fileBuffer);
});

export const downloadPertambahanSpkLampiranPendukung = asyncHandler(async (req: Request, res: Response) => {
    const result = await pertambahanSpkService.getDownloadPayload(req.params.id, "link_lampiran_pendukung");

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.fileBuffer);
});

export const updatePertambahanSpkById = asyncHandler(async (req: Request, res: Response) => {
    const payload = updatePertambahanSpkSchema.parse(req.body);
    let uploadedLampiranPendukung;
    if (req.file) {
        const compressed = await compressImage(req.file);
        uploadedLampiranPendukung = {
            originalname: compressed.originalname,
            mimetype: compressed.mimetype,
            buffer: compressed.buffer
        };
    }

    const data = await pertambahanSpkService.updateById(req.params.id, payload, uploadedLampiranPendukung);

    res.json({
        status: "success",
        message: "Data pertambahan SPK berhasil diperbarui",
        data
    });
});

export const deletePertambahanSpkById = asyncHandler(async (req: Request, res: Response) => {
    await pertambahanSpkService.deleteById(req.params.id);

    res.json({
        status: "success",
        message: "Data pertambahan SPK berhasil dihapus"
    });
});

export const handlePertambahanSpkApproval = asyncHandler(async (req: Request, res: Response) => {
    const action = pertambahanSpkApprovalSchema.parse(req.body);
    const data = await pertambahanSpkService.handleApproval(req.params.id, action);

    res.json({
        status: "success",
        message: "Approval pertambahan SPK berhasil diproses",
        data
    });
});

export const handlePertambahanSpkIntervention = asyncHandler(async (req: Request, res: Response) => {
    const action = pertambahanSpkInterventionSchema.parse(req.body);
    const data = await pertambahanSpkService.intervene(req.params.id, action);

    res.json({
        status: "success",
        message: "Intervensi Pertambahan SPK berhasil diproses",
        data
    });
});
