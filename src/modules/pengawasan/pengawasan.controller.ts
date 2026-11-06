import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { GoogleProvider } from "../../common/google";
import {
    bulkUpdatePengawasanSchema,
    bulkCreatePengawasanSchema,
    createPengawasanSchema,
    listPengawasanQuerySchema,
    updatePengawasanSchema
} from "./pengawasan.schema";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { pengawasanService } from "./pengawasan.service";

type UploadedDokumentasiFile = {
    originalname: string;
    mimetype: string;
    buffer: Parameters<GoogleProvider["uploadFile"]>[3];
};

type UploadedFilesMap = Record<string, UploadedDokumentasiFile[]>;

const getUploadedFile = (
    files: UploadedFilesMap | undefined,
    fieldName: "file_dokumentasi" | "rev_file_dokumentasi" | "file_foto_opname" | "rev_file_foto_opname"
): UploadedDokumentasiFile | undefined => {
    const file = files?.[fieldName]?.[0];
    if (!file) return undefined;

    return {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer
    };
};

const getUploadedFiles = (
    files: UploadedFilesMap | undefined,
    fieldName: "file_dokumentasi" | "rev_file_dokumentasi" | "file_foto_opname" | "rev_file_foto_opname"
): UploadedDokumentasiFile[] => {
    const fieldFiles = files?.[fieldName] ?? [];
    return fieldFiles.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer
    }));
};

export const createPengawasan = asyncHandler(async (req: Request, res: Response) => {
    const payload = createPengawasanSchema.parse(req.body);
    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedDokumentasi = getUploadedFile(uploadedFiles, "file_dokumentasi");
    const data = await pengawasanService.create(payload, uploadedDokumentasi);

    res.status(201).json({
        status: "success",
        message: "Data pengawasan berhasil disimpan",
        data
    });
});

export const createBulkPengawasan = asyncHandler(async (req: Request, res: Response) => {
    let parsedItems = req.body.items;
    if (typeof req.body.items === "string") {
        try {
            parsedItems = JSON.parse(req.body.items);
        } catch {
            throw new AppError("Format items tidak valid. Untuk multipart/form-data kirim items sebagai JSON string.", 400);
        }
    }

    const payloadCandidate = {
        ...req.body,
        items: parsedItems
    };
    const { items } = bulkCreatePengawasanSchema.parse(payloadCandidate);

    let parsedDokumentasiIndexes = req.body.file_dokumentasi_indexes;
    if (typeof req.body.file_dokumentasi_indexes === "string") {
        try {
            parsedDokumentasiIndexes = JSON.parse(req.body.file_dokumentasi_indexes);
        } catch {
            throw new AppError(
                "Format file_dokumentasi_indexes tidak valid. Untuk multipart/form-data kirim sebagai JSON string array index.",
                400
            );
        }
    }

    if (typeof parsedDokumentasiIndexes !== "undefined" && !Array.isArray(parsedDokumentasiIndexes)) {
        throw new AppError("file_dokumentasi_indexes harus berupa array index", 400);
    }

    const dokumentasiIndexes = Array.isArray(parsedDokumentasiIndexes)
        ? parsedDokumentasiIndexes.map((value, index) => {
            const numberValue = Number(value);
            if (!Number.isInteger(numberValue) || numberValue < 0) {
                throw new AppError(`file_dokumentasi_indexes[${index}] harus integer >= 0`, 400);
            }
            return numberValue;
        })
        : undefined;

    let parsedFotoOpnameIndexes = req.body.file_foto_opname_indexes;
    if (typeof req.body.file_foto_opname_indexes === "string") {
        try {
            parsedFotoOpnameIndexes = JSON.parse(req.body.file_foto_opname_indexes);
        } catch {
            throw new AppError(
                "Format file_foto_opname_indexes tidak valid. Untuk multipart/form-data kirim sebagai JSON string array index.",
                400
            );
        }
    }

    if (typeof parsedFotoOpnameIndexes !== "undefined" && !Array.isArray(parsedFotoOpnameIndexes)) {
        throw new AppError("file_foto_opname_indexes harus berupa array index", 400);
    }

    const fotoOpnameIndexes = Array.isArray(parsedFotoOpnameIndexes)
        ? parsedFotoOpnameIndexes.map((value, index) => {
            const numberValue = Number(value);
            if (!Number.isInteger(numberValue) || numberValue < 0) {
                throw new AppError(`file_foto_opname_indexes[${index}] harus integer >= 0`, 400);
            }
            return numberValue;
        })
        : undefined;

    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedDokumentasiFiles = getUploadedFiles(uploadedFiles, "file_dokumentasi");
    const uploadedFotoOpnameFiles = getUploadedFiles(uploadedFiles, "file_foto_opname");
    
    // Require user info for opname email pembuat
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    
    const data = await pengawasanService.createBulk(
        items, 
        uploadedDokumentasiFiles, 
        dokumentasiIndexes,
        uploadedFotoOpnameFiles,
        fotoOpnameIndexes,
        req.user.email_sat
    );

    res.status(201).json({
        status: "success",
        message: `${data.length} data pengawasan berhasil disimpan`,
        data
    });
});

export const listPengawasan = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    
    console.log('[PENGAWASAN LIST] Original request query:', JSON.stringify(req.query));
    console.log('[PENGAWASAN LIST] User info:', {
        email: req.user.email_sat,
        cabang: req.user.cabang,
        roles: req.user.roles
    });
    
    let query = listPengawasanQuerySchema.parse(req.query);
    console.log('[PENGAWASAN LIST] After schema parse:', JSON.stringify(query));
    
    query = await injectBranchFilter(req.user, query);
    console.log('[PENGAWASAN LIST] After inject filter:', JSON.stringify(query));
    
    // Security: Pastikan cabang_array tidak kosong untuk user non-global
    // Global user (super human) akan punya _is_global_access = true = bypass, tidak perlu dicek
    const isGlobal = !!(query as any)._is_global_access;
    if (!isGlobal && (!query.cabang_array || query.cabang_array.length === 0 || query.cabang_array.includes('__NO_ACCESS__'))) {
        console.error('[PENGAWASAN LIST] REJECT: No branch access');
        throw new AppError("User tidak memiliki akses ke cabang manapun. Hubungi administrator.", 403);
    }
    
    // Security IDOR: Cegah Kontraktor melihat data PT lain dengan memanipulasi query parameter
    const isKontraktor = req.user.roles.some((r: string) => r.toUpperCase().includes('KONTRAKTOR') || r.toUpperCase().includes('DIREKTUR'));
    if (isKontraktor) {
        if (!req.user.nama_pt) {
            throw new AppError("Akses ditolak: Data PT tidak ditemukan untuk akun kontraktor ini.", 403);
        }
        query.nama_kontraktor = req.user.nama_pt;
    }
    
    const data = await pengawasanService.list(query);
    console.log('[PENGAWASAN LIST] Result count:', data.length);

    res.json({ status: "success", data });
});

export const listPendingPengawasanMigrationPdfs = asyncHandler(async (req: Request, res: Response) => {
    let query: any = {};
    query = await injectBranchFilter(req.user!, query);
    
    // Security: Global user (super human) punya _is_global_access = true = bypass
    const isGlobal = !!(query as any)._is_global_access;
    if (!isGlobal && (!query.cabang_array || query.cabang_array.length === 0 || query.cabang_array.includes('__NO_ACCESS__'))) {
        throw new AppError("User tidak memiliki akses ke cabang manapun. Hubungi administrator.", 403);
    }
    
    const nomorUlok = typeof req.query.nomor_ulok === "string" ? req.query.nomor_ulok : undefined;
    // Global user: pass undefined agar service tidak filter cabang
    const data = await pengawasanService.listPendingMigrationPdfs(nomorUlok, isGlobal ? undefined : query.cabang_array);
    res.json({ status: "success", data });
});

export const getPengawasanById = asyncHandler(async (req: Request, res: Response) => {
    const data = await pengawasanService.getById(req.params.id);
    res.json({ status: "success", data });
});

export const downloadPengawasanPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("ID pengawasan tidak valid", 400);
    }

    const { buffer, filename } = await pengawasanService.downloadPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
});

export const updatePengawasan = asyncHandler(async (req: Request, res: Response) => {
    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedDokumentasi = getUploadedFile(uploadedFiles, "rev_file_dokumentasi");
    const payload = updatePengawasanSchema.parse(req.body);

    if (Object.keys(payload).length === 0 && !uploadedDokumentasi) {
        throw new AppError("Minimal satu field harus diisi untuk update atau kirim rev_file_dokumentasi", 400);
    }

    const data = await pengawasanService.update(req.params.id, payload, uploadedDokumentasi);

    res.json({
        status: "success",
        message: "Data pengawasan berhasil diperbarui",
        data
    });
});

export const updateBulkPengawasan = asyncHandler(async (req: Request, res: Response) => {
    let parsedItems = req.body.items;
    if (typeof req.body.items === "string") {
        try {
            parsedItems = JSON.parse(req.body.items);
        } catch {
            throw new AppError("Format items tidak valid. Untuk multipart/form-data kirim items sebagai JSON string.", 400);
        }
    }

    const payloadCandidate = {
        ...req.body,
        items: parsedItems
    };
    const { items } = bulkUpdatePengawasanSchema.parse(payloadCandidate);

    let parsedDokumentasiIndexes = req.body.rev_file_dokumentasi_indexes;
    if (typeof req.body.rev_file_dokumentasi_indexes === "string") {
        try {
            parsedDokumentasiIndexes = JSON.parse(req.body.rev_file_dokumentasi_indexes);
        } catch {
            throw new AppError(
                "Format rev_file_dokumentasi_indexes tidak valid. Untuk multipart/form-data kirim sebagai JSON string array index.",
                400
            );
        }
    }

    if (typeof parsedDokumentasiIndexes !== "undefined" && !Array.isArray(parsedDokumentasiIndexes)) {
        throw new AppError("rev_file_dokumentasi_indexes harus berupa array index", 400);
    }

    const dokumentasiIndexes = Array.isArray(parsedDokumentasiIndexes)
        ? parsedDokumentasiIndexes.map((value, index) => {
            const numberValue = Number(value);
            if (!Number.isInteger(numberValue) || numberValue < 0) {
                throw new AppError(`rev_file_dokumentasi_indexes[${index}] harus integer >= 0`, 400);
            }
            return numberValue;
        })
        : undefined;

    let parsedFotoOpnameIndexes = req.body.rev_file_foto_opname_indexes;
    if (typeof req.body.rev_file_foto_opname_indexes === "string") {
        try {
            parsedFotoOpnameIndexes = JSON.parse(req.body.rev_file_foto_opname_indexes);
        } catch {
            throw new AppError(
                "Format rev_file_foto_opname_indexes tidak valid. Untuk multipart/form-data kirim sebagai JSON string array index.",
                400
            );
        }
    }

    if (typeof parsedFotoOpnameIndexes !== "undefined" && !Array.isArray(parsedFotoOpnameIndexes)) {
        throw new AppError("rev_file_foto_opname_indexes harus berupa array index", 400);
    }

    const fotoOpnameIndexes = Array.isArray(parsedFotoOpnameIndexes)
        ? parsedFotoOpnameIndexes.map((value, index) => {
            const numberValue = Number(value);
            if (!Number.isInteger(numberValue) || numberValue < 0) {
                throw new AppError(`rev_file_foto_opname_indexes[${index}] harus integer >= 0`, 400);
            }
            return numberValue;
        })
        : undefined;

    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedDokumentasiFiles = getUploadedFiles(uploadedFiles, "rev_file_dokumentasi");
    const uploadedFotoOpnameFiles = [
        ...getUploadedFiles(uploadedFiles, "file_foto_opname"),
        ...getUploadedFiles(uploadedFiles, "rev_file_foto_opname")
    ];
    
    // Require user info for opname email pembuat
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    
    const data = await pengawasanService.updateBulk(
        items, 
        uploadedDokumentasiFiles, 
        dokumentasiIndexes,
        uploadedFotoOpnameFiles,
        fotoOpnameIndexes,
        req.user.email_sat
    );

    res.json({
        status: "success",
        message: `${data.length} data pengawasan berhasil diperbarui`,
        data
    });
});

export const deletePengawasan = asyncHandler(async (req: Request, res: Response) => {
    const data = await pengawasanService.remove(req.params.id);

    res.json({
        status: "success",
        message: "Data pengawasan berhasil dihapus",
        data
    });
});
