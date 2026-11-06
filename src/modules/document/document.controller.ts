import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { AppError } from "../../common/app-error";
import {
    penyimpananDokumenCreateSchema,
    penyimpananDokumenArchiveStoreCreateSchema,
    penyimpananDokumenIdParamSchema,
    penyimpananDokumenListQuerySchema,
    penyimpananDokumenMigrationSchema,
    penyimpananDokumenUpdateSchema
} from "./document.schema";
import { penyimpananDokumenService, type UploadedDokumenFile } from "./document.service";

const getUploadedFiles = (req: Request): UploadedDokumenFile[] => {
    const files = req.files as UploadedDokumenFile[] | undefined;
    if (!files) return [];
    return files;
};

export const createPenyimpananDokumen = asyncHandler(async (req: Request, res: Response) => {
    const payload = penyimpananDokumenCreateSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const result = await penyimpananDokumenService.create(payload, files);

    res.json({
        status: "success",
        message: "Dokumen berhasil disimpan",
        data: result
    });
});

export const listPenyimpananDokumen = asyncHandler(async (req: Request, res: Response) => {
    console.log('[DOCUMENT LIST] Original request query:', JSON.stringify(req.query));
    console.log('[DOCUMENT LIST] User info:', {
        email: req.user?.email_sat,
        cabang: req.user?.cabang,
        roles: req.user?.roles
    });
    
    let query = penyimpananDokumenListQuerySchema.parse(req.query);
    console.log('[DOCUMENT LIST] After schema parse:', JSON.stringify(query));
    
    // Inject branch filter untuk user non-global
    query = await injectBranchFilter(req.user!, query);
    console.log('[DOCUMENT LIST] After inject filter:', JSON.stringify(query));
    
    // Security: Pastikan cabang_array tidak kosong untuk user non-global
    if (!(query as any)._is_global_access && (!query.cabang_array || query.cabang_array.length === 0 || query.cabang_array.includes('__NO_ACCESS__'))) {
        console.error('[DOCUMENT LIST] REJECT: No branch access');
        throw new AppError("User tidak memiliki akses ke cabang manapun. Hubungi administrator.", 403);
    }
    
    const data = await penyimpananDokumenService.list(query);
    console.log('[DOCUMENT LIST] Result count:', data.length);

    res.json({
        status: "success",
        data
    });
});

export const listPenyimpananDokumenArchiveStores = asyncHandler(async (req: Request, res: Response) => {
    const data = await penyimpananDokumenService.listArchiveStores(String(req.query.search ?? ""));

    res.json({
        status: "success",
        data
    });
});

export const createPenyimpananDokumenArchiveStore = asyncHandler(async (req: Request, res: Response) => {
    const payload = penyimpananDokumenArchiveStoreCreateSchema.parse(req.body);
    const data = await penyimpananDokumenService.createArchiveStore(payload);

    res.json({
        status: "success",
        message: "Data toko berhasil disimpan",
        data
    });
});

export const previewPenyimpananDokumenMigration = asyncHandler(async (req: Request, res: Response) => {
    const payload = penyimpananDokumenMigrationSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const data = await penyimpananDokumenService.previewMigration(payload.actor_role, files);

    res.json({
        status: "success",
        message: "Preview migrasi berhasil dibuat",
        data
    });
});

export const commitPenyimpananDokumenMigration = asyncHandler(async (req: Request, res: Response) => {
    const payload = penyimpananDokumenMigrationSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const data = await penyimpananDokumenService.commitMigration(payload.actor_role, files, payload.actor_email);

    res.json({
        status: "success",
        message: "Migrasi dokumen berhasil diproses",
        data
    });
});

export const getPenyimpananDokumenDetail = asyncHandler(async (req: Request, res: Response) => {
    const params = penyimpananDokumenIdParamSchema.parse(req.params);
    const data = await penyimpananDokumenService.getDetail(params.id);

    res.json({
        status: "success",
        data
    });
});

export const updatePenyimpananDokumen = asyncHandler(async (req: Request, res: Response) => {
    const params = penyimpananDokumenIdParamSchema.parse(req.params);
    const payload = penyimpananDokumenUpdateSchema.parse(req.body);
    const files = getUploadedFiles(req);
    const data = await penyimpananDokumenService.update(params.id, payload, files);

    res.json({
        status: "success",
        message: "Dokumen berhasil diperbarui",
        data
    });
});

export const deletePenyimpananDokumen = asyncHandler(async (req: Request, res: Response) => {
    const params = penyimpananDokumenIdParamSchema.parse(req.params);
    const data = await penyimpananDokumenService.delete(params.id);

    res.json({
        status: "success",
        message: "Dokumen berhasil dihapus",
        data
    });
});
