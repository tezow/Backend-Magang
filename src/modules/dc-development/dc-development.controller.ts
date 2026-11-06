import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { compressDocumentBuffer } from "./dc-document.compressor";
import {
    advanceDcProjectStageSchema,
    createDcProjectSchema,
    createDcArchiveProjectSchema,
    createDcTenderSchema,
    createDcVendorSchema,
    createDcVendorUserSchema,
    createDcDocumentSchema,
    createDcDocumentCustomItemSchema,
    dcDocumentCustomItemListQuerySchema,
    deleteDcDocumentCustomItemSchema,
    dcDocumentActorQuerySchema,
    dcApprovalListQuerySchema,
    dcArchiveProjectListQuerySchema,
    dcDocumentListQuerySchema,
    dcProjectListQuerySchema,
    dcTenderListQuerySchema,
    inviteDcTenderParticipantSchema,
    submitDcTenderSubmissionSchema,
    setDcTenderWinnerSchema,
    createDcTimelineSchema,
    updateDcTimelineSchema,
    createDcIssueSchema,
    updateDcIssueSchema,
    createDcBastSchema,
    updateDcBastSchema,
    createDcTermScheduleSchema,
    submitDcTermClaimSchema,
    updateDcDocumentSchema,
    dcCategoryLogListQuerySchema,
    logDcCategoryEditSchema
} from "./dc-development.schema";
import { dcDevelopmentService, type UploadedDcDocumentFile } from "./dc-development.service";

const getUploadedFiles = (req: Request): UploadedDcDocumentFile[] => {
    const files = req.files as UploadedDcDocumentFile[] | undefined;
    return files ?? [];
};

const getSessionActor = (req: Request) => {
    if (!req.user) return null;
    const actorRole = req.user.roles.length ? req.user.roles.join(",") : req.user.jabatan;
    return {
        actor_email: req.user.email_sat,
        actor_role: actorRole || "USER"
    };
};

const withSessionActor = <T extends { actor_email: string; actor_role: string }>(req: Request, input: T): T => {
    const sessionActor = getSessionActor(req);
    return sessionActor ? { ...input, ...sessionActor } : input;
};

export const listDcProjects = asyncHandler(async (req: Request, res: Response) => {
    const query = dcProjectListQuerySchema.parse(req.query);
    const data = await dcDevelopmentService.listProjects(query);
    res.json({ status: "success", data });
});

export const listDcArchiveProjects = asyncHandler(async (req: Request, res: Response) => {
    const query = withSessionActor(req, dcArchiveProjectListQuerySchema.parse(req.query));
    const data = await dcDevelopmentService.listArchiveProjects(query);
    res.json({ status: "success", data });
});

export const createDcArchiveProject = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, createDcArchiveProjectSchema.parse(req.body));
    const data = await dcDevelopmentService.createArchiveProject(input);
    res.status(201).json({
        status: "success",
        message: "Data arsip dokumen DC berhasil dibuat",
        data
    });
});

export const listDcDocumentCustomItems = asyncHandler(async (req: Request, res: Response) => {
    const query = withSessionActor(req, dcDocumentCustomItemListQuerySchema.parse(req.query));
    const data = await dcDevelopmentService.listCustomDocumentItems(req.params.id, query);
    res.json({ status: "success", data });
});

export const createDcDocumentCustomItem = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, createDcDocumentCustomItemSchema.parse(req.body));
    const data = await dcDevelopmentService.createCustomDocumentItem(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "Item dokumen tambahan berhasil dibuat",
        data
    });
});

export const deleteDcDocumentCustomItem = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, deleteDcDocumentCustomItemSchema.parse(req.query));
    const data = await dcDevelopmentService.deleteCustomDocumentItem(req.params.itemId, input);
    res.json({
        status: "success",
        message: "Item dokumen tambahan berhasil dihapus",
        data
    });
});

export const logDcCategoryEdit = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, logDcCategoryEditSchema.parse(req.body));
    const data = await dcDevelopmentService.logCategoryEdit(req.params.id, input);
    res.json({
        status: "success",
        message: "Riwayat edit kategori berhasil dicatat",
        data
    });
});

export const listDcCategoryEditLogs = asyncHandler(async (req: Request, res: Response) => {
    const query = dcCategoryLogListQuerySchema.parse(req.query);
    const data = await dcDevelopmentService.listCategoryEditLogs(req.params.id, query);
    res.json({ status: "success", data });
});

export const createDcProject = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcProjectSchema.parse(req.body);
    const data = await dcDevelopmentService.createProject(input);
    res.status(201).json({
        status: "success",
        message: "Project DC berhasil dibuat",
        data
    });
});

export const getDcProjectById = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.getProjectById(req.params.id);
    res.json({ status: "success", data });
});

export const advanceDcProjectStage = asyncHandler(async (req: Request, res: Response) => {
    const input = advanceDcProjectStageSchema.parse(req.body);
    const data = await dcDevelopmentService.advanceProjectStage(req.params.id, input);
    res.json({
        status: "success",
        message: "Stage project DC berhasil diperbarui",
        data
    });
});

export const createDcTender = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcTenderSchema.parse(req.body);
    const data = await dcDevelopmentService.createTender(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "Tender DC berhasil dibuat",
        data
    });
});

export const listDcTenders = asyncHandler(async (req: Request, res: Response) => {
    const query = dcTenderListQuerySchema.parse(req.query);
    const data = await dcDevelopmentService.listTenders(query);
    res.json({ status: "success", data });
});

export const getDcTenderById = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.getTenderById(req.params.id);
    res.json({ status: "success", data });
});

export const inviteDcTenderParticipant = asyncHandler(async (req: Request, res: Response) => {
    const input = inviteDcTenderParticipantSchema.parse(req.body);
    const data = await dcDevelopmentService.inviteTenderParticipant(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "Vendor berhasil diundang ke tender",
        data
    });
});

export const submitDcTenderSubmission = asyncHandler(async (req: Request, res: Response) => {
    const input = submitDcTenderSubmissionSchema.parse(req.body);
    // Allow participant_id from body if exists (for internal user testing)
    const data = await dcDevelopmentService.submitTenderSubmission(req.params.id, { ...input, participant_id: req.body.participant_id });
    res.status(201).json({
        status: "success",
        message: "Penawaran tender berhasil disubmit",
        data
    });
});

export const setDcTenderWinner = asyncHandler(async (req: Request, res: Response) => {
    const input = setDcTenderWinnerSchema.parse(req.body);
    const data = await dcDevelopmentService.setTenderWinner(req.params.id, input);
    res.json({
        status: "success",
        message: "Pemenang tender berhasil ditetapkan",
        data
    });
});

export const listDcProjectTimelines = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.listProjectTimelines(req.params.id);
    res.json({ status: "success", data });
});

export const addDcProjectTimeline = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcTimelineSchema.parse(req.body);
    const data = await dcDevelopmentService.addProjectTimeline(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "Task timeline berhasil ditambahkan",
        data
    });
});

export const updateDcProjectTimeline = asyncHandler(async (req: Request, res: Response) => {
    const input = updateDcTimelineSchema.parse(req.body);
    const data = await dcDevelopmentService.updateProjectTimeline(req.params.taskId, input);
    res.json({
        status: "success",
        message: "Task timeline berhasil diupdate",
        data
    });
});

export const listDcProjectIssues = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.listProjectIssues(req.params.id);
    res.json({ status: "success", data });
});

export const addDcProjectIssue = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcIssueSchema.parse(req.body);
    const data = await dcDevelopmentService.addProjectIssue(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "Issue berhasil dilaporkan",
        data
    });
});

export const updateDcProjectIssue = asyncHandler(async (req: Request, res: Response) => {
    const input = updateDcIssueSchema.parse(req.body);
    const data = await dcDevelopmentService.updateProjectIssue(req.params.issueId, input);
    res.json({
        status: "success",
        message: "Issue berhasil diupdate",
        data
    });
});

export const listDcProjectBast = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.listProjectBast(req.params.id);
    res.json({ status: "success", data });
});

export const createDcProjectBast = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcBastSchema.parse(req.body);
    const data = await dcDevelopmentService.createProjectBast(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "BAST berhasil dibuat",
        data
    });
});

export const updateDcProjectBast = asyncHandler(async (req: Request, res: Response) => {
    const input = updateDcBastSchema.parse(req.body);
    const data = await dcDevelopmentService.updateProjectBast(req.params.bastId, input);
    res.json({
        status: "success",
        message: "BAST berhasil diupdate",
        data
    });
});

export const listDcParticipantTerms = asyncHandler(async (req: Request, res: Response) => {
    const data = await dcDevelopmentService.listParticipantTerms(req.params.participantId);
    res.json({ status: "success", data });
});

export const addDcTermSchedule = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcTermScheduleSchema.parse(req.body);
    const data = await dcDevelopmentService.addTermSchedule(req.params.participantId, input);
    res.status(201).json({
        status: "success",
        message: "Jadwal Termin berhasil ditambahkan",
        data
    });
});

export const submitDcTermClaim = asyncHandler(async (req: Request, res: Response) => {
    const input = submitDcTermClaimSchema.parse(req.body);
    const data = await dcDevelopmentService.submitTermClaim(req.params.termId, input);
    res.status(201).json({
        status: "success",
        message: "Klaim Termin berhasil diajukan",
        data
    });
});

export const listDcVendors = asyncHandler(async (_req: Request, res: Response) => {
    const data = await dcDevelopmentService.listVendors();
    res.json({ status: "success", data });
});

export const createDcVendor = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcVendorSchema.parse(req.body);
    const data = await dcDevelopmentService.createVendor(input);
    res.status(201).json({
        status: "success",
        message: "Vendor DC berhasil dibuat",
        data
    });
});

export const createDcVendorUser = asyncHandler(async (req: Request, res: Response) => {
    const input = createDcVendorUserSchema.parse(req.body);
    const data = await dcDevelopmentService.createVendorUser(req.params.id, input);
    res.status(201).json({
        status: "success",
        message: "User vendor DC berhasil dibuat",
        data
    });
});

export const listDcApprovals = asyncHandler(async (req: Request, res: Response) => {
    const query = dcApprovalListQuerySchema.parse(req.query);
    const data = await dcDevelopmentService.listApprovals(query);
    res.json({ status: "success", data });
});

export const listDcDocuments = asyncHandler(async (req: Request, res: Response) => {
    const query = withSessionActor(req, dcDocumentListQuerySchema.parse(req.query));
    const data = await dcDevelopmentService.listDocuments(query);
    res.json({ status: "success", data });
});

export const createDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, createDcDocumentSchema.parse(req.body));
    const data = await dcDevelopmentService.createDocument(input, getUploadedFiles(req));
    res.status(201).json({
        status: "success",
        message: "Dokumen DC berhasil disimpan",
        data
    });
});

export const getDcDocumentDetail = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const data = await dcDevelopmentService.getDocumentDetail(req.params.id, actor);
    res.json({ status: "success", data });
});

export const updateDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const input = withSessionActor(req, updateDcDocumentSchema.parse(req.body));
    const data = await dcDevelopmentService.updateDocument(req.params.id, input, getUploadedFiles(req));
    res.json({
        status: "success",
        message: "Dokumen DC berhasil diperbarui",
        data
    });
});

export const deleteDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const data = await dcDevelopmentService.deleteDocument(req.params.id, actor);
    res.json({
        status: "success",
        message: "Dokumen DC berhasil dihapus",
        data
    });
});

export const viewDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const sessionActor = getSessionActor(req);
    const actor = {
        actor_email: (req.query.actor_email as string) || sessionActor?.actor_email || "",
        actor_role: (req.query.actor_role as string) || sessionActor?.actor_role || ""
    };
    const file = await dcDevelopmentService.streamDocumentFile(req.params.id, actor);
    if (!file.stream && file.link) {
        res.redirect(302, file.link);
        return;
    }
    if (!file.stream) {
        res.status(404).json({ status: "error", message: "File dokumen DC tidak ditemukan" });
        return;
    }

    const fileName = file.document.file_name || "dokumen-dc";
    const safeAsciiName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const encodedName = encodeURIComponent(fileName);

    res.setHeader("Content-Type", file.document.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Cache-Control", "public, max-age=3600");

    file.stream.on("error", (error: any) => {
        console.error(`[viewDcDocument] Stream error for document ${req.params.id}:`, error);
        if (!res.headersSent) {
            if (file.link) {
                res.redirect(302, file.link);
                return;
            }
            res.status(500).json({ status: "error", message: "Gagal mengalirkan dokumen dari Drive" });
        }
    });

    file.stream.pipe(res);
});

export const downloadDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const sessionActor = getSessionActor(req);
    const actor = {
        actor_email: (req.query.actor_email as string) || sessionActor?.actor_email || "",
        actor_role: (req.query.actor_role as string) || sessionActor?.actor_role || ""
    };
    const file = await dcDevelopmentService.streamDocumentFile(req.params.id, actor);
    if (!file.stream && file.link) {
        res.redirect(302, file.link);
        return;
    }
    if (!file.stream) {
        res.status(404).json({ status: "error", message: "File dokumen DC tidak ditemukan" });
        return;
    }

    const fileName = file.document.file_name || "dokumen-dc";
    const safeAsciiName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const encodedName = encodeURIComponent(fileName);

    res.setHeader("Content-Type", file.document.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    file.stream.on("error", (error: any) => {
        console.error(`[downloadDcDocument] Stream error for document ${req.params.id}:`, error);
        if (!res.headersSent) {
            if (file.link) {
                res.redirect(302, file.link);
                return;
            }
            res.status(500).json({ status: "error", message: "Gagal mengalirkan dokumen dari Drive" });
        }
    });

    file.stream.pipe(res);
});

export const exportDcDocumentsCsv = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const result = await dcDevelopmentService.exportDcDocuments(req.params.id, actor, "csv", actor.stage);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const exportDcDocumentsExcel = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const result = await dcDevelopmentService.exportDcDocuments(req.params.id, actor, "excel", actor.stage);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const exportDcDocumentsPdf = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const result = await dcDevelopmentService.exportDcDocuments(req.params.id, actor, "pdf", actor.stage);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const exportGlobalDcDocumentsCsv = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const query = dcArchiveProjectListQuerySchema.parse(req.query);
    const result = await dcDevelopmentService.exportGlobalDcDocuments(query, actor, "csv");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const exportGlobalDcDocumentsExcel = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const query = dcArchiveProjectListQuerySchema.parse(req.query);
    const result = await dcDevelopmentService.exportGlobalDcDocuments(query, actor, "excel");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const exportGlobalDcDocumentsPdf = asyncHandler(async (req: Request, res: Response) => {
    const actor = withSessionActor(req, dcDocumentActorQuerySchema.parse(req.query));
    const query = dcArchiveProjectListQuerySchema.parse(req.query);
    const result = await dcDevelopmentService.exportGlobalDcDocuments(query, actor, "pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
});

export const compressDcDocument = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ status: "error", message: "File dokumen wajib diunggah" });
        return;
    }

    const result = await compressDocumentBuffer(
        file.buffer,
        file.originalname,
        file.mimetype
    );

    res.setHeader("X-Original-Size", result.originalSize.toString());
    res.setHeader("X-Compressed-Size", result.compressedSize.toString());
    res.setHeader("X-Ratio-Percent", result.ratioPercent.toString());
    res.setHeader("Access-Control-Expose-Headers", "X-Original-Size, X-Compressed-Size, X-Ratio-Percent, Content-Disposition");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalname)}"`);
    res.setHeader("Content-Type", result.mimeType);
    res.send(result.buffer);
});
