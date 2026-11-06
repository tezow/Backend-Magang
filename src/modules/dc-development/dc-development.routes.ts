import { Router } from "express";
import multer from "multer";
import {
    advanceDcProjectStage,
    createDcArchiveProject,
    createDcDocumentCustomItem,
    createDcProject,
    createDcDocument,
    createDcTender,
    createDcVendor,
    createDcVendorUser,
    deleteDcDocument,
    deleteDcDocumentCustomItem,
    downloadDcDocument,
    getDcDocumentDetail,
    getDcProjectById,
    listDcArchiveProjects,
    listDcDocumentCustomItems,
    listDcApprovals,
    listDcDocuments,
    listDcProjects,
    listDcVendors,
    updateDcDocument,
    viewDcDocument,
    listDcTenders,
    getDcTenderById,
    inviteDcTenderParticipant,
    submitDcTenderSubmission,
    setDcTenderWinner,
    listDcProjectTimelines,
    addDcProjectTimeline,
    updateDcProjectTimeline,
    listDcProjectIssues,
    addDcProjectIssue,
    updateDcProjectIssue,
    listDcProjectBast,
    createDcProjectBast,
    updateDcProjectBast,
    listDcParticipantTerms,
    addDcTermSchedule,
    submitDcTermClaim,
    exportDcDocumentsCsv,
    exportDcDocumentsExcel,
    exportDcDocumentsPdf,
    exportGlobalDcDocumentsCsv,
    exportGlobalDcDocumentsExcel,
    exportGlobalDcDocumentsPdf,
    logDcCategoryEdit,
    listDcCategoryEditLogs,
    compressDcDocument
} from "./dc-development.controller";
import { DC_ROLES } from "./dc-development.constants";

const dcDevelopmentRouter = Router();
const dcDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
    }
});

const hasRole = (roles: string[] | undefined, roleName: string) =>
    roles?.some((role) => role.trim().toUpperCase() === roleName) ?? false;

const isDcDocumentPath = (path: string) =>
    path === "/archive-projects"
    || path.startsWith("/archive-projects/")
    || path === "/documents"
    || path.startsWith("/documents/")
    || path.startsWith("/custom-document-items/");

dcDevelopmentRouter.use((req, res, next) => {
    const roles = req.user?.roles;
    if (
        hasRole(roles, DC_ROLES.DC_DOCUMENT_ADMIN)
        && !hasRole(roles, DC_ROLES.SUPER_HUMAN)
        && !isDcDocumentPath(req.path)
    ) {
        res.status(403).json({
            status: "error",
            message: "Akun DC Document Admin hanya dapat mengakses Penyimpanan Dokumen DC."
        });
        return;
    }
    next();
});

dcDevelopmentRouter.get("/projects", listDcProjects);
dcDevelopmentRouter.post("/projects", createDcProject);
dcDevelopmentRouter.get("/projects/:id", getDcProjectById);
dcDevelopmentRouter.post("/projects/:id/advance-stage", advanceDcProjectStage);
dcDevelopmentRouter.post("/projects/:id/tenders", createDcTender);
dcDevelopmentRouter.get("/projects/:id/timeline", listDcProjectTimelines);
dcDevelopmentRouter.post("/projects/:id/timeline", addDcProjectTimeline);
dcDevelopmentRouter.put("/projects/:id/timeline/:taskId", updateDcProjectTimeline);
dcDevelopmentRouter.get("/projects/:id/issues", listDcProjectIssues);
dcDevelopmentRouter.post("/projects/:id/issues", addDcProjectIssue);
dcDevelopmentRouter.put("/projects/:id/issues/:issueId", updateDcProjectIssue);

dcDevelopmentRouter.get("/projects/:id/export/csv", exportDcDocumentsCsv);
dcDevelopmentRouter.get("/projects/:id/export/excel", exportDcDocumentsExcel);
dcDevelopmentRouter.get("/projects/:id/export/pdf", exportDcDocumentsPdf);

dcDevelopmentRouter.get("/archive-projects/export/csv", exportGlobalDcDocumentsCsv);
dcDevelopmentRouter.get("/archive-projects/export/excel", exportGlobalDcDocumentsExcel);
dcDevelopmentRouter.get("/archive-projects/export/pdf", exportGlobalDcDocumentsPdf);

dcDevelopmentRouter.get("/projects/:id/bast", listDcProjectBast);
dcDevelopmentRouter.post("/projects/:id/bast", createDcProjectBast);
dcDevelopmentRouter.put("/projects/:id/bast/:bastId", updateDcProjectBast);

dcDevelopmentRouter.get("/tenders", listDcTenders);
dcDevelopmentRouter.get("/tenders/:id", getDcTenderById);
dcDevelopmentRouter.post("/tenders/:id/participants", inviteDcTenderParticipant);
dcDevelopmentRouter.post("/tenders/:id/submissions", submitDcTenderSubmission);
dcDevelopmentRouter.post("/tenders/:id/winner", setDcTenderWinner);

dcDevelopmentRouter.get("/tenders/participants/:participantId/terms", listDcParticipantTerms);
dcDevelopmentRouter.post("/tenders/participants/:participantId/terms", addDcTermSchedule);
dcDevelopmentRouter.post("/tenders/participants/terms/:termId/claim", submitDcTermClaim);

dcDevelopmentRouter.get("/archive-projects", listDcArchiveProjects);
dcDevelopmentRouter.post("/archive-projects", createDcArchiveProject);
dcDevelopmentRouter.get("/archive-projects/:id/custom-document-items", listDcDocumentCustomItems);
dcDevelopmentRouter.post("/archive-projects/:id/custom-document-items", createDcDocumentCustomItem);
dcDevelopmentRouter.post("/archive-projects/:id/category-log", logDcCategoryEdit);
dcDevelopmentRouter.get("/archive-projects/:id/category-logs", listDcCategoryEditLogs);
dcDevelopmentRouter.delete("/custom-document-items/:itemId", deleteDcDocumentCustomItem);

dcDevelopmentRouter.get("/vendors", listDcVendors);
dcDevelopmentRouter.post("/vendors", createDcVendor);
dcDevelopmentRouter.post("/vendors/:id/users", createDcVendorUser);

dcDevelopmentRouter.get("/approvals", listDcApprovals);

dcDevelopmentRouter.get("/documents", listDcDocuments);
dcDevelopmentRouter.post("/documents/compress", dcDocumentUpload.single("file"), compressDcDocument);
dcDevelopmentRouter.post("/documents", dcDocumentUpload.any(), createDcDocument);
dcDevelopmentRouter.get("/documents/:id", getDcDocumentDetail);
dcDevelopmentRouter.put("/documents/:id", dcDocumentUpload.any(), updateDcDocument);
dcDevelopmentRouter.delete("/documents/:id", deleteDcDocument);
dcDevelopmentRouter.get("/documents/:id/view", viewDcDocument);
dcDevelopmentRouter.get("/documents/:id/download", downloadDcDocument);

export { dcDevelopmentRouter };
