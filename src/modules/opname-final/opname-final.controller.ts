import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { approvalActionSchema } from "../approval/approval.schema";
import { lockOpnameFinalSchema, opnameFinalInterventionSchema, opnameFinalListQuerySchema } from "./opname-final.schema";
import { opnameFinalService } from "./opname-final.service";

export const listOpnameFinal = asyncHandler(async (req: Request, res: Response) => {
    let query = opnameFinalListQuerySchema.parse(req.query);
    
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
        query.nama_kontraktor = user.nama_pt;
    }
    
    const data = await opnameFinalService.list(query);

    res.json({ status: "success", data });
});

export const getOpnameFinalById = asyncHandler(async (req: Request, res: Response) => {
    const data = await opnameFinalService.getById(req.params.id);

    res.json({ status: "success", data });
});

export const handleOpnameFinalApproval = asyncHandler(async (req: Request, res: Response) => {
    const action = approvalActionSchema.parse(req.body);
    const data = await opnameFinalService.handleApproval(req.params.id, action);

    res.json({
        status: "success",
        message: "Approval opname_final berhasil diproses",
        data
    });
});

export const handleOpnameFinalIntervention = asyncHandler(async (req: Request, res: Response) => {
    const action = opnameFinalInterventionSchema.parse(req.body);
    const data = await opnameFinalService.intervene(req.params.id, action);

    res.json({
        status: "success",
        message: "Intervensi KTK berhasil diproses",
        data
    });
});

export const downloadOpnameFinalPdf = asyncHandler(async (req: Request, res: Response) => {
    const forceRegenerate = String(req.query.regenerate ?? "").trim() === "1";
    const result = await opnameFinalService.generatePdf(req.params.id, { forceRegenerate });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("X-SPARTA-PDF-Source", result.source);
    res.send(result.pdfBuffer);
});

export const regenerateOpnameFinalPdf = asyncHandler(async (req: Request, res: Response) => {
    const data = await opnameFinalService.queueRegeneratePdf(req.params.id);

    res.status(data.queued ? 202 : 200).json({
        status: "success",
        message: data.message,
        data
    });
});

export const lockOpnameFinal = asyncHandler(async (req: Request, res: Response) => {
    const payload = lockOpnameFinalSchema.parse(req.body);
    const data = await opnameFinalService.lockOpnameFinal(req.params.id, payload);

    res.json({
        status: "success",
        message: "Opname final berhasil dikunci dan PDF berhasil dibuat",
        data
    });
});

export const exportOpnameFinalExcel = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await opnameFinalService.exportOpnameFinalExcel(id);
    
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(result.excelBuffer);
});
