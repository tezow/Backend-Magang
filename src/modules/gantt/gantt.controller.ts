import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { AppError } from "../../common/app-error";
import { injectBranchFilter } from "../../common/branch-filter-helper";
import {
    addDayItemsSchema,
    createGanttNoteSchema,
    ganttDetailQuerySchema,
    ganttDetailByTokoSchema,
    ganttListQuerySchema,
    ganttInterventionSchema,
    supervisionWorkspaceParamsSchema,
    lockGanttSchema,
    managePengawasanSchema,
    submitGanttSchema,
    submitTakeoverInspectionSchema,
    updateGanttSchema,
    updateKecepatanSchema,
    updateKeterlambatanSchema
} from "./gantt.schema";
import { ganttMigrationCommitSchema } from "./gantt-migration.schema";
import { ganttMigrationService } from "./gantt-migration.service";
import { ganttService } from "./gantt.service";

const shouldLogDebug = process.env.NODE_ENV !== "production";

export const submitGantt = asyncHandler(async (req: Request, res: Response) => {
    const payload = submitGanttSchema.parse(req.body);
    const data = await ganttService.submit(payload);

    res.status(201).json({
        status: "success",
        message: "Gantt Chart berhasil disimpan",
        data
    });
});

export const listGantt = asyncHandler(async (req: Request, res: Response) => {
    if (shouldLogDebug) {
        console.log('[GANTT LIST] Original request query:', JSON.stringify(req.query));
        console.log('[GANTT LIST] User info:', {
            email: req.user?.email_sat,
            cabang: req.user?.cabang,
            roles: req.user?.roles
        });
    }
    
    let query = ganttListQuerySchema.parse(req.query);
    if (shouldLogDebug) {
        console.log('[GANTT LIST] After schema parse:', JSON.stringify(query));
    }
    
    // Inject branch filter untuk user non-global
    query = await injectBranchFilter(req.user!, query);
    if (shouldLogDebug) {
        console.log('[GANTT LIST] After inject filter:', JSON.stringify(query));
    }
    
    // Security: Pastikan cabang_array tidak kosong untuk user non-global
    // Global user (super human) akan punya _is_global_access = true = bypass, tidak perlu dicek
    const isGlobal = !!(query as any)._is_global_access;
    if (!isGlobal && (!query.cabang_array || query.cabang_array.length === 0 || query.cabang_array.includes('__NO_ACCESS__'))) {
        console.error('[GANTT LIST] REJECT: No branch access');
        throw new AppError("User tidak memiliki akses ke cabang manapun. Hubungi administrator.", 403);
    }
    
    // Security IDOR: Cegah Kontraktor melihat data PT lain dengan memanipulasi query parameter
    const isKontraktor = req.user!.roles.some((r: string) => r.toUpperCase().includes('KONTRAKTOR') || r.toUpperCase().includes('DIREKTUR'));
    if (isKontraktor) {
        if (!req.user!.nama_pt) {
            throw new AppError("Akses ditolak: Data PT tidak ditemukan untuk akun kontraktor ini.", 403);
        }
        query.nama_kontraktor = req.user!.nama_pt;
    }
    
    const data = await ganttService.list(query);
    if (shouldLogDebug) {
        console.log('[GANTT LIST] Result count:', data.length);
    }

    res.json({ status: "success", data });
});

export const getSupervisionWorkspace = asyncHandler(async (req: Request, res: Response) => {
    const { nomor_ulok } = supervisionWorkspaceParamsSchema.parse(req.params);
    const ts = req.query.ts ? Number(req.query.ts) : undefined;
    const data = await ganttService.getSupervisionWorkspace(nomor_ulok, ts);
    res.json({ status: "success", data });
});

export const getGanttById = asyncHandler(async (req: Request, res: Response) => {
    const query = ganttDetailQuerySchema.parse(req.query);
    const idToko = query.id_toko ? Number(query.id_toko) : undefined;
    const data = await ganttService.getById(req.params.id, idToko);

    res.json({ status: "success", data });
});

export const listGanttNotes = asyncHandler(async (req: Request, res: Response) => {
    const data = await ganttService.listNotes(req.params.id);

    res.json({ status: "success", data });
});

export const submitTakeoverInspection = asyncHandler(async (req: Request, res: Response) => {
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

    const payload = submitTakeoverInspectionSchema.parse(payloadCandidate);
    const files = (req.files as Express.Multer.File[]) || [];
    const userEmail = req.user?.email_sat || "system";
    
    const data = await ganttService.submitTakeoverInspection(payload, files, userEmail);

    res.status(201).json({
        status: "success",
        message: "Inspeksi Takeover berhasil disimpan",
        data
    });
});

export const createGanttNote = asyncHandler(async (req: Request, res: Response) => {
    const payload = createGanttNoteSchema.parse(req.body);
    const data = await ganttService.createNote(req.params.id, payload);

    res.status(201).json({
        status: "success",
        message: "Catatan pengawasan berhasil dikirim",
        data
    });
});

export const updateGantt = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateGanttSchema.parse(req.body);
    const data = await ganttService.update(req.params.id, payload);

    res.json({
        status: "success",
        message: "Gantt Chart berhasil diperbarui",
        data
    });
});

export const lockGantt = asyncHandler(async (req: Request, res: Response) => {
    const { email } = lockGanttSchema.parse(req.body);
    const result = await ganttService.lock(req.params.id, email);

    res.json({
        status: "success",
        message: "Gantt Chart berhasil dikunci",
        data: result
    });
});

export const interveneGantt = asyncHandler(async (req: Request, res: Response) => {
    const payload = ganttInterventionSchema.parse(req.body);
    const result = await ganttService.intervene(req.params.id, payload);

    res.json({
        status: "success",
        message: "Intervensi Gantt Chart berhasil diproses",
        data: result
    });
});

export const deleteGantt = asyncHandler(async (req: Request, res: Response) => {
    const result = await ganttService.remove(req.params.id);

    res.json({
        status: "success",
        message: "Gantt Chart berhasil dihapus",
        data: result
    });
});

export const addDayItems = asyncHandler(async (req: Request, res: Response) => {
    const payload = addDayItemsSchema.parse(req.body);
    const result = await ganttService.addDayItems(req.params.id, payload);

    res.status(201).json({
        status: "success",
        message: `${result.inserted} day item(s) berhasil ditambahkan`,
        data: result
    });
});

export const updateKeterlambatan = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateKeterlambatanSchema.parse(req.body);
    const result = await ganttService.updateKeterlambatan(req.params.id, payload);

    res.json({
        status: "success",
        message: "Keterlambatan berhasil diperbarui",
        data: result
    });
});

export const updateKecepatan = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateKecepatanSchema.parse(req.body);
    const result = await ganttService.updateKecepatan(req.params.id, payload);

    res.json({
        status: "success",
        message: "Kecepatan berhasil diperbarui",
        data: result
    });
});

export const managePengawasan = asyncHandler(async (req: Request, res: Response) => {
    const payload = managePengawasanSchema.parse(req.body);
    const result = await ganttService.managePengawasan(req.params.id, payload);

    const statusCode = result.action === "added" ? 201 : 200;
    const message = result.action === "added"
        ? "Pengawasan berhasil ditambahkan"
        : "Pengawasan berhasil dihapus";

    res.status(statusCode).json({
        status: "success",
        message,
        data: result
    });
});

export const getDetailByToko = asyncHandler(async (req: Request, res: Response) => {
    const { id_toko } = ganttDetailByTokoSchema.parse(req.params);
    const data = await ganttService.getDetailByTokoId(Number(id_toko));

    res.json({
        status: "success",
        rab: data.rab,
        filtered_categories: data.filtered_categories,
        gantt_data: data.gantt,
        day_gantt_data: data.day_items,
        dependency_data: data.dependencies,
        pengawasan_data: data.pengawasan,
        pengawasan_items: data.pengawasan_items,
        kategori_pekerjaan: data.kategori_pekerjaan,
        instruksi_lapangan_items: data.instruksi_lapangan_items,
        toko: data.toko
    });
});

export const previewGanttMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File tidak ditemukan", 400);
    }
    
    const result = await ganttMigrationService.preview(req.file.buffer);

    res.status(200).json({
        status: "success",
        message: "Preview berhasil dibuat",
        data: result
    });
});

export const commitGanttMigration = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError("File tidak ditemukan", 400);
    }
    
    let selections: unknown = req.body.selections;
    if (typeof selections === "string") {
        try {
            selections = JSON.parse(selections);
        } catch {
            throw new AppError("Format selections migrasi Gantt tidak valid", 400);
        }
    }
    const input = ganttMigrationCommitSchema.parse({
        actor_email: req.body.actor_email,
        actor_role: req.body.actor_role,
        selections,
    });
    const result = await ganttMigrationService.commit(req.file.buffer, input);

    res.status(201).json({
        status: "success",
        message: "Migrasi berhasil",
        data: result
    });
});
