import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { GoogleProvider } from "../../common/google";
import { AppError } from "../../common/app-error";
import {
    createDendaActionSchema,
    dendaActionIdParamsSchema,
    listDendaActionsQuerySchema,
    rejectDendaActionSchema,
} from "./sp.schema";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { spService } from "./sp.service";

export const listDendaActionKontraktor = asyncHandler(async (req: Request, res: Response) => {
    const data = await spService.listKontraktor(req.user);

    res.json({
        status: "success",
        data,
    });
});

export const listDendaActionKontraktorDebug = asyncHandler(async (req: Request, res: Response) => {
    const data = await spService.listKontraktorDebug(req.user);

    res.json({
        status: "success",
        data,
    });
});

export const listDendaActionCandidates = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    const query = await injectBranchFilter(req.user, {} as { cabang_array?: string[] });
    const data = await spService.listCandidates(query.cabang_array);

    res.json({
        status: "success",
        data,
    });
});

export const getDendaActionHistory = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const data = await spService.getDendaActionHistory(id, req.user);

    res.json({
        status: "success",
        data,
    });
});


export const listDendaActions = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }
    const isContractor = req.user.roles.some((role) => role === "KONTRAKTOR" || role.includes("DIREKTUR KONTRAKTOR"));
    let query = listDendaActionsQuerySchema.parse(req.query);

    if (isContractor) {
        const data = !query.action_type || query.action_type === "SP"
            ? req.user.nama_pt
                ? await spService.listActionsForKontraktor(req.user.nama_pt, req.user)
                : []
            : [];

        res.json({
            status: "success",
            data,
        });
        return;
    }

    query = await injectBranchFilter(req.user, query);
    const data = await spService.listActions(query, req.user);

    res.json({
        status: "success",
        data,
    });
});

export const createDendaAction = asyncHandler(async (req: Request, res: Response) => {
    const payload = createDendaActionSchema.parse(req.body);
    const attachment = req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            buffer: req.file.buffer,
        }
        : undefined;

    const data = await spService.createAction({
        ...payload,
        attachment,
        actor: req.user,
    });

    res.status(201).json({
        status: "success",
        message: payload.action_type === "SP"
            ? "Surat Peringatan berhasil diajukan ke manager."
            : "Takeover berhasil diajukan ke manager.",
        data,
    });
});

export const approveDendaAction = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const data = await spService.approveAction({
        id,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: data.action_type === "SP"
            ? "Surat Peringatan berhasil di-approve dan aktif selama 6 bulan."
            : "Takeover berhasil di-approve sebagai catatan administratif.",
        data,
    });
});

export const regeneratePdf = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const data = await spService.regenerateSpPdf({
        id,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "PDF Surat Peringatan berhasil digenerate.",
        data,
    });
});

export const rejectDendaAction = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const payload = rejectDendaActionSchema.parse(req.body);
    const data = await spService.rejectAction({
        id,
        payload,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "Pengajuan berhasil ditolak.",
        data,
    });
});

export const proxyFile = asyncHandler(async (req: Request, res: Response) => {
    const rawUrl = (req.query.url as string)?.trim();
    if (!rawUrl) throw new AppError("Missing url parameter", 400);

    // Extract file ID dari berbagai format Google Drive URL
    const driveFileMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
    const driveOpenMatch = rawUrl.match(/drive\.google\.com\/open\?id=([^&]+)/);
    const viewMatch = rawUrl.match(/id=([^&]+)/);
    const fileId = driveFileMatch?.[1] ?? driveOpenMatch?.[1] ?? viewMatch?.[1];

    if (!fileId) {
        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            return res.redirect(302, rawUrl);
        }
        console.error("[proxyFile] Invalid URL format:", rawUrl);
        throw new AppError("Invalid Google Drive URL format", 400);
    }

    const gp = GoogleProvider.instance;
    const drives = [gp.docDrive, gp.spartaDrive].filter((d): d is NonNullable<typeof d> => !!d);
    if (drives.length === 0) {
        console.warn("[proxyFile] Google Drive not configured, redirecting to raw URL");
        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            return res.redirect(302, rawUrl);
        }
        throw new AppError("Google Drive tidak terkonfigurasi", 500);
    }

    try {
        console.log(`[proxyFile] Fetching file metadata: ${fileId}`);
        
        let activeDrive = drives[0];
        let fileMeta: any = null;

        for (const drive of drives) {
            try {
                fileMeta = await drive.files.get({ 
                    fileId, 
                    fields: "name, mimeType, size",
                    supportsAllDrives: true 
                });
                activeDrive = drive;
                break;
            } catch {
                // Lanjut coba drive berikutnya
            }
        }

        if (!fileMeta) {
            if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
                return res.redirect(302, rawUrl);
            }
            throw new AppError("File tidak ditemukan di Google Drive atau token tidak memiliki izin", 404);
        }

        console.log(`[proxyFile] File found: ${fileMeta.data.name}, type: ${fileMeta.data.mimeType}, size: ${fileMeta.data.size}`);

        // Set headers
        const filename = fileMeta.data.name || "document";
        const safeAsciiName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const encodedName = encodeURIComponent(filename);
        const disposition = req.query.download === "true" ? "attachment" : "inline";
        res.setHeader("Content-Disposition", `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
        
        if (fileMeta.data.mimeType) {
            res.setHeader("Content-Type", fileMeta.data.mimeType);
        }

        if (fileMeta.data.size) {
            res.setHeader("Content-Length", fileMeta.data.size);
        }

        // Set CORS headers untuk iframe/direct view
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET");
        res.setHeader("Cache-Control", "public, max-age=3600");

        console.log(`[proxyFile] Streaming file content: ${fileId}`);
        
        // Stream file content dengan supportsAllDrives
        const stream = await activeDrive.files.get(
            { 
                fileId, 
                alt: "media",
                supportsAllDrives: true 
            }, 
            { responseType: "stream" }
        );

        // Handle stream errors
        stream.data.on("error", (error: any) => {
            console.error(`[proxyFile] Stream error for ${fileId}:`, error);
            if (!res.headersSent) {
                if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
                    return res.redirect(302, rawUrl);
                }
                res.status(500).json({ 
                    status: "error", 
                    message: "Error streaming file from Drive" 
                });
            }
        });

        stream.data.on("end", () => {
            console.log(`[proxyFile] Successfully streamed: ${fileId}`);
        });

        stream.data.pipe(res);

    } catch (e: any) {
        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            console.warn(`[proxyFile] Streaming failed, redirecting to raw URL: ${rawUrl}`);
            return res.redirect(302, rawUrl);
        }
        const status = e?.code ?? e?.response?.status ?? 500;
        const message = e?.message ?? "Unknown error";
        
        console.error(`[proxyFile] Error for fileId ${fileId}:`, {
            status,
            message,
            details: e?.response?.data ?? e
        });

        // Specific error messages
        if (status === 404) {
            throw new AppError("File tidak ditemukan di Google Drive", 404);
        } else if (status === 403) {
            throw new AppError("Akses ke file ditolak. File sedang diproses untuk akses publik, coba refresh halaman.", 403);
        } else if (status === 401) {
            throw new AppError("Token Google Drive expired. Silakan refresh token.", 401);
        } else {
            throw new AppError(`Gagal mengambil file dari Drive: ${message}`, status);
        }
    }
});

// ===================================================================
// KONTRAKTOR ENDPOINTS
// ===================================================================

export const listKontraktorSp = asyncHandler(async (req: Request, res: Response) => {
    const namaKontraktor = req.query.nama_kontraktor as string | undefined;
    const data = await spService.listKontraktorSp({ namaKontraktor, actor: req.user });

    res.json({
        status: "success",
        data,
    });
});

export const getKontraktorSpDetail = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const namaKontraktor = req.query.nama_kontraktor as string | undefined;

    const data = await spService.getKontraktorSpDetail({
        id,
        namaKontraktor,
        actor: req.user,
        autoMarkAsViewed: true, // Auto-track view
    });

    res.json({
        status: "success",
        data,
    });
});

export const acknowledgeKontraktorSp = asyncHandler(async (req: Request, res: Response) => {
    const { id } = dendaActionIdParamsSchema.parse(req.params);
    const namaKontraktor = req.query.nama_kontraktor as string | undefined;
    const { catatan_acknowledge } = req.body;

    const data = await spService.acknowledgeKontraktorSp({
        id,
        namaKontraktor,
        catatan: catatan_acknowledge,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "Surat Peringatan berhasil di-acknowledge. Terima kasih atas perhatian Anda.",
        data,
    });
});

// ===================================================================
// CRON & ANALYTICS ENDPOINTS
// ===================================================================

export const runSpCronJobs = asyncHandler(async (req: Request, res: Response) => {
    // Only allow SUPER HUMAN or admins to trigger
    if (!req.user || !req.user.roles?.some(r => r.toUpperCase().includes("SUPER HUMAN"))) {
        throw new AppError("Hanya admin yang dapat menjalankan cron jobs", 403);
    }

    const { spCronService } = await import("./sp.cron.service");
    const results = await spCronService.runAllJobs();

    res.json({
        status: "success",
        message: "Cron jobs berhasil dijalankan",
        data: results,
    });
});

export const getSpAnalytics = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
        throw new AppError("User tidak terautentikasi", 401);
    }

    const stats = await spService.getAnalytics();

    res.json({
        status: "success",
        data: stats,
    });
});
