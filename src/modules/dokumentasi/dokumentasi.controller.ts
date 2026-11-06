import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { AppError } from "../../common/app-error";
import {
    dokumentasiBangunanCreateSchema,
    dokumentasiBangunanIdParamSchema,
    dokumentasiBangunanItemIdParamSchema,
    dokumentasiBangunanListQuerySchema,
    dokumentasiBangunanPrefillQuerySchema,
    dokumentasiBangunanUpdateSchema
} from "./dokumentasi.schema";
import { dokumentasiBangunanService, type UploadedDokumentasiFile } from "./dokumentasi.service";

const getUploadedFiles = (req: Request): UploadedDokumentasiFile[] => {
    const files = req.files as UploadedDokumentasiFile[] | undefined;
    if (!files) return [];
    return files;
};

export const createDokumentasiBangunan = asyncHandler(async (req: Request, res: Response) => {
    const payload = dokumentasiBangunanCreateSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const result = await dokumentasiBangunanService.create(payload, files);

    res.json({
        status: "success",
        message: "Dokumentasi bangunan berhasil dibuat",
        data: result
    });
});

export const listDokumentasiBangunan = asyncHandler(async (req: Request, res: Response) => {
    console.log('[DOKUMENTASI LIST] Original request query:', JSON.stringify(req.query));
    console.log('[DOKUMENTASI LIST] User info:', {
        email: req.user?.email_sat,
        cabang: req.user?.cabang,
        roles: req.user?.roles
    });
    
    let query = dokumentasiBangunanListQuerySchema.parse(req.query);
    console.log('[DOKUMENTASI LIST] After schema parse:', JSON.stringify(query));
    
    // Inject branch filter untuk user non-global
    query = await injectBranchFilter(req.user!, query);
    console.log('[DOKUMENTASI LIST] After inject filter:', JSON.stringify(query));
    
    // Security: Pastikan cabang_array tidak kosong untuk user non-global
    if (!(query as any)._is_global_access && (!query.cabang_array || query.cabang_array.length === 0 || query.cabang_array.includes('__NO_ACCESS__'))) {
        console.error('[DOKUMENTASI LIST] REJECT: No branch access');
        throw new AppError("User tidak memiliki akses ke cabang manapun. Hubungi administrator.", 403);
    }
    
    const data = await dokumentasiBangunanService.list(query);
    console.log('[DOKUMENTASI LIST] Result count:', data.length);

    res.json({
        status: "success",
        data
    });
});

export const listDokumentasiBangunanPrefillOptions = asyncHandler(async (req: Request, res: Response) => {
    const query = dokumentasiBangunanPrefillQuerySchema.parse(req.query);
    const data = await dokumentasiBangunanService.listPrefillOptions(query);

    res.json({
        status: "success",
        data
    });
});

export const getDokumentasiBangunanDetail = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const data = await dokumentasiBangunanService.getDetail(params.id);

    res.json({
        status: "success",
        data
    });
});

export const updateDokumentasiBangunan = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const payload = dokumentasiBangunanUpdateSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const data = await dokumentasiBangunanService.update(params.id, payload, files);

    res.json({
        status: "success",
        message: "Dokumentasi bangunan berhasil diperbarui",
        data
    });
});

export const deleteDokumentasiBangunan = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const data = await dokumentasiBangunanService.delete(params.id);

    res.json({
        status: "success",
        message: "Dokumentasi bangunan berhasil dihapus",
        data
    });
});

export const addDokumentasiBangunanItems = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const files = getUploadedFiles(req);
    const data = await dokumentasiBangunanService.addItems(params.id, files);

    res.json({
        status: "success",
        message: "Foto dokumentasi berhasil ditambahkan",
        data
    });
});

export const deleteDokumentasiBangunanItem = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanItemIdParamSchema.parse(req.params);
    const data = await dokumentasiBangunanService.deleteItem(params.itemId);

    res.json({
        status: "success",
        message: "Item dokumentasi berhasil dihapus",
        data
    });
});

export const createDokumentasiBangunanPdf = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const data = await dokumentasiBangunanService.createPdf(params.id);

    res.json({
        status: "success",
        message: "PDF dokumentasi berhasil dibuat",
        data
    });
});

export const downloadDokumentasiBangunanPdf = asyncHandler(async (req: Request, res: Response) => {
    const params = dokumentasiBangunanIdParamSchema.parse(req.params);
    const { buffer, filename } = await dokumentasiBangunanService.downloadPdf(params.id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
});
