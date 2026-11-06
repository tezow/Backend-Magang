import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { approvalActionSchema } from "../approval/approval.schema";
import { listInstruksiLapanganQuerySchema, submitInstruksiLapanganSchema } from "./instruksi-lapangan.schema";
import { instruksiLapanganService } from "./instruksi-lapangan.service";

export const submitInstruksiLapangan = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.email_sat) {
        throw new AppError("User tidak terautentikasi", 401);
    }

    let detailItems = req.body.detail_items;
    if (typeof detailItems === "string") {
        try {
            detailItems = JSON.parse(detailItems);
        } catch {
            throw new AppError("Format detail_items tidak valid. Untuk multipart/form-data kirim detail_items sebagai JSON string.", 400);
        }
    }

    const payloadCandidate = {
        ...req.body,
        email_pembuat: req.user.email_sat,
        detail_items: detailItems,
    };

    const payload = submitInstruksiLapanganSchema.parse(payloadCandidate);

    const uploadedFiles = (req.files ?? {}) as Record<string, Array<{
        originalname: string;
        mimetype: string;
        buffer: Buffer;
    }>>;

    console.log("[IL][SUBMIT_CONTROLLER] Payload diterima", {
        id_toko: payload.id_toko ?? null,
        nomor_ulok: payload.nomor_ulok,
        lingkup_pekerjaan: payload.lingkup_pekerjaan ?? null,
        email_pembuat: payload.email_pembuat,
        item_count: payload.detail_items.length,
        has_lampiran: Boolean(uploadedFiles.lampiran?.[0])
    });
    const getUploadedFile = (fieldName: string) => {
        const file = uploadedFiles[fieldName]?.[0];
        if (!file) return undefined;

        return {
            originalname: file.originalname,
            mimetype: file.mimetype,
            buffer: file.buffer
        };
    };

    const uploadedLampiran = getUploadedFile("lampiran");

    const data = await instruksiLapanganService.submit(payload, {
        lampiranFile: uploadedLampiran,
    });

    res.status(201).json({
        status: "success",
        message: "Pengajuan Instruksi Lapangan berhasil disimpan",
        data
    });
});

export const listInstruksiLapangan = asyncHandler(async (req: Request, res: Response) => {
    let query = listInstruksiLapanganQuerySchema.parse(req.query);
    
    const user = req.user;
    if (!user) {
        throw new AppError("User tidak terautentikasi", 401);
    }

    // Enforce branch filtering di backend
    query = await injectBranchFilter(user, query);
    
    // Security IDOR: Cegah Kontraktor melihat data PT lain
    const isKontraktor = user.roles.some((r: string) => r.toUpperCase().includes('KONTRAKTOR') || r.toUpperCase().includes('DIREKTUR'));
    if (isKontraktor) {
        if (!user.nama_pt) {
            throw new AppError("Akses ditolak: Data PT tidak ditemukan untuk akun kontraktor ini.", 403);
        }
        (query as any).nama_kontraktor = user.nama_pt;
    }
    
    const data = await instruksiLapanganService.list(query);

    res.json({ status: "success", data });
});

export const getInstruksiLapanganById = asyncHandler(async (req: Request, res: Response) => {
    const data = await instruksiLapanganService.getById(req.params.id);

    res.json({ status: "success", data });
});

export const downloadInstruksiLapanganPdf = asyncHandler(async (req: Request, res: Response) => {
    const result = await instruksiLapanganService.getPdfDownloadPayload(req.params.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.pdfBuffer);
});

export const regenerateInstruksiLapanganPdf = asyncHandler(async (req: Request, res: Response) => {
    await instruksiLapanganService.generateAndStorePdf(req.params.id);
    const data = await instruksiLapanganService.getById(req.params.id);

    res.json({
        status: "success",
        message: "PDF Instruksi Lapangan berhasil digenerate ulang",
        data,
    });
});

export const downloadInstruksiLapanganLampiran = asyncHandler(async (req: Request, res: Response) => {
    const result = await instruksiLapanganService.getAssetDownloadPayload(req.params.id, "lampiran");

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.fileBuffer);
});

export const handleInstruksiLapanganApproval = asyncHandler(async (req: Request, res: Response) => {
    const action = approvalActionSchema.parse(req.body);
    if (action.jabatan !== "KOORDINATOR" && action.jabatan !== "MANAGER") {
        throw new AppError("Approval Instruksi Lapangan hanya dapat diproses oleh Koordinator atau Manager", 403);
    }

    const result = await instruksiLapanganService.handleApproval(req.params.id, action);

    res.json({
        status: "success",
        message: "Approval berhasil diproses",
        data: result
    });
});
