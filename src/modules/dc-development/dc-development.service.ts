import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { DC_MEMBER_ACCESS_LEVEL, DC_PROJECT_STAGE_SEQUENCE, DC_ROLES, type DcMemberAccessLevel } from "./dc-development.constants";
import * as xlsx from "xlsx";
import { dcDevelopmentRepository, type DcDocumentCustomItemRow, type DcDocumentRow } from "./dc-development.repository";
import { DC_DOCUMENT_CONFIG, getDcDocumentConfigForStage } from "./dc-document.config";
import { buildDcDocumentReportPdfBuffer, buildGlobalDcDocumentReportPdfBuffer, type PdfStage, type PdfStageItem } from "./dc-development.pdf";
import type {
    AdvanceDcProjectStageInput,
    CreateDcArchiveProjectInput,
    CreateDcDocumentInput,
    CreateDcDocumentCustomItemInput,
    DeleteDcDocumentCustomItemInput,
    DcDocumentCustomItemListQuery,
    CreateDcProjectInput,
    CreateDcTenderInput,
    CreateDcVendorInput,
    CreateDcVendorUserInput,
    DcApprovalListQuery,
    DcArchiveProjectListQuery,
    DcDocumentActorQuery,
    DcDocumentListQuery,
    DcProjectListQuery,
    UpdateDcDocumentInput,
    dcCategoryLogListQuerySchema,
    logDcCategoryEditSchema
} from "./dc-development.schema";
import type { z } from "zod";

export type UploadedDcDocumentFile = Express.Multer.File;

const MAX_UPLOAD_CONCURRENCY = 3;
const RESUMABLE_THRESHOLD_BYTES = 10 * 1024 * 1024;

const accessRank: Record<DcMemberAccessLevel, number> = {
    VIEW: 1,
    UPLOAD: 2,
    MANAGE: 3
};

const hasSuperHumanRole = (role?: string | null): boolean =>
    String(role ?? "").toUpperCase().includes(DC_ROLES.SUPER_HUMAN);

const hasDcDocumentAdminRole = (role?: string | null): boolean =>
    String(role ?? "").toUpperCase().includes(DC_ROLES.DC_DOCUMENT_ADMIN);

const canBypassDocumentAccess = (role?: string | null): boolean => {
    const normalized = String(role ?? "").toUpperCase();
    return hasSuperHumanRole(normalized) 
        || hasDcDocumentAdminRole(normalized)
        || normalized.includes(DC_ROLES.DC_SPECIALIST);
};

const canCreateArchiveProject = (role?: string | null): boolean => {
    const normalized = String(role ?? "").toUpperCase();
    return hasSuperHumanRole(normalized)
        || hasDcDocumentAdminRole(normalized)
        || normalized.includes(DC_ROLES.DC_MANAGER)
        || normalized.includes(DC_ROLES.DC_SPECIALIST);
};

const sanitizeFilenamePart = (value: string | null | undefined, fallback: string): string => {
    const normalized = String(value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedDcDocumentFile): string => {
    const rawName = file.originalname ?? "";
    const lastDot = rawName.lastIndexOf(".");
    if (lastDot > 0 && lastDot < rawName.length - 1) {
        const ext = rawName.slice(lastDot).toLowerCase();
        if (/^\.[a-z0-9]{1,10}$/.test(ext)) return ext;
    }
    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "application/msword") return ".doc";
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
    if (file.mimetype === "application/vnd.ms-excel") return ".xls";
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    if (file.mimetype === "image/webp") return ".webp";
    return ".bin";
};

const resolveDriveLink = (fileId?: string | null, webViewLink?: string | null): string => {
    if (webViewLink) return webViewLink;
    if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
    return "";
};

const buildFolderLink = (folderId: string) => `https://drive.google.com/drive/folders/${folderId}`;

const runWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    handler: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
            const current = nextIndex;
            nextIndex += 1;
            if (current >= items.length) return;
            results[current] = await handler(items[current], current);
        }
    }));
    return results;
};

const ensureDcDocDriveReady = () => {
    const root = env.DC_DOC_DRIVE_ROOT_ID || env.DOC_DRIVE_ROOT_ID;
    if (!root) throw new AppError("DC_DOC_DRIVE_ROOT_ID atau DOC_DRIVE_ROOT_ID belum diset", 500);
    return { gp: GoogleProvider.instance, root };
};

const ensureAccess = async (
    projectId: number,
    actor: { email: string; role: string },
    required: DcMemberAccessLevel
) => {
    if (canBypassDocumentAccess(actor.role)) return;
    const member = await dcDevelopmentRepository.findProjectMember(projectId, actor.email);
    if (!member || accessRank[member.access_level] < accessRank[required]) {
        throw new AppError("Anda tidak terlibat atau tidak memiliki akses ke dokumen DC ini", 403);
    }
};

const resolveDocHierarchy = (documentType: string) => {
    const match = documentType.match(/^([a-zA-Z_0-9]+)__([a-zA-Z_0-9]+)$/);
    if (!match) return { utama: "Lainnya", jenis: documentType };
    const jenisKey = match[1];

    for (const utama of DC_DOCUMENT_CONFIG) {
        for (const detail of utama.details) {
            for (const jenis of detail.jenis) {
                if (jenis.key === jenisKey) {
                    return { utama: utama.title, jenis: jenis.title };
                }
            }
        }
    }
    return { utama: "Lainnya", jenis: documentType };
};

const uploadFilesToDrive = async (
    input: CreateDcDocumentInput,
    project: any,
    files: UploadedDcDocumentFile[]
) => {
    const { gp } = ensureDcDocDriveReady();

    const projectNameOverride = `${project.project_code} - ${project.project_name} - ${project.branch_name || "UNKNOWN"}`;

    const processFolder = await gp.getOrCreateProcessFolder(
        "Penyimpanan Dokumen DC",
        null,
        project.project_name,
        project.project_code,
        project.branch_name,
        "DC Development",
        projectNameOverride
    );

    const stageName = input.stage ?? input.entity_type;
    const stageFolder = await gp.getOrCreateFolder(
        sanitizeFilenamePart(stageName, "PROJECT"),
        processFolder
    );

    const docHierarchy = resolveDocHierarchy(input.document_type);

    const utamaFolder = await gp.getOrCreateFolder(
        sanitizeFilenamePart(docHierarchy.utama, "KATEGORI"),
        stageFolder
    );

    const documentFolder = await gp.getOrCreateFolder(
        sanitizeFilenamePart(docHierarchy.jenis, "DOKUMEN"),
        utamaFolder
    );

    const folderLink = buildFolderLink(documentFolder);
    const safeDoc = sanitizeFilenamePart(docHierarchy.jenis, "DOKUMEN");
    const safeProject = sanitizeFilenamePart(project.project_code, "DC");
    const timestamp = Date.now();

    return runWithConcurrency(files, MAX_UPLOAD_CONCURRENCY, async (file, index) => {
        const ext = resolveFileExtension(file);
        const filename = `${safeDoc}_${safeProject}_${timestamp}_${index + 1}${ext}`;
        const mimeType = file.mimetype || "application/octet-stream";
        const useResumable = (file.size ?? 0) >= RESUMABLE_THRESHOLD_BYTES;
        const uploaded = useResumable
            ? await gp.uploadFileResumable(documentFolder, filename, mimeType, file.buffer, undefined, undefined, { makePublic: false })
            : await gp.uploadFile(documentFolder, filename, mimeType, file.buffer, undefined, undefined, { makePublic: false });
        const link = resolveDriveLink(uploaded.id ?? null, uploaded.webViewLink ?? null);
        if (!uploaded.id || !link) throw new AppError("Upload dokumen DC ke Google Drive gagal", 500);

        return {
            drive_file_id: uploaded.id,
            drive_folder_id: documentFolder,
            link_dokumen: link,
            link_folder: folderLink,
            file_name: file.originalname || filename,
            mime_type: mimeType,
            size_bytes: file.size ?? null,
            notes: input.notes ?? null,
            uploaded_by_email: input.actor_email,
            uploaded_by_role: input.actor_role
        };
    });
};

type DcExportFormat = "csv" | "excel" | "pdf";

type DcExportStageKey = "PEMBANGUNAN" | "RENOVASI" | "PERLUASAN";

const DC_EXPORT_STAGES: Array<{ key: DcExportStageKey; label: string }> = [
    { key: "PEMBANGUNAN", label: "Pembangunan" },
    { key: "RENOVASI", label: "Renovasi" },
    { key: "PERLUASAN", label: "Perluasan" }
];

const normalizeDcExportStage = (stage?: string | null): DcExportStageKey | null => {
    const normalized = String(stage ?? "").trim().toUpperCase();
    if (normalized === "PEMBANGUNAN") return "PEMBANGUNAN";
    if (normalized === "RENOVASI") return "RENOVASI";
    if (normalized === "PERLUASAN") return "PERLUASAN";
    return null;
};

const resolveDcExportStages = (stage?: string | null) => {
    const normalized = normalizeDcExportStage(stage);
    return normalized
        ? DC_EXPORT_STAGES.filter((item) => item.key === normalized)
        : DC_EXPORT_STAGES;
};

const formatDcDocumentType = (jenisKey: string, slotType: string): string =>
    `${jenisKey}__${slotType.replace(/\//g, "_")}`;

type DcDocumentExportRow = {
    "No": number;
    "Kode Proyek": string;
    "Nama Proyek": string;
    "DC Induk": string;
    "Tipe Proyek": string;
    "Tahap": string;
    "Kategori Utama": string;
    "Catatan Kategori Utama": string;
    "Sub Kategori": string;
    "Jenis Dokumen": string;
    "Format Dokumen": string;
    "Status": string;
    "Catatan": string;
    linkDriveArray: string[];
};

const applyDcWorksheetFormatting = (worksheet: xlsx.WorkSheet, rows: any[], maxLinks: number) => {
    const cols = [
        { wch: 6 },
        { wch: 16 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 28 },
        { wch: 18 },
        { wch: 16 },
        { wch: 24 },
        { wch: 14 },
        { wch: 10 },
        { wch: 26 }
    ];
    for (let i = 0; i < maxLinks; i++) {
        cols.push({ wch: 50 });
    }
    worksheet["!cols"] = cols;
    if (rows.length > 0) {
        worksheet["!autofilter"] = { ref: worksheet["!ref"] || "A1" };
    }
};

const buildDcDocumentExport = (
    project: {
        id: number;
        project_id: number;
        archive_code: string;
        archive_name: string;
        branch_name: string;
        location_name: string | null;
        project_type: string;
        archive_type?: string | null;
        parent_dc_code?: string | null;
        parent_dc_name?: string | null;
        parent_branch_name?: string | null;
    },
    documents: DcDocumentRow[],
    customItems: DcDocumentCustomItemRow[] = [],
    stageFilter?: string | null
) => {
    const documentMap = new Map<string, DcDocumentRow>();
    for (const doc of documents) {
        if (!doc.document_type || !doc.stage) continue;
        const stage = normalizeDcExportStage(doc.stage);
        if (!stage) continue;
        const mapKey = `${stage}#${doc.document_type}`;
        const existing = documentMap.get(mapKey);
        
        if (existing) {
            const existingLinks = existing.link_dokumen ? existing.link_dokumen.split(',').map(s => s.trim()) : [];
            const newLinks = doc.link_dokumen ? doc.link_dokumen.split(',').map(s => s.trim()) : [];
            const combinedLinks = Array.from(new Set([...existingLinks, ...newLinks])).filter(Boolean).join(', ');

            if ((!existing.notes && doc.notes) || (!existing.drive_file_id && doc.drive_file_id)) {
                doc.link_dokumen = combinedLinks;
                documentMap.set(mapKey, doc);
            } else {
                existing.link_dokumen = combinedLinks;
            }
        } else {
            documentMap.set(mapKey, doc);
        }
    }

    const rows: DcDocumentExportRow[] = [];
    const stages: PdfStage[] = [];
    let rowNumber = 1;

    for (const stage of resolveDcExportStages(stageFilter)) {
        const items: PdfStageItem[] = [];
        let total = 0;
        let filled = 0;

        for (const utama of getDcDocumentConfigForStage(stage.key)) {
            for (const detail of utama.details) {
                for (const jenis of detail.jenis) {
                    for (const slot of jenis.slots) {
                        total++;
                        const documentType = formatDcDocumentType(jenis.key, slot.type);
                        const doc = documentMap.get(`${stage.key}#${documentType}`) ?? null;
                        const isFilled = !!(doc?.drive_file_id || doc?.file_name);
                        if (isFilled) filled++;

                        const notes = doc?.notes ?? null;
                        const itemLabel = jenis.slots.length > 1 ? `${jenis.title} (${slot.type})` : jenis.title;
                        items.push({
                            kategori: utama.title,
                            jenis: itemLabel,
                            status: isFilled,
                            notes,
                            linkDrive: doc?.link_dokumen ? doc.link_dokumen.split(',').map(s => s.trim()).filter(Boolean) : []
                        });

                        const catNoteKey = `CAT_NOTE_${utama.id}`;
                        const catNoteDoc = documentMap.get(`${stage.key}#${catNoteKey}`);
                        const catatanKategori = catNoteDoc?.notes ?? "";

                        rows.push({
                            "No": rowNumber++,
                            "Kode Proyek": project.archive_code,
                            "Nama Proyek": project.archive_name,
                            "DC Induk": project.parent_dc_code ? `${project.parent_dc_code} - ${project.parent_dc_name ?? ""}`.trim() : "",
                            "Tipe Proyek": project.project_type,
                            "Tahap": stage.label,
                            "Kategori Utama": utama.title,
                            "Catatan Kategori Utama": catatanKategori,
                            "Sub Kategori": detail.title,
                            "Jenis Dokumen": jenis.title,
                            "Format Dokumen": slot.type,
                            "Status": isFilled ? "ADA" : "KOSONG",
                            "Catatan": notes ?? "",
                            linkDriveArray: doc?.link_dokumen ? doc.link_dokumen.split(',').map(s => s.trim()).filter(Boolean) : []
                        });
                    }
                }
            }
        }

        for (const customItem of customItems.filter((item) => item.stage === stage.key)) {
            for (const slotType of customItem.slots) {
                total++;
                const documentType = formatDcDocumentType(`CUSTOM_K_${customItem.id}`, slotType);
                const doc = documentMap.get(`${stage.key}#${documentType}`) ?? null;
                const isFilled = !!(doc?.drive_file_id || doc?.file_name);
                if (isFilled) filled++;

                const notes = doc?.notes ?? null;
                const itemLabel = customItem.slots.length > 1 ? `${customItem.title} (${slotType})` : customItem.title;
                items.push({
                    kategori: "DATA PENTING LAINNYA",
                    jenis: itemLabel,
                    status: isFilled,
                    notes,
                    linkDrive: doc?.link_dokumen ? doc.link_dokumen.split(',').map(s => s.trim()).filter(Boolean) : []
                });

                rows.push({
                    "No": rowNumber++,
                    "Kode Proyek": project.archive_code,
                    "Nama Proyek": project.archive_name,
                    "DC Induk": project.parent_dc_code ? `${project.parent_dc_code} - ${project.parent_dc_name ?? ""}`.trim() : "",
                    "Tipe Proyek": project.project_type,
                    "Tahap": stage.label,
                    "Kategori Utama": "DATA PENTING LAINNYA",
                    "Catatan Kategori Utama": "-",
                    "Sub Kategori": "Item Tambahan",
                    "Jenis Dokumen": customItem.title,
                    "Format Dokumen": slotType,
                    "Status": isFilled ? "ADA" : "KOSONG",
                    "Catatan": notes ?? "",
                    linkDriveArray: doc?.link_dokumen ? doc.link_dokumen.split(',').map(s => s.trim()).filter(Boolean) : []
                });
            }
        }

        if (total > 0) {
            stages.push({
                stageName: stage.label,
                total,
                filled,
                percentage: Math.round((filled / total) * 100),
                items
            });
        }
    }

    return { rows, stages };
};

const prepareFlatRows = (rows: DcDocumentExportRow[]): { flatRows: Record<string, string | number>[], maxLinks: number } => {
    let maxLinks = 1;
    for (const row of rows) {
        if (row.linkDriveArray.length > maxLinks) {
            maxLinks = row.linkDriveArray.length;
        }
    }
    const flatRows = rows.map(row => {
        const flatRow: Record<string, string | number> = {
            "No": row["No"],
            "Kode Proyek": row["Kode Proyek"],
            "Nama Proyek": row["Nama Proyek"],
            "DC Induk": row["DC Induk"],
            "Tipe Proyek": row["Tipe Proyek"],
            "Tahap": row["Tahap"],
            "Kategori Utama": row["Kategori Utama"],
            "Catatan Kategori Utama": row["Catatan Kategori Utama"],
            "Sub Kategori": row["Sub Kategori"],
            "Jenis Dokumen": row["Jenis Dokumen"],
            "Format Dokumen": row["Format Dokumen"],
            "Status": row["Status"],
            "Catatan": row["Catatan"]
        };
        for (let i = 0; i < maxLinks; i++) {
            flatRow[`Link Drive ${i + 1}`] = row.linkDriveArray[i] || "";
        }
        return flatRow;
    });
    return { flatRows, maxLinks };
};

const buildDcCsvBuffer = (rows: DcDocumentExportRow[]): Buffer => {
    if (rows.length === 0) return Buffer.from("");
    const { flatRows } = prepareFlatRows(rows);
    const headers = Object.keys(flatRows[0]);
    const csvRows = [
        headers.join(","),
        ...flatRows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))
    ];
    return Buffer.from(csvRows.join("\n"));
};

const buildDcExcelBuffer = (rows: DcDocumentExportRow[], sheetName: string): Buffer => {
    const { flatRows, maxLinks } = prepareFlatRows(rows);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(flatRows);
    applyDcWorksheetFormatting(worksheet, flatRows, maxLinks);
    
    if (flatRows.length > 0) {
        const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            for (let i = 0; i < maxLinks; i++) {
                const C = 13 + i;
                const cellRef = xlsx.utils.encode_cell({ r: R, c: C });
                const cell = worksheet[cellRef];
                if (cell && cell.v && String(cell.v).startsWith('http')) {
                    cell.l = { Target: String(cell.v) };
                }
            }
        }
    }

    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

export const dcDevelopmentService = {
    listArchiveProjects(filter: DcArchiveProjectListQuery) {
        return dcDevelopmentRepository.listArchiveProjects(filter, canBypassDocumentAccess(filter.actor_role));
    },

    async createArchiveProject(input: CreateDcArchiveProjectInput) {
        if (!canCreateArchiveProject(input.actor_role)) {
            throw new AppError("Hanya Super Human, DC Manager, DC Specialist, atau DC Document Admin yang dapat menambah data arsip DC", 403);
        }

        try {
            return await dcDevelopmentRepository.createArchiveProject(input);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal membuat arsip dokumen DC";
            if (message.includes("duplicate key")) {
                throw new AppError("Kode arsip/project DC sudah terdaftar", 409);
            }
            throw new AppError(message, 400);
        }
    },

    listProjects(filter: DcProjectListQuery) {
        if (hasSuperHumanRole(filter.actor_role)) {
            return dcDevelopmentRepository.listProjects({ ...filter, actor_email: undefined });
        }
        return dcDevelopmentRepository.listProjects(filter);
    },

    createProject(input: CreateDcProjectInput) {
        return dcDevelopmentRepository.createProject(input);
    },

    async getProjectById(id: string) {
        const projectId = Number(id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }

        const project = await dcDevelopmentRepository.findProjectById(projectId);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        return {
            project,
            stage_sequence: DC_PROJECT_STAGE_SEQUENCE
        };
    },

    async advanceProjectStage(id: string, input: AdvanceDcProjectStageInput) {
        const projectId = Number(id);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }

        try {
            return await dcDevelopmentRepository.advanceProjectStage({
                id: projectId,
                ...input
            });
        } catch (error) {
            throw new AppError(error instanceof Error ? error.message : "Gagal memajukan stage project DC", 400);
        }
    },

    async createTender(projectIdRaw: string, input: CreateDcTenderInput) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }

        const project = await dcDevelopmentRepository.findProjectById(projectId);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        try {
            return await dcDevelopmentRepository.createTender(projectId, input);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal membuat tender DC";
            if (message.includes("duplicate key")) {
                throw new AppError("Tender untuk tipe tersebut sudah ada pada project ini", 409);
            }
            throw new AppError(message, 400);
        }
    },

    async listTenders(filter: { project_id?: number; tender_type?: string; status?: string }) {
        return dcDevelopmentRepository.listTenders(filter);
    },

    async getTenderById(id: string) {
        const tenderId = Number(id);
        if (!Number.isInteger(tenderId) || tenderId <= 0) {
            throw new AppError("ID tender DC tidak valid", 400);
        }
        const tender = await dcDevelopmentRepository.getTenderById(tenderId);
        if (!tender) throw new AppError("Tender DC tidak ditemukan", 404);

        const participants = await dcDevelopmentRepository.listTenderParticipants(tenderId);
        const submissions = await dcDevelopmentRepository.listTenderSubmissions(tenderId);

        return {
            tender,
            participants: participants.map(p => ({
                ...p,
                submissions: submissions.filter(s => s.participant_id === p.id)
            }))
        };
    },

    async inviteTenderParticipant(tenderIdRaw: string, input: any) {
        const tenderId = Number(tenderIdRaw);
        if (!Number.isInteger(tenderId) || tenderId <= 0) {
            throw new AppError("ID tender DC tidak valid", 400);
        }

        const tender = await dcDevelopmentRepository.getTenderById(tenderId);
        if (!tender) throw new AppError("Tender DC tidak ditemukan", 404);
        if (tender.status === 'COMPLETED') throw new AppError("Tender sudah selesai", 400);

        try {
            return await dcDevelopmentRepository.inviteTenderParticipant(tenderId, input.vendor_company_id, input.invited_by_email);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal mengundang vendor";
            if (message.includes("duplicate key")) {
                throw new AppError("Vendor ini sudah diundang ke tender ini", 409);
            }
            throw new AppError(message, 400);
        }
    },

    async submitTenderSubmission(tenderIdRaw: string, input: any) {
        const tenderId = Number(tenderIdRaw);
        if (!Number.isInteger(tenderId) || tenderId <= 0) {
            throw new AppError("ID tender DC tidak valid", 400);
        }

        const tender = await dcDevelopmentRepository.getTenderById(tenderId);
        if (!tender) throw new AppError("Tender DC tidak ditemukan", 404);
        if (tender.status === 'COMPLETED') throw new AppError("Tender sudah selesai", 400);

        // If participant_id is provided directly, use it (for internal user / testing)
        if (input.participant_id) {
            const partResult = await pool.query(
                `SELECT id FROM dc_tender_participant WHERE id = $1 AND tender_id = $2`,
                [input.participant_id, tenderId]
            );
            if (partResult.rows.length === 0) throw new AppError("Participant tidak valid", 400);
            return await dcDevelopmentRepository.submitTenderSubmission(input.participant_id, tender, input);
        }

        // Find participant via vendor user email
        if (!input.submitted_by_email) throw new AppError("Email wajib diisi", 400);

        const vendorResult = await pool.query(
            `SELECT vendor_company_id FROM dc_vendor_user WHERE LOWER(email) = LOWER($1)`,
            [input.submitted_by_email]
        );

        if (vendorResult.rows.length === 0) {
            throw new AppError("User vendor tidak ditemukan", 404);
        }

        const vendorCompanyId = vendorResult.rows[0].vendor_company_id;
        const participantResult = await pool.query(
            `SELECT id FROM dc_tender_participant WHERE tender_id = $1 AND vendor_company_id = $2`,
            [tenderId, vendorCompanyId]
        );

        if (participantResult.rows.length === 0) {
            throw new AppError("Vendor belum diundang ke tender ini", 403);
        }

        const participantId = participantResult.rows[0].id;
        return await dcDevelopmentRepository.submitTenderSubmission(participantId, tender, input);
    },

    async setTenderWinner(tenderIdRaw: string, input: any) {
        const tenderId = Number(tenderIdRaw);
        if (!Number.isInteger(tenderId) || tenderId <= 0) {
            throw new AppError("ID tender DC tidak valid", 400);
        }

        const tender = await dcDevelopmentRepository.getTenderById(tenderId);
        if (!tender) throw new AppError("Tender DC tidak ditemukan", 404);
        if (tender.status === 'COMPLETED') throw new AppError("Tender sudah selesai", 400);

        return await dcDevelopmentRepository.setTenderWinner(tenderId, input.participant_id, input.actor_email, input.actor_role);
    },

    async listProjectTimelines(projectIdRaw: string) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        return await dcDevelopmentRepository.listProjectTimelines(projectId);
    },

    async addProjectTimeline(projectIdRaw: string, input: any) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        const project = await dcDevelopmentRepository.findProjectById(projectId);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        return await dcDevelopmentRepository.addProjectTimeline(projectId, input);
    },

    async updateProjectTimeline(taskIdRaw: string, input: any) {
        const taskId = Number(taskIdRaw);
        if (!Number.isInteger(taskId) || taskId <= 0) {
            throw new AppError("ID task timeline tidak valid", 400);
        }
        return await dcDevelopmentRepository.updateProjectTimeline(taskId, input);
    },

    async listProjectIssues(projectIdRaw: string) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        return await dcDevelopmentRepository.listProjectIssues(projectId);
    },

    async addProjectIssue(projectIdRaw: string, input: any) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        const project = await dcDevelopmentRepository.findProjectById(projectId);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        return await dcDevelopmentRepository.addProjectIssue(projectId, input);
    },

    async updateProjectIssue(issueIdRaw: string, input: any) {
        const issueId = Number(issueIdRaw);
        if (!Number.isInteger(issueId) || issueId <= 0) {
            throw new AppError("ID issue tidak valid", 400);
        }
        return await dcDevelopmentRepository.updateProjectIssue(issueId, input);
    },

    async listProjectBast(projectIdRaw: string) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        return await dcDevelopmentRepository.listProjectBast(projectId);
    },

    async createProjectBast(projectIdRaw: string, input: any) {
        const projectId = Number(projectIdRaw);
        if (!Number.isInteger(projectId) || projectId <= 0) {
            throw new AppError("ID project DC tidak valid", 400);
        }
        const project = await dcDevelopmentRepository.findProjectById(projectId);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        return await dcDevelopmentRepository.createProjectBast(projectId, input);
    },

    async updateProjectBast(bastIdRaw: string, input: any) {
        const bastId = Number(bastIdRaw);
        if (!Number.isInteger(bastId) || bastId <= 0) {
            throw new AppError("ID BAST tidak valid", 400);
        }
        return await dcDevelopmentRepository.updateProjectBast(bastId, input);
    },

    async listParticipantTerms(participantIdRaw: string) {
        const participantId = Number(participantIdRaw);
        if (!Number.isInteger(participantId) || participantId <= 0) {
            throw new AppError("ID participant tidak valid", 400);
        }
        return await dcDevelopmentRepository.listParticipantTerms(participantId);
    },

    async addTermSchedule(participantIdRaw: string, input: any) {
        const participantId = Number(participantIdRaw);
        if (!Number.isInteger(participantId) || participantId <= 0) {
            throw new AppError("ID participant tidak valid", 400);
        }
        // In real app, might want to validate total percentage doesn't exceed 100%
        return await dcDevelopmentRepository.addTermSchedule(participantId, input);
    },

    async submitTermClaim(termIdRaw: string, input: any) {
        const termId = Number(termIdRaw);
        if (!Number.isInteger(termId) || termId <= 0) {
            throw new AppError("ID term schedule tidak valid", 400);
        }
        return await dcDevelopmentRepository.submitTermClaim(termId, input);
    },

    listVendors() {
        return dcDevelopmentRepository.listVendors();
    },

    createVendor(input: CreateDcVendorInput) {
        return dcDevelopmentRepository.createVendor(input);
    },

    async createVendorUser(vendorIdRaw: string, input: CreateDcVendorUserInput) {
        const vendorId = Number(vendorIdRaw);
        if (!Number.isInteger(vendorId) || vendorId <= 0) {
            throw new AppError("ID vendor DC tidak valid", 400);
        }

        try {
            return await dcDevelopmentRepository.createVendorUser(vendorId, input);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal membuat user vendor";
            if (message.includes("duplicate key")) {
                throw new AppError("Email user vendor sudah terdaftar pada vendor ini", 409);
            }
            throw new AppError(message, 400);
        }
    },

    listApprovals(filter: DcApprovalListQuery) {
        return dcDevelopmentRepository.listApprovals(filter);
    },

    listDocuments(filter: DcDocumentListQuery) {
        return dcDevelopmentRepository.listDocuments(filter, canBypassDocumentAccess(filter.actor_role));
    },

    async listCustomDocumentItems(archiveIdRaw: string, query: DcDocumentCustomItemListQuery) {
        const archiveId = Number(archiveIdRaw);
        if (!Number.isInteger(archiveId) || archiveId <= 0) throw new AppError("ID arsip DC tidak valid", 400);
        const archive = await dcDevelopmentRepository.findArchiveProjectById(archiveId);
        if (!archive) throw new AppError("Arsip DC tidak ditemukan", 404);
        await ensureAccess(archive.project_id, { email: query.actor_email, role: query.actor_role }, DC_MEMBER_ACCESS_LEVEL.VIEW);
        return dcDevelopmentRepository.listCustomDocumentItems({ archive_project_id: archive.id, stage: query.stage });
    },

    async createCustomDocumentItem(archiveIdRaw: string, input: CreateDcDocumentCustomItemInput) {
        if (hasDcDocumentAdminRole(input.actor_role)) {
            throw new AppError("DC DOCUMENT ADMIN tidak memiliki akses untuk menambah item dokumen tambahan.", 403);
        }
        const archiveId = Number(archiveIdRaw);
        if (!Number.isInteger(archiveId) || archiveId <= 0) throw new AppError("ID arsip DC tidak valid", 400);
        const archive = await dcDevelopmentRepository.findArchiveProjectById(archiveId);
        if (!archive) throw new AppError("Arsip DC tidak ditemukan", 404);
        await ensureAccess(archive.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.UPLOAD);
        return dcDevelopmentRepository.createCustomDocumentItem(archive, input);
    },

    async deleteCustomDocumentItem(itemIdRaw: string, input: DeleteDcDocumentCustomItemInput) {
        const itemId = Number(itemIdRaw);
        if (!Number.isInteger(itemId) || itemId <= 0) throw new AppError("ID item tambahan tidak valid", 400);
        const item = await dcDevelopmentRepository.findCustomDocumentItemById(itemId);
        if (!item) throw new AppError("Item tambahan tidak ditemukan", 404);
        const isCreator = item.created_by_email?.toLowerCase() === input.actor_email.toLowerCase();
        if (!isCreator) {
            await ensureAccess(item.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.MANAGE);
        } else {
            await ensureAccess(item.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.UPLOAD);
        }
        const deleted = await dcDevelopmentRepository.softDeleteCustomDocumentItem(item.id, { email: input.actor_email, role: input.actor_role });
        if (!deleted) throw new AppError("Item tambahan tidak ditemukan", 404);
        return deleted;
    },

    async createDocument(input: CreateDcDocumentInput, files: UploadedDcDocumentFile[]) {
        if (files.length === 0 && !input.notes) throw new AppError("Dokumen wajib diupload atau catatan wajib diisi", 400);
        const project = await dcDevelopmentRepository.findProjectById(input.project_id);
        if (!project) throw new AppError("Project DC tidak ditemukan", 404);

        await ensureAccess(input.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.UPLOAD);
        try {
            await dcDevelopmentRepository.validateDocumentRelations(input);
        } catch (error) {
            throw new AppError(error instanceof Error ? error.message : "Relasi dokumen DC tidak valid", 409);
        }

        const items: DcDocumentRow[] = [];
        let folder = null;

        if (files.length > 0) {
            const versions = await uploadFilesToDrive(input, project, files);
            for (const version of versions) {
                const item = await dcDevelopmentRepository.createDocumentWithVersion({
                    project_id: input.project_id,
                    tender_id: input.tender_id ?? null,
                    participant_id: input.participant_id ?? null,
                    entity_type: input.entity_type,
                    entity_id: input.entity_id ?? null,
                    document_type: input.document_type,
                    stage: input.stage ?? null,
                    created_by_email: input.actor_email,
                    notes: input.notes ?? null
                }, version);
                items.push(item);
            }
            if (versions[0]) {
                folder = {
                    id: versions[0].drive_folder_id,
                    link: versions[0].link_folder
                };
            }
        } else {
            const item = await dcDevelopmentRepository.createDocumentWithVersion({
                project_id: input.project_id,
                tender_id: input.tender_id ?? null,
                participant_id: input.participant_id ?? null,
                entity_type: input.entity_type,
                entity_id: input.entity_id ?? null,
                document_type: input.document_type,
                stage: input.stage ?? null,
                created_by_email: input.actor_email,
                notes: input.notes ?? null
            });
            items.push(item);
        }

        return {
            folder,
            items
        };
    },

    async getDocumentDetail(id: string, actor: DcDocumentActorQuery) {
        const documentId = Number(id);
        if (!Number.isInteger(documentId) || documentId <= 0) {
            throw new AppError("ID dokumen DC tidak valid", 400);
        }

        const document = await dcDevelopmentRepository.findDocumentById(documentId);
        if (!document) throw new AppError("Dokumen DC tidak ditemukan", 404);
        if (!document.project_id) throw new AppError("Dokumen DC tidak terhubung ke project", 409);
        await ensureAccess(document.project_id, { email: actor.actor_email, role: actor.actor_role }, DC_MEMBER_ACCESS_LEVEL.VIEW);
        return document;
    },

    async updateDocument(id: string, input: UpdateDcDocumentInput, files: UploadedDcDocumentFile[]) {
        const document = await this.getDocumentDetail(id, {
            actor_email: input.actor_email,
            actor_role: input.actor_role
        });
        if (!document.project_id) throw new AppError("Dokumen DC tidak terhubung ke project", 409);

        const hasMetadataUpdate = typeof input.document_type !== "undefined" || typeof input.stage !== "undefined";
        if (hasMetadataUpdate) {
            await ensureAccess(document.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.MANAGE);
        }

        let updated = hasMetadataUpdate
            ? await dcDevelopmentRepository.updateDocumentMetadata(document.id, {
                document_type: input.document_type,
                stage: input.stage
            })
            : document;

        if (typeof input.notes !== "undefined") {
            await ensureAccess(document.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.UPLOAD);
            await dcDevelopmentRepository.updateDocumentNotes(document.id, input.notes ?? null, { email: input.actor_email, role: input.actor_role });
            updated = (await this.getDocumentDetail(id, { actor_email: input.actor_email, actor_role: input.actor_role })) || updated;
        }

        if (files.length > 0) {
            await ensureAccess(document.project_id, { email: input.actor_email, role: input.actor_role }, DC_MEMBER_ACCESS_LEVEL.UPLOAD);
            const project = await dcDevelopmentRepository.findProjectById(document.project_id);
            if (!project) throw new AppError("Project DC tidak ditemukan", 404);
            const uploadInput: CreateDcDocumentInput = {
                project_id: document.project_id,
                tender_id: document.tender_id ?? undefined,
                participant_id: document.participant_id ?? undefined,
                entity_type: document.entity_type,
                entity_id: document.entity_id ?? undefined,
                document_type: input.document_type ?? document.document_type,
                stage: input.stage ?? document.stage ?? undefined,
                notes: input.notes,
                actor_email: input.actor_email,
                actor_role: input.actor_role
            };
            const [version] = await uploadFilesToDrive(uploadInput, project, [files[0]]);
            updated = await dcDevelopmentRepository.addDocumentVersion(document.id, version);
        }

        if (!updated) throw new AppError("Dokumen DC tidak ditemukan", 404);
        return updated;
    },

    async deleteDocument(id: string, actor: DcDocumentActorQuery) {
        const document = await this.getDocumentDetail(id, actor);
        if (!document.project_id) throw new AppError("Dokumen DC tidak terhubung ke project", 409);
        await ensureAccess(document.project_id, { email: actor.actor_email, role: actor.actor_role }, DC_MEMBER_ACCESS_LEVEL.MANAGE);
        const deleted = await dcDevelopmentRepository.softDeleteDocument(document.id, {
            email: actor.actor_email,
            role: actor.actor_role
        });
        if (!deleted) throw new AppError("Dokumen DC tidak ditemukan", 404);
        return deleted;
    },

    async getDocumentFile(id: string, actor: DcDocumentActorQuery) {
        const document = await this.getDocumentDetail(id, actor);
        if (!document.drive_file_id) throw new AppError("File dokumen DC tidak ditemukan", 404);
        const gp = GoogleProvider.instance;
        if (!gp.docDrive) throw new AppError("Service Dokumen belum siap", 500);
        const buffer = await gp.getFileBufferById(gp.docDrive, document.drive_file_id);
        return {
            document,
            buffer,
            link: document.link_dokumen
        };
    },

    async streamDocumentFile(id: string, actor: Partial<DcDocumentActorQuery> = {}) {
        const documentId = Number(id);
        if (!Number.isInteger(documentId) || documentId <= 0) {
            throw new AppError("ID dokumen DC tidak valid", 400);
        }

        const document = await dcDevelopmentRepository.findDocumentById(documentId);
        if (!document) throw new AppError("Dokumen DC tidak ditemukan", 404);

        if (actor.actor_email && actor.actor_role && document.project_id) {
            await ensureAccess(document.project_id, { email: actor.actor_email, role: actor.actor_role }, DC_MEMBER_ACCESS_LEVEL.VIEW);
        }

        if (!document.drive_file_id) {
            return {
                document,
                stream: null,
                link: document.link_dokumen
            };
        }

        const gp = GoogleProvider.instance;
        const drive = gp.docDrive || gp.spartaDrive;
        if (!drive) {
            return {
                document,
                stream: null,
                link: document.link_dokumen
            };
        }

        try {
            const streamRes = await drive.files.get(
                {
                    fileId: document.drive_file_id,
                    alt: "media",
                    supportsAllDrives: true,
                },
                { responseType: "stream" }
            );

            return {
                document,
                stream: streamRes.data as any,
                link: document.link_dokumen
            };
        } catch (error) {
            console.error(`[streamDocumentFile] Error getting stream from Drive for file ${document.drive_file_id}:`, error);
            return {
                document,
                stream: null,
                link: document.link_dokumen
            };
        }
    },

    async logCategoryEdit(archiveId: string, input: z.infer<typeof logDcCategoryEditSchema>) {
        const id = Number(archiveId);
        const project = await dcDevelopmentRepository.findArchiveProjectById(id);
        if (!project) throw new AppError("Arsip DC tidak ditemukan", 404);
        await dcDevelopmentRepository.insertActivityLog({
            project_id: project.project_id,
            entity_type: "DC_ARCHIVE_PROJECT_CATEGORY",
            entity_id: project.project_id,
            actor_email: input.actor_email,
            actor_role: input.actor_role,
            action: "EDIT_CATEGORY_DOCUMENTS",
            metadata: {
                category_id: input.category_id,
                category_name: input.category_name,
                ...(input.action_details && { action_details: input.action_details }),
                ...(input.itemized_details && { itemized_details: input.itemized_details })
            }
        });
        return { success: true };
    },

    async listCategoryEditLogs(archiveId: string, query: z.infer<typeof dcCategoryLogListQuerySchema>) {
        const id = Number(archiveId);
        const project = await dcDevelopmentRepository.findArchiveProjectById(id);
        if (!project) throw new AppError("Arsip DC tidak ditemukan", 404);
        return await dcDevelopmentRepository.listCategoryActivityLogs(project.project_id, query.category_id);
    },

    async exportDcDocuments(id: string, actor: DcDocumentActorQuery, format: DcExportFormat, stageFilter?: string | null) {
        const archiveId = Number(id);
        const project = await dcDevelopmentRepository.findArchiveProjectById(archiveId);
        if (!project) throw new AppError("Arsip DC tidak ditemukan", 404);

        await ensureAccess(project.project_id, { email: actor.actor_email, role: actor.actor_role }, DC_MEMBER_ACCESS_LEVEL.VIEW);

        const documents = await dcDevelopmentRepository.listDocuments({
            project_id: project.project_id,
            actor_email: actor.actor_email,
            actor_role: actor.actor_role
        }, canBypassDocumentAccess(actor.actor_role));

        const customItems = await dcDevelopmentRepository.listCustomDocumentItems({ archive_project_id: project.id, stage: normalizeDcExportStage(stageFilter) });
        const { rows, stages } = buildDcDocumentExport(project, documents, customItems, stageFilter);
        const stageSuffix = normalizeDcExportStage(stageFilter) ? `_${normalizeDcExportStage(stageFilter)}` : "";

        if (format === "csv") {
            return {
                buffer: buildDcCsvBuffer(rows),
                filename: `Data_DC_${project.archive_code}${stageSuffix}.csv`
            };
        }

        if (format === "excel") {
            return {
                buffer: buildDcExcelBuffer(rows, "Dokumen DC"),
                filename: `Data_DC_${project.archive_code}${stageSuffix}.xlsx`
            };
        }

        if (format === "pdf") {
            const buffer = await buildDcDocumentReportPdfBuffer(project, stages);
            return {
                buffer,
                filename: `Laporan_DC_${project.archive_code}${stageSuffix}.pdf`
            };
        }

        throw new AppError("Format tidak didukung", 400);
    },

    async exportGlobalDcDocuments(query: DcArchiveProjectListQuery, actor: DcDocumentActorQuery, format: DcExportFormat) {
        const projects = await dcDevelopmentRepository.listArchiveProjects(query, canBypassDocumentAccess(actor.actor_role));
        if (!projects || projects.length === 0) {
            throw new AppError("Tidak ada data arsip DC yang sesuai dengan filter", 404);
        }

        const PROJECT_TYPE_ORDER: Record<string, number> = {
            "DC": 1,
            "Warehouse": 2,
            "Depo": 3,
            "Bulky": 4,
            "Store-Hub": 5,
            "Gudang Anak": 6
        };

        projects.sort((a, b) => {
            const orderA = PROJECT_TYPE_ORDER[a.project_type] || 99;
            const orderB = PROJECT_TYPE_ORDER[b.project_type] || 99;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return (a.archive_name || "").localeCompare(b.archive_name || "");
        });

        const flatRows: DcDocumentExportRow[] = [];
        const allStagesForPdf: { project: any, stages: PdfStage[] }[] = [];

        for (const project of projects) {
            const documents = await dcDevelopmentRepository.listDocuments({
                project_id: project.project_id,
                actor_email: actor.actor_email,
                actor_role: actor.actor_role
            }, canBypassDocumentAccess(actor.actor_role));

            const customItems = await dcDevelopmentRepository.listCustomDocumentItems({ archive_project_id: project.id });
            const { rows, stages } = buildDcDocumentExport(project, documents, customItems);
            const offset = flatRows.length;
            rows.forEach((row, index) => {
                flatRows.push({ ...row, "No": offset + index + 1 });
            });
            allStagesForPdf.push({ project, stages });
        }

        if (format === "csv") {
            return {
                buffer: buildDcCsvBuffer(flatRows),
                filename: "Data_Global_DC.csv"
            };
        }

        if (format === "excel") {
            return {
                buffer: buildDcExcelBuffer(flatRows, "Data Global DC"),
                filename: "Data_Global_DC.xlsx"
            };
        }

        if (format === "pdf") {
            const buffer = await buildGlobalDcDocumentReportPdfBuffer(allStagesForPdf);
            return {
                buffer,
                filename: "Laporan_Global_DC.pdf"
            };
        }

        throw new AppError("Format tidak didukung", 400);
    }

};
