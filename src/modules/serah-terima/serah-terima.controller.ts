import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { asyncHandler } from "../../common/async-handler";
import { correctSerahTerimaDateSchema, createSerahTerimaPdfSchema, createUnifiedSerahTerimaPdfSchema, listBerkasSerahTerimaQuerySchema, listSerahTerimaDateCorrectionHistoryQuerySchema } from "./serah-terima.schema";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { serahTerimaService } from "./serah-terima.service";

export const listBerkasSerahTerima = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    let query = listBerkasSerahTerimaQuerySchema.parse(req.query);
    query = await injectBranchFilter(req.user, query);
    
    // Security IDOR: Cegah Kontraktor melihat data PT lain
    const isKontraktor = req.user.roles.some((r: string) => r.toUpperCase().includes('KONTRAKTOR') || r.toUpperCase().includes('DIREKTUR'));
    if (isKontraktor) {
        if (!req.user.nama_pt) {
            throw new AppError("Akses ditolak: Data PT tidak ditemukan untuk akun kontraktor ini.", 403);
        }
        (query as any).nama_kontraktor = req.user.nama_pt;
    }
    
    const data = await serahTerimaService.list({ 
        id_toko: query.id_toko, 
        nomor_ulok: query.nomor_ulok,
        cabang_array: query.cabang_array,
        nama_kontraktor: (query as any).nama_kontraktor,
    });

    res.json({
        status: "success",
        data,
    });
});

export const createPdfSerahTerima = asyncHandler(async (req: Request, res: Response) => {
    const { id_toko } = createSerahTerimaPdfSchema.parse(req.body);
    const data = await serahTerimaService.createPdfSerahTerima(id_toko);

    res.json({
        status: "success",
        message: "Berkas serah terima berhasil dibuat dan diupload",
        data,
    });
});

export const createUnifiedPdfSerahTerima = asyncHandler(async (req: Request, res: Response) => {
    const { nomor_ulok, takeover_sequence } = createUnifiedSerahTerimaPdfSchema.parse(req.body);
    const data = await serahTerimaService.createPdfSerahTerimaUnified(nomor_ulok, { takeoverSequence: takeover_sequence });

    res.json({
        status: "success",
        message: "Berkas serah terima gabungan berhasil dibuat dan diupload",
        data,
    });
});

export const correctSerahTerimaDate = asyncHandler(async (req: Request, res: Response) => {
    const payload = correctSerahTerimaDateSchema.parse(req.body);
    const data = await serahTerimaService.correctDate({
        ...payload,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "Tanggal Serah Terima berhasil diperbarui. Denda sudah disinkronkan dan dokumen terkait dijadwalkan untuk dibuat ulang.",
        data,
    });
});

export const listSerahTerimaDateCorrectionHistory = asyncHandler(async (req: Request, res: Response) => {
    const query = listSerahTerimaDateCorrectionHistoryQuerySchema.parse(req.query);
    const data = await serahTerimaService.listDateCorrectionHistory({
        nomor_ulok: query.nomor_ulok,
        cabang: query.cabang,
        actor: req.user,
    });

    res.json({
        status: "success",
        data,
    });
});

export const downloadBerkasSerahTerimaPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const { buffer, filename } = await serahTerimaService.downloadPdfByBerkasId(id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
});

export const regenerateBerkasSerahTerimaPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const data = await serahTerimaService.queueRegeneratePdfByBerkasId(id);

    res.json({
        status: "success",
        message: data.message,
        data,
    });
});
