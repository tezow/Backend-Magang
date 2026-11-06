import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { GoogleProvider } from "../../common/google";
import {
    bulkApproveOpnameSchema,
    bulkCreateOpnameSchema,
    createOpnameSchema,
    listOpnameQuerySchema,
    updateOpnameSchema
} from "./opname.schema";
import { opnameService } from "./opname.service";

type UploadedFotoOpnameFile = {
    originalname: string;
    mimetype: string;
    buffer: Parameters<GoogleProvider["uploadFile"]>[3];
};

type UploadedFilesMap = Record<string, UploadedFotoOpnameFile[]>;

const getUploadedFile = (
    files: UploadedFilesMap | undefined,
    fieldName: "file_foto_opname" | "rev_file_foto_opname"
): UploadedFotoOpnameFile | undefined => {
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
    fieldName: "file_foto_opname" | "rev_file_foto_opname"
): UploadedFotoOpnameFile[] => {
    const fieldFiles = files?.[fieldName] ?? [];
    return fieldFiles.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer
    }));
};

export const createOpname = asyncHandler(async (req: Request, res: Response) => {
    const payload = createOpnameSchema.parse(req.body);
    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedFotoOpname = getUploadedFile(uploadedFiles, "file_foto_opname");
    const data = await opnameService.create(payload, uploadedFotoOpname);

    res.status(201).json({
        status: "success",
        message: "Data opname berhasil disimpan",
        data
    });
});

export const createBulkOpname = asyncHandler(async (req: Request, res: Response) => {
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
    const {
        id_toko,
        email_pembuat,
        tipe_opname,
        grand_total_opname,
        grand_total_rab,
        items
    } = bulkCreateOpnameSchema.parse(payloadCandidate);

    let parsedFotoIndexes = req.body.file_foto_opname_indexes;
    if (typeof req.body.file_foto_opname_indexes === "string") {
        try {
            parsedFotoIndexes = JSON.parse(req.body.file_foto_opname_indexes);
        } catch {
            throw new AppError(
                "Format file_foto_opname_indexes tidak valid. Untuk multipart/form-data kirim sebagai JSON string array index.",
                400
            );
        }
    }

    if (typeof parsedFotoIndexes !== "undefined" && !Array.isArray(parsedFotoIndexes)) {
        throw new AppError("file_foto_opname_indexes harus berupa array index", 400);
    }

    const fotoIndexes = Array.isArray(parsedFotoIndexes)
        ? parsedFotoIndexes.map((value, index) => {
            const numberValue = Number(value);
            if (!Number.isInteger(numberValue) || numberValue < 0) {
                throw new AppError(`file_foto_opname_indexes[${index}] harus integer >= 0`, 400);
            }
            return numberValue;
        })
        : undefined;

    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedFotoOpnameFiles = getUploadedFiles(uploadedFiles, "file_foto_opname");
    const data = await opnameService.createBulk(
        { id_toko, tipe_opname, email_pembuat, grand_total_opname, grand_total_rab, items },
        uploadedFotoOpnameFiles,
        fotoIndexes
    );

    res.status(201).json({
        status: "success",
        message: `${data.items.length} data opname berhasil disimpan`,
        data
    });
});

export const listOpname = asyncHandler(async (req: Request, res: Response) => {
    const query = listOpnameQuerySchema.parse(req.query);
    const { toko, items, instruksi_lapangan_items } = await opnameService.list(query);

    res.json({ status: "success", toko, instruksi_lapangan_items, data: items });
});

export const getOpnameById = asyncHandler(async (req: Request, res: Response) => {
    const data = await opnameService.getById(req.params.id);
    res.json({ status: "success", data });
});

export const downloadOpnameFoto = asyncHandler(async (req: Request, res: Response) => {
    const result = await opnameService.getFotoDownloadPayload(req.params.id);

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.fileBuffer);
});

export const updateOpname = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateOpnameSchema.parse(req.body);
    const uploadedFiles = req.files as UploadedFilesMap | undefined;
    const uploadedFotoOpname = getUploadedFile(uploadedFiles, "rev_file_foto_opname");
    const data = await opnameService.update(req.params.id, payload, uploadedFotoOpname);

    res.json({
        status: "success",
        message: "Data opname berhasil diperbarui",
        data
    });
});

export const deleteOpname = asyncHandler(async (req: Request, res: Response) => {
    const data = await opnameService.remove(req.params.id);

    res.json({
        status: "success",
        message: "Data opname berhasil dihapus",
        data
    });
});

export const bulkApproveOpname = asyncHandler(async (req: Request, res: Response) => {
    const { id_toko } = bulkApproveOpnameSchema.parse(req.body);
    const result = await opnameService.bulkApprove(id_toko);

    res.json({
        status: "success",
        message: `${result.updated_count} item opname berhasil disetujui`,
        data: result
    });
});
