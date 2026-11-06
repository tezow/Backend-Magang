import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { AppError } from "../../common/app-error";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import { getApprovalBranchesForUser, getEffectiveBranchesForUser, normalizeBranchScopeName, getUserCoverageBranches } from "../../common/branch-scope";
import {
    submitProjekPlanningSchema,
    resubmitProjekPlanningSchema,
    approvalSchema,
    ppApproval1Schema,
    finalReviewSchema,
    upload3dSchema,
    uploadRabSchema,
    listProjekPlanningQuerySchema,
    rabPrefillQuerySchema,
    rabRequestQuerySchema,
    projekPlanningInterventionSchema,
} from "./project-planning.schema";
import { projekPlanningService } from "./project-planning.service";

async function fetchPublicDriveStream(fileId: string): Promise<{ stream: NodeJS.ReadableStream, contentType: string, contentLength: number | null } | null> {
    const urls = [
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`,
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok || !response.body) continue;
            
            const contentType = response.headers.get("content-type") || "";
            // Jika merespon HTML, berarti Google Drive memblokir (butuh login/akses)
            if (contentType.includes("text/html")) continue;

            const contentLengthStr = response.headers.get("content-length");
            const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : null;

            const { Readable } = await import("stream");
            const stream = Readable.fromWeb(response.body as any);
            return { stream, contentType, contentLength };
        } catch {
            // lanjut ke URL berikutnya
        }
    }
    return null;
}

// ============================================================
const normalizeRole = (role: unknown) => String(role ?? "").trim().toUpperCase();
const roleIncludes = (roles: string[] | undefined, ...keywords: string[]) =>
    (roles ?? []).some((role) => keywords.some((keyword) => normalizeRole(role).includes(keyword)));

const isSuperHuman = (roles: string[] | undefined) => roleIncludes(roles, "SUPER HUMAN");
const isCoordinatorRole = (roles: string[] | undefined) => roleIncludes(roles, "BRANCH BUILDING COORDINATOR", "KOORDINATOR");
const isBmRole = (roles: string[] | undefined) => roleIncludes(roles, "BRANCH BUILDING & MAINTENANCE MANAGER", "MAINTENANCE MANAGER", "BRANCH MANAGER", "BBMM");
const isBmRegionalRole = (roles: string[] | undefined) => roleIncludes(roles, "BUILDING & MAINTENANCE REGIONAL MANAGER", "B&M REGIONAL", "REGIONAL MANAGER");
const isPpSpecialistRole = (roles: string[] | undefined) => roleIncludes(roles, "PROJECT PLANNING & DEVELOPMENT SPECIALIST", "PP SPECIALIST") || ((roles ?? []).some((role) => normalizeRole(role).includes("PROJECT PLANNING") && !normalizeRole(role).includes("MANAGER")));
const isPpManagerRole = (roles: string[] | undefined) => roleIncludes(roles, "PROJECT PLANNING & DEVELOPMENT MANAGER", "PROJECT PLANNING MANAGER", "PP MANAGER");
const isHeadOfficeRole = (roles: string[] | undefined) => (roles ?? []).map(normalizeRole).includes("HEAD OFFICE");
const isStoreBranchControllingRole = (roles: string[] | undefined) => roleIncludes(roles, "STORE & BRANCH CONTROLLING");
const BRANCHES_WITH_COORDINATOR_BM_APPROVAL: string[] = [];
const canCoordinatorApproveBmForBranch = (branch?: string | null) =>
    BRANCHES_WITH_COORDINATOR_BM_APPROVAL.includes(normalizeBranchScopeName(branch));

const hasProjectPlanningRole = (roles: string[] | undefined) =>
    isSuperHuman(roles) || isHeadOfficeRole(roles) || isCoordinatorRole(roles) || isBmRole(roles) || isBmRegionalRole(roles) || isPpSpecialistRole(roles) || isPpManagerRole(roles) || isStoreBranchControllingRole(roles);

function requireUser(req: Request) {
    if (!req.user) throw new AppError("Sesi tidak valid. Silakan login kembali.", 401);
    return req.user;
}

function assertProjectPlanningRole(req: Request) {
    const user = requireUser(req);
    if (!hasProjectPlanningRole(user.roles)) {
        throw new AppError("Anda tidak memiliki akses ke Project Planning.", 403);
    }
    return user;
}

async function assertProjectPlanningBranchAccess(req: Request, cabang: string | null | undefined, forApproval = false) {
    const user = assertProjectPlanningRole(req);
    const normalizedCabang = normalizeBranchScopeName(cabang);
    if (!normalizedCabang) throw new AppError("Cabang Project Planning belum terisi sehingga akses tidak bisa divalidasi.", 403);

    const scope = forApproval
        ? await getApprovalBranchesForUser({ emailSat: user.email_sat, cabang: user.cabang, roles: user.roles })
        : await getEffectiveBranchesForUser({ emailSat: user.email_sat, cabang: user.cabang, roles: user.roles });

    if (scope.source === "global" || scope.source === "superhuman") return user;

    const allowedBranches = scope.branches.map(normalizeBranchScopeName);
    if (!allowedBranches.includes(normalizedCabang)) {
        throw new AppError("Anda tidak memiliki akses ke cabang Project Planning ini.", 403);
    }

    return user;
}

async function assertBmApprovalAccess(req: Request, id: number) {
    const user = assertProjectPlanningRole(req);
    const data = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, data.projek.cabang, true);

    const canApproveAsCoordinator = isCoordinatorRole(user.roles) && canCoordinatorApproveBmForBranch(data.projek.cabang);
    if (!isSuperHuman(user.roles) && !isBmRole(user.roles) && !canApproveAsCoordinator) {
        throw new AppError("Role Anda tidak memiliki akses untuk approval B&M Project Planning ini.", 403);
    }

    return user;
}
async function assertProjectPlanningActionAccess(req: Request, id: number, isAllowedRole: (roles: string[] | undefined) => boolean) {
    const user = assertProjectPlanningRole(req);
    if (!isSuperHuman(user.roles) && !isAllowedRole(user.roles)) {
        throw new AppError("Role Anda tidak memiliki akses untuk aksi Project Planning ini.", 403);
    }

    const data = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, data.projek.cabang, true);
    return user;
}

function isCoordinatorOnly(roles: string[] | undefined) {
    return isCoordinatorRole(roles) && !isBmRole(roles) && !isBmRegionalRole(roles) && !isPpSpecialistRole(roles) && !isPpManagerRole(roles) && !isSuperHuman(roles);
}
// SUBMIT FPD (Coordinator) — record baru
// ============================================================

export const submitProjekPlanning = asyncHandler(async (req: Request, res: Response) => {
    const payloadStr = req.body;
    if (typeof payloadStr.ketentuan === "string") payloadStr.ketentuan = JSON.parse(payloadStr.ketentuan);
    if (typeof payloadStr.catatan_design === "string") payloadStr.catatan_design = JSON.parse(payloadStr.catatan_design);
    if (typeof payloadStr.fasilitas === "string") payloadStr.fasilitas = JSON.parse(payloadStr.fasilitas);

    const payload = submitProjekPlanningSchema.parse(payloadStr);
    await assertProjectPlanningBranchAccess(req, payload.cabang, true);
    const user = requireUser(req);
    if (!isSuperHuman(user.roles) && !isCoordinatorRole(user.roles)) {
        throw new AppError("Role Anda tidak memiliki akses untuk membuat FPD Project Planning.", 403);
    }
    const files = req.files as Express.Multer.File[] | undefined;
    const result = await projekPlanningService.submit(payload, files);

    res.status(201).json({
        status: "success",
        message: "Pengajuan FPD berhasil dibuat dan diteruskan ke B&M Manager",
        data: result,
    });
});

// ============================================================
// RESUBMIT FPD (Coordinator) — update record DRAFT yang sudah ada
// ============================================================

export const resubmitProjekPlanning = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const payloadStr = req.body;
    if (typeof payloadStr.ketentuan === "string") payloadStr.ketentuan = JSON.parse(payloadStr.ketentuan || "[]");
    if (typeof payloadStr.catatan_design === "string") payloadStr.catatan_design = JSON.parse(payloadStr.catatan_design || "[]");
    if (typeof payloadStr.fasilitas === "string") payloadStr.fasilitas = JSON.parse(payloadStr.fasilitas || "[]");

    const payload = resubmitProjekPlanningSchema.parse(payloadStr);
    await assertProjectPlanningActionAccess(req, id, isCoordinatorRole);
    const files = req.files as Express.Multer.File[] | undefined;
    const result = await projekPlanningService.resubmit(id, payload, files);

    res.json({
        status: "success",
        message: "Pengajuan FPD berhasil di-resubmit dan diteruskan kembali ke B&M Manager",
        data: result,
    });
});

// ============================================================
// LIST
// ============================================================

export const listProjekPlanning = asyncHandler(async (req: Request, res: Response) => {
    const user = assertProjectPlanningRole(req);
    let query = listProjekPlanningQuerySchema.parse(req.query);
    query = await injectBranchFilter(user, query);

    // PP Specialist & PP Manager: global access KHUSUS di Project Planning saja
    if ((isPpSpecialistRole(user.roles) || isPpManagerRole(user.roles)) && !isSuperHuman(user.roles)) {
        query.cabang_array = undefined;
        query._is_global_access = true;
    }

    // Regional Manager: filter by coverage branches, bukan global
    if (isBmRegionalRole(user.roles) && !isSuperHuman(user.roles) && !isPpSpecialistRole(user.roles) && !isPpManagerRole(user.roles)) {
        const coverage = await getUserCoverageBranches(user.email_sat, user.cabang);
        query.cabang_array = coverage.length > 0 ? coverage : [user.cabang];
        query._is_global_access = false;
    }

    if (isCoordinatorOnly(user.roles)) {
        query.email_pembuat = user.email_sat;
    }
    const data = await projekPlanningService.list(query);

    res.json({ status: "success", data });
});

export const getProjekPlanningTaskCounts = asyncHandler(async (req: Request, res: Response) => {
    const user = assertProjectPlanningRole(req);
    const scoped = await injectBranchFilter(user, {} as { cabang_array?: string[]; _is_global_access?: boolean });
    const data = await projekPlanningService.getTaskCounts({
        roles: user.roles,
        cabang: user.cabang,
        email: user.email_sat,
        cabang_array: scoped.cabang_array,
    });

    res.json({ status: "success", data });
});

export const getRabRequests = asyncHandler(async (req: Request, res: Response) => {
    const query = rabRequestQuerySchema.parse(req.query);
    const result = await projekPlanningService.listRabRequests(query.actor_email);
    res.json({ status: "success", ...result });
});

export const getRabPrefill = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }
    const query = rabPrefillQuerySchema.parse(req.query);
    const data = await projekPlanningService.getRabPrefill(id, query);
    res.json({ status: "success", data });
});

// ============================================================
// GET BY ID
// ============================================================

export const getProjekPlanningById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const data = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, data.projek.cabang);
    res.json({ status: "success", data });
});

export const handleProjekPlanningIntervention = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const user = assertProjectPlanningRole(req);
    if (!isSuperHuman(user.roles)) {
        throw new AppError("Hanya Super Human yang dapat melakukan intervensi Project Planning.", 403);
    }

    const action = projekPlanningInterventionSchema.parse(req.body);
    const result = await projekPlanningService.intervene(id, action);

    res.json({
        status: "success",
        message: "Intervensi Project Planning berhasil diproses",
        data: result,
    });
});

// ============================================================
// BM APPROVAL
// ============================================================

export const handleBmApproval = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertBmApprovalAccess(req, id);
    const action = approvalSchema.parse(req.body);
    const result = await projekPlanningService.bmApproval(id, action);

    res.json({
        status: "success",
        message: action.tindakan === "APPROVE"
            ? (result.new_status === "WAITING_BM_REGIONAL_APPROVAL"
                ? "Disetujui oleh BM Manager tahap 2, menunggu approval B&M Regional Manager"
                : "Disetujui oleh BM Manager, menunggu approval PP Specialist")
            : "Ditolak oleh BM Manager, dikembalikan ke Coordinator",
        data: result,
    });
});

export const handleBmRegionalApproval = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertProjectPlanningActionAccess(req, id, isBmRegionalRole);
    const action = finalReviewSchema.parse(req.body);
    const result = await projekPlanningService.bmRegionalApproval(id, action);

    res.json({
        status: "success",
        message: result.new_status === "WAITING_PP_APPROVAL_2"
            ? "Disetujui oleh B&M Regional Manager, menunggu approval PP Specialist"
            : "Ditolak oleh B&M Regional Manager, dikembalikan ke Building Coord untuk revisi tahap kedua",
        data: result,
    });
});

// ============================================================
// PP APPROVAL STAGE 1
// ============================================================

export const handlePpApproval1 = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertProjectPlanningActionAccess(req, id, isPpSpecialistRole);
    const action = ppApproval1Schema.parse(req.body);
    const result = await projekPlanningService.ppApproval1(id, action);

    let message = "Ditolak oleh PP Specialist, dikembalikan ke Coordinator dari awal";
    if (action.tindakan === "APPROVE") {
        message = action.butuh_desain_3d
            ? "Disetujui, PP Specialist perlu membuat desain 3D"
            : "Disetujui tanpa desain 3D, Cabang dapat mengupload RAB & Gambar Kerja";
    }

    res.json({ status: "success", message, data: result });
});

// ============================================================
// UPLOAD DESAIN 3D (PP Specialist)
// ============================================================

export const handleUpload3d = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertProjectPlanningActionAccess(req, id, isPpSpecialistRole);
    const payload = upload3dSchema.parse(req.body);
    const result = await projekPlanningService.upload3d(id, payload, req.file);

    res.json({
        status: "success",
        message: "Desain 3D berhasil diupload, menunggu RAB dari Cabang",
        data: result,
    });
});

// ============================================================
// UPLOAD RAB & GAMBAR KERJA (Coordinator/Cabang)
// ============================================================

export const handleUploadRab = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const payloadStr = req.body;
    if (typeof payloadStr.fasilitas === "string") payloadStr.fasilitas = JSON.parse(payloadStr.fasilitas);

    await assertProjectPlanningActionAccess(req, id, isCoordinatorRole);
    const payload = uploadRabSchema.parse(payloadStr);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const result = await projekPlanningService.uploadRab(id, payload, files);

    res.json({
        status: "success",
        message: result.new_status === "WAITING_BM_REGIONAL_APPROVAL"
            ? "Data tahap kedua berhasil dikirim, bypass approval B&M Manager, menunggu approval B&M Regional Manager"
            : "Data tahap kedua berhasil dikirim, menunggu approval B&M Manager tahap 2",
        data: result,
    });
});

// ============================================================
// PP APPROVAL STAGE 2 (PP Specialist, setelah RAB)
// ============================================================

export const handlePpApproval2 = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertProjectPlanningActionAccess(req, id, isPpSpecialistRole);
    const action = finalReviewSchema.parse(req.body);
    const result = await projekPlanningService.ppApproval2(id, action);

    res.json({
        status: "success",
        message: action.rab_tindakan === "APPROVE" && action.gambar_tindakan === "APPROVE"
            ? "Disetujui oleh PP Specialist, menunggu approval final PP Manager"
            : "Ditolak oleh PP Specialist, dikembalikan sesuai bagian yang perlu revisi",
        data: result,
    });
});

// ============================================================
// PP MANAGER APPROVAL (Tahap Final)
// ============================================================

export const handlePpManagerApproval = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    await assertProjectPlanningActionAccess(req, id, isPpManagerRole);
    const action = finalReviewSchema.parse(req.body);
    const result = await projekPlanningService.ppManagerApproval(id, action);

    res.json({
        status: "success",
        message: action.rab_tindakan === "APPROVE" && action.gambar_tindakan === "APPROVE"
            ? "Project planning selesai! FPD yang telah disetujui dikirim ke Cabang"
            : "Ditolak oleh PP Manager, dikembalikan sesuai bagian yang perlu revisi",
        data: result,
    });
});

// ============================================================
// GET LOGS (Audit Trail)
// ============================================================

export const getProjekPlanningLogs = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const detail = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, detail.projek.cabang);
    const logs = await projekPlanningService.getLogs(id);
    res.json({ status: "success", data: logs });
});

export const downloadPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const detail = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, detail.projek.cabang);
    const { buffer } = await projekPlanningService.generatePdfAndStoreLink(id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Project_Planning_${id}.pdf`);
    res.send(buffer);
});

export const downloadPhotosPdf = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const detail = await projekPlanningService.getById(id);
    await assertProjectPlanningBranchAccess(req, detail.projek.cabang);
    const buffer = await projekPlanningService.generatePhotosPdf(id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Project_Planning_Photos_${id}.pdf`);
    res.send(buffer);
});

// ============================================================
// PROXY FILE — stream GDrive file ke client (agar semua role bisa lihat/unduh)
// GET /:id/proxy-file?field=fpd|rab_sipil|rab_me|rab|gambar_kerja|desain_3d|fpd_approved|foto_item&item_index=N&mode=view|download
// ============================================================

export const proxyFile = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ status: "error", message: "ID tidak valid" });
        return;
    }

    const field = String(req.query.field || "");
    const itemIndex = req.query.item_index ? parseInt(String(req.query.item_index), 10) : undefined;
    const mode = String(req.query.mode || "view"); // "view" atau "download"

    const result = await projekPlanningService.getOne(id);
    if (!result) {
        res.status(404).json({ status: "error", message: "Projek tidak ditemukan" });
        return;
    }

    const projek = result;
    await assertProjectPlanningBranchAccess(req, projek.cabang);

    // Pilih URL berdasarkan field
    let fileUrl: string | null | undefined;
    if (field === "fpd") fileUrl = projek.link_fpd;
    else if (field === "siteplan") fileUrl = (projek as any).link_siteplan;
    else if (field === "ba_tidak_sesuai_standar") fileUrl = (projek as any).link_ba_tidak_sesuai_standar;
    // Dokumen form awal koordinator
    else if (field === "gambar_kerja_awal" || field === "gambar_kerja") fileUrl = projek.link_gambar_kerja;
    else if (field === "gambar_kompetitor") fileUrl = projek.link_gambar_kompetitor;
    // Dokumen PP Specialist
    else if (field === "desain_3d") fileUrl = projek.link_desain_3d;
    else if (field === "fpd_approved") fileUrl = projek.link_fpd_approved;
    // Dokumen RAB & Final (koordinator — setelah PP Specialist approve)
    else if (field === "rab_sipil_final") fileUrl = (projek as any).link_rab_sipil;
    else if (field === "rab_me_final") fileUrl = (projek as any).link_rab_me;
    else if (field === "gambar_kerja_final_sipil") fileUrl = (projek as any).link_gambar_kerja_final_sipil;
    else if (field === "gambar_kerja_final_me") fileUrl = (projek as any).link_gambar_kerja_final_me;
    // Legacy
    else if (field === "rab") fileUrl = projek.link_rab;
    else if (field === "foto_item" && itemIndex !== undefined) {
        const fotoItem = (projek.foto_items || []).find((f: any) => f.item_index === itemIndex);
        fileUrl = fotoItem?.link_foto;
    }

    if (!fileUrl) {
        res.status(404).json({ status: "error", message: "File tidak ditemukan" });
        return;
    }

    const fileIndex = req.query.file_index ? parseInt(String(req.query.file_index), 10) : 0;
    const fileLinks = String(fileUrl).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    fileUrl = fileLinks[fileIndex] || fileLinks[0];

    // Ekstrak fileId dari URL GDrive
    const { extractGdriveFileId } = await import("./project-planning.pdf");
    const fileId = extractGdriveFileId(fileUrl);

    if (!fileId) {
        // Bukan URL GDrive — kembalikan status redirect agar frontend menangani via window.open
        res.status(400).json({ status: "redirect", url: fileUrl, message: "Bukan URL GDrive. Redirect manual." });
        return;
    }

    const { GoogleProvider } = await import("../../common/google");
    const drive = GoogleProvider.instance.docDrive;
    const spartaDrive = GoogleProvider.instance.spartaDrive;
    if (!drive && !spartaDrive) {
        res.status(503).json({ status: "error", message: "Layanan Drive belum siap" });
        return;
    }

    // Ambil metadata file
    let mimeType = "application/octet-stream";
    let fileName = `file_${field}_${id}`;
    let fileSize = 0;
    try {
        if (!drive) throw new Error("docDrive unavailable");
        const meta = await drive.files.get({ fileId, fields: "name, mimeType, size", supportsAllDrives: true });
        if (meta.data.name) fileName = meta.data.name;
        if (meta.data.mimeType) mimeType = meta.data.mimeType;
        if (meta.data.size) fileSize = parseInt(meta.data.size, 10);
    } catch {
        try {
            if (!spartaDrive) throw new Error("spartaDrive unavailable");
            const meta = await spartaDrive.files.get({ fileId, fields: "name, mimeType, size", supportsAllDrives: true });
            if (meta.data.name) fileName = meta.data.name;
            if (meta.data.mimeType) mimeType = meta.data.mimeType;
            if (meta.data.size) fileSize = parseInt(meta.data.size, 10);
        } catch {
            // ignore, gunakan default
        }
    }

    const safeAsciiName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const encodedName = encodeURIComponent(fileName);

    // Stream file untuk menghindari Out Of Memory (OOM) dan render timeout
    let stream = drive ? await GoogleProvider.instance.getFileStreamById(drive, fileId) : null;
    if (!stream && spartaDrive) {
        stream = await GoogleProvider.instance.getFileStreamById(spartaDrive, fileId);
    }

    if (stream) {
        res.setHeader("Content-Type", mimeType);
        res.setHeader(
            "Content-Disposition",
            mode === "download"
                ? `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`
                : `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`
        );
        if (fileSize) {
            res.setHeader("Content-Length", fileSize);
        }
        stream.pipe(res);
        return;
    }

    // Jika file gagal di-stream (misal ukuran file terlalu kecil atau restriksi), fallback ke stream public
    const publicData = await fetchPublicDriveStream(fileId);
    if (!publicData) {
        // Fallback: biarkan frontend membuka URL aslinya saja langsung ke GDrive
        // Jika file terlalu besar (kena virus scan) atau terproteksi, browser user bisa menanganinya
        res.status(400).json({ status: "redirect", url: fileUrl, message: "Gagal mem-proxy file. Redirect ke link asli Google Drive." });
        return;
    }

    res.setHeader("Content-Type", publicData.contentType || mimeType);
    res.setHeader(
        "Content-Disposition",
        mode === "download"
            ? `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`
            : `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`
    );
    if (publicData.contentLength) {
        res.setHeader("Content-Length", publicData.contentLength);
    }
    publicData.stream.pipe(res);
});
