import { z } from "zod";
import { createPicPengawasanSchema } from "../pic-pengawasan/pic-pengawasan.schema";
import { GANTT_STATUS } from "./gantt.constants";

// --- Sub-schemas ---

const nullableOptionalString = z.string().nullable().optional();

const kategoriPekerjaanValueSchema = z
    .union([
        z.string().trim().min(1),
        z.object({ kategori_pekerjaan: z.string().trim().min(1) })
    ])
    .transform((value: string | { kategori_pekerjaan: string }) =>
        (typeof value === "string" ? value : value.kategori_pekerjaan)
    );

const tanggalPengawasanValueSchema = z
    .union([
        z.string().trim().min(1),
        z.object({ tanggal_pengawasan: z.string().trim().min(1) })
    ])
    .transform((value: string | { tanggal_pengawasan: string }) =>
        (typeof value === "string" ? value : value.tanggal_pengawasan)
    );

export const dayGanttItemSchema = z.object({
    kategori_pekerjaan: kategoriPekerjaanValueSchema,
    h_awal: z.string().min(1),
    h_akhir: z.string().min(1),
    keterlambatan: nullableOptionalString,
    kecepatan: nullableOptionalString
});

const dayGanttItemUpdateSchema = z.object({
    kategori_pekerjaan: kategoriPekerjaanValueSchema,
    h_awal: z.string().nullable().optional(),
    h_akhir: z.string().nullable().optional(),
    keterlambatan: nullableOptionalString,
    kecepatan: nullableOptionalString
});

export const dependencyItemSchema = z.object({
    kategori_pekerjaan: kategoriPekerjaanValueSchema,
    kategori_pekerjaan_terikat: kategoriPekerjaanValueSchema
});

export const pengawasanItemSchema = z.object({
    tanggal_pengawasan: tanggalPengawasanValueSchema
});

const normalizeKategoriKey = (value: string) =>
    value
        .trim()
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, " ")
        .toUpperCase();

const appendUniqueKategori = (kategoriList: string[], kategori?: string) => {
    const cleanKategori = (kategori ?? "").trim();
    const key = normalizeKategoriKey(cleanKategori);
    if (!key) return;

    const exists = kategoriList.some((existing) => normalizeKategoriKey(existing) === key);
    if (!exists) kategoriList.push(cleanKategori);
};

const deriveKategoriForDependencyValidation = (
    kategoriPekerjaan?: string[],
    dayItems?: Array<{ kategori_pekerjaan: string }>,
    dependencies?: Array<{ kategori_pekerjaan: string; kategori_pekerjaan_terikat: string }>
) => {
    const categories: string[] = [];
    kategoriPekerjaan?.forEach((kategori) => appendUniqueKategori(categories, kategori));
    dayItems?.forEach((item) => appendUniqueKategori(categories, item.kategori_pekerjaan));
    dependencies?.forEach((dependency) => {
        appendUniqueKategori(categories, dependency.kategori_pekerjaan);
        appendUniqueKategori(categories, dependency.kategori_pekerjaan_terikat);
    });
    return categories;
};

const addDependencyValidationIssues = (
    ctx: z.RefinementCtx,
    categories: string[],
    dependencies?: Array<{ kategori_pekerjaan: string; kategori_pekerjaan_terikat: string }>
) => {
    if (categories.length <= 1) return;

    const normalizedCategories = categories.map(normalizeKategoriKey);
    const categorySet = new Set(normalizedCategories);
    const dependencyList = dependencies ?? [];
    const invalidDependency = dependencyList.find((dependency) => {
        const childKey = normalizeKategoriKey(dependency.kategori_pekerjaan);
        const parentKey = normalizeKategoriKey(dependency.kategori_pekerjaan_terikat);
        return !childKey || !parentKey || childKey === parentKey || !categorySet.has(childKey) || !categorySet.has(parentKey);
    });

    if (invalidDependency) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dependencies"],
            message: "Keterikatan Gantt tidak valid. Pastikan kategori terikat berbeda dan ada di daftar pekerjaan."
        });
        return;
    }

    const parentCategoriesWithContinuation = new Set(
        dependencyList.map((dependency) => normalizeKategoriKey(dependency.kategori_pekerjaan_terikat))
    );
    const missingContinuation = normalizedCategories
        .slice(0, -1)
        .filter((categoryKey) => !parentCategoriesWithContinuation.has(categoryKey));

    if (missingContinuation.length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dependencies"],
            message: "Keterikatan wajib diisi untuk setiap tahapan pekerjaan kecuali tahapan terakhir."
        });
    }
};

// --- Submit Gantt Chart ---

export const submitGanttSchema = z.object({
    // toko fields
    nomor_ulok: z.string().min(1),
    takeover_sequence: z.number().optional(),
    lingkup_pekerjaan: nullableOptionalString,
    nama_toko: nullableOptionalString,
    kode_toko: nullableOptionalString,
    proyek: nullableOptionalString,
    cabang: nullableOptionalString,
    alamat: nullableOptionalString,
    nama_kontraktor: nullableOptionalString,

    // gantt header
    email_pembuat: z.string().email(),

    // kategori pekerjaan + day items
    kategori_pekerjaan: z.array(kategoriPekerjaanValueSchema).min(1),
    day_items: z.array(dayGanttItemSchema).min(1),

    // optional: pengawasan & dependency
    pengawasan: z.array(pengawasanItemSchema).optional(),
    dependencies: z.array(dependencyItemSchema).optional()
}).superRefine((data, ctx) => {
    addDependencyValidationIssues(
        ctx,
        deriveKategoriForDependencyValidation(data.kategori_pekerjaan, data.day_items, data.dependencies),
        data.dependencies
    );
});

// --- Update Gantt Chart ---

export const updateGanttSchema = z.object({
    // kategori pekerjaan + day items
    kategori_pekerjaan: z.array(kategoriPekerjaanValueSchema).optional(),
    day_items: z.array(dayGanttItemUpdateSchema).optional(),

    // optional: pengawasan & dependency
    pengawasan: z.array(pengawasanItemSchema).optional(),
    dependencies: z.array(dependencyItemSchema).optional(),
}).superRefine((data, ctx) => {
    if (!data.day_items && !data.kategori_pekerjaan && typeof data.dependencies === "undefined") return;

    addDependencyValidationIssues(
        ctx,
        deriveKategoriForDependencyValidation(data.kategori_pekerjaan, data.day_items, data.dependencies),
        data.dependencies
    );
});

// --- Lock Gantt Chart ---

export const lockGanttSchema = z.object({
    email: z.string().email()
});

export const ganttInterventionSchema = z.object({
    actor_email: z.string().trim().email(),
    actor_role: z.string().trim().min(1),
    target_status: z.enum([GANTT_STATUS.ACTIVE, GANTT_STATUS.TERKUNCI]),
    alasan_intervensi: z.string().trim().min(5, "alasan_intervensi minimal 5 karakter")
});

// --- Query filters ---

export const ganttListQuerySchema = z.object({
    status: z.string().optional(),
    nomor_ulok: z.string().optional(),
    email_pembuat: z.string().optional(),
    cabang_array: z.array(z.string()).optional(),
    nama_kontraktor: z.string().optional()
});

export const ganttDetailQuerySchema = z.object({
    id_toko: z.string().regex(/^\d+$/, "id_toko harus berupa angka").optional()
});

export const supervisionWorkspaceParamsSchema = z.object({
    nomor_ulok: z.string().trim().min(1)
});

// --- Add Day Items ---

export const addDayItemsSchema = z.object({
    day_items: z.array(dayGanttItemSchema).min(1)
});

// --- Update Keterlambatan ---

export const updateKeterlambatanSchema = z.object({
    kategori_pekerjaan: z.string().min(1).optional(),
    keterlambatan: z.string().optional(),
    next_tanggal_pengawasan: z.string().trim().min(1).optional(),
    updates: z.array(
        z.object({
            kategori_pekerjaan: z.string().min(1),
            keterlambatan: z.string()
        })
    ).min(1).optional()
}).refine(
    (data: {
        kategori_pekerjaan?: string;
        keterlambatan?: string;
        updates?: Array<{ kategori_pekerjaan: string; keterlambatan: string }>;
    }) =>
        (data.updates && data.updates.length > 0) ||
        (typeof data.kategori_pekerjaan === "string" && typeof data.keterlambatan === "string"),
    {
        message:
            "Gunakan field 'updates' untuk bulk update atau isi 'kategori_pekerjaan' + 'keterlambatan' untuk single update"
    }
);

// --- Update Kecepatan ---

export const updateKecepatanSchema = z.object({
    kategori_pekerjaan: z.string().min(1),
    h_awal: z.string().min(1),
    h_akhir: z.string().min(1),
    kecepatan: z.string()
});

// --- Manage Pengawasan ---

export const managePengawasanSchema = z.object({
    tanggal_pengawasan: z.union([
        z.string().min(1),
        z.array(z.string().min(1)).min(1)
    ]).optional(),
    pic_pengawasan: createPicPengawasanSchema.optional(),
    remove_tanggal_pengawasan: z.string().min(1).optional()
}).refine(
    (data: {
        tanggal_pengawasan?: string | string[];
        pic_pengawasan?: z.infer<typeof createPicPengawasanSchema>;
        remove_tanggal_pengawasan?: string;
    }) =>
        data.tanggal_pengawasan || data.remove_tanggal_pengawasan,
    { message: "Field 'tanggal_pengawasan' atau 'remove_tanggal_pengawasan' wajib diisi" }
);

// --- Catatan Pengawasan ---

export const createGanttNoteSchema = z.object({
    author_email: z.string().trim().email(),
    author_name: z.string().trim().min(1),
    author_role: z.string().trim().min(1),
    note: z.string().trim().min(1, "Catatan wajib diisi")
});

// --- Detail by Toko ---

export const ganttDetailByTokoSchema = z.object({
    id_toko: z.string().min(1).regex(/^\d+$/, "id_toko harus berupa angka")
});

// --- Takeover Inspection ---

export const submitTakeoverInspectionSchema = z.object({
    nomor_ulok: z.string().min(1),
    tanggal_takeover: z.string().min(1),
    items: z.array(z.object({
        id_gantt: z.number(),
        kategori_pekerjaan: z.string(),
        jenis_pekerjaan: z.string().nullable().optional(),
        status: z.enum(["Selesai", "Tidak Dikerjakan"]),
        opname_data: z.object({
            id_rab_item: z.number().optional(),
            id_instruksi_lapangan_item: z.number().optional(),
            volume_akhir: z.number(),
            selisih_volume: z.number(),
            total_selisih: z.number(),
            total_harga_opname: z.number(),
            desain: z.string(),
            kualitas: z.string(),
            spesifikasi: z.string(),
            catatan: z.string().optional()
        }).optional()
    }))
});

// --- Types ---

export type GanttDetailByTokoParams = z.infer<typeof ganttDetailByTokoSchema>;
export type SubmitGanttInput = z.infer<typeof submitGanttSchema>;
export type UpdateGanttInput = z.infer<typeof updateGanttSchema>;
export type LockGanttInput = z.infer<typeof lockGanttSchema>;
export type GanttInterventionInput = z.infer<typeof ganttInterventionSchema>;
export type DayGanttItemInput = z.infer<typeof dayGanttItemSchema>;
export type DependencyItemInput = z.infer<typeof dependencyItemSchema>;
export type PengawasanItemInput = z.infer<typeof pengawasanItemSchema>;
export type GanttListQuery = z.infer<typeof ganttListQuerySchema>;
export type GanttDetailQuery = z.infer<typeof ganttDetailQuerySchema>;
export type AddDayItemsInput = z.infer<typeof addDayItemsSchema>;
export type UpdateKeterlambatanInput = z.infer<typeof updateKeterlambatanSchema>;
export type UpdateKecepatanInput = z.infer<typeof updateKecepatanSchema>;
export type ManagePengawasanInput = z.infer<typeof managePengawasanSchema>;
export type CreateGanttNoteInput = z.infer<typeof createGanttNoteSchema>;
export type SubmitTakeoverInspectionInput = z.infer<typeof submitTakeoverInspectionSchema>;
