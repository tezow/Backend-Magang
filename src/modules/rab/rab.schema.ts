import { z } from "zod";

const nonNegativeNumericText = z.string().trim().transform(val => val.replace(/,/g, '.')).pipe(
    z.string().regex(/^\d+(\.\d+)?$/, {
        message: "Nilai harus berupa angka non-negatif"
    })
);

const positiveNumericText = z.string().trim().transform(val => val.replace(/,/g, '.')).pipe(
    z.string().regex(/^(?=.*[1-9])\d+(\.\d+)?$/, {
        message: "Nilai harus berupa angka lebih dari 0"
    })
);

const positiveIntegerText = z.string().trim().regex(/^[1-9]\d*$/, {
    message: "Nilai harus berupa bilangan bulat lebih dari 0"
});

export const detailItemSchema = z.object({
    kategori_pekerjaan: z.string().min(1),
    jenis_pekerjaan: z.string().min(1),
    satuan: z.string().min(1),
    volume: z.coerce.number().nonnegative(),
    harga_material: z.coerce.number().nonnegative(),
    harga_upah: z.coerce.number().nonnegative(),
    total_material: z.coerce.number().nonnegative().optional(),
    total_upah: z.coerce.number().nonnegative().optional(),
    total_harga: z.coerce.number().nonnegative().optional(),
    catatan: z.string().optional()
});

export const submitRabSchema = z.object({
    // --- field toko (masuk ke tabel toko, semua nullable kecuali nomor_ulok) ---
    nomor_ulok: z.string().min(1),
    lingkup_pekerjaan: z.string().optional(),
    nama_toko: z.string().optional(),
    kode_toko: z.string().optional(),
    proyek: z.string().optional(),
    cabang: z.string().optional(),
    alamat: z.string().optional(),
    nama_kontraktor: z.string().optional(),
    projek_planning_id: z.coerce.number().int().positive().optional(),

    // --- field rab ---
    email_pembuat: z.string().email(),
    nama_pt: z.string().min(1),
    durasi_pekerjaan: positiveIntegerText,
    logo: z.string().optional(),
    rev_logo: z.string().optional(),
    is_revisi: z
        .union([
            z.boolean(),
            z.enum(["true", "false"]).transform((value) => value === "true")
        ])
        .optional(),
    is_takeover: z
        .union([
            z.boolean(),
            z.enum(["true", "false"]).transform((value) => value === "true")
        ])
        .optional()
        .default(false),
    id_rab_revisi: z.coerce.number().int().positive().optional(),
    kategori_lokasi: z.string().optional(),
    no_polis: z.string().optional(),
    berlaku_polis: z.string().optional(),
    file_asuransi: z.string().optional(),
    rev_file_asuransi: z.string().optional(),
    luas_bangunan: nonNegativeNumericText.optional(),
    luas_terbangun: positiveNumericText.optional(),
    luas_area_terbuka: nonNegativeNumericText.optional(),
    luas_area_parkir: nonNegativeNumericText.optional(),
    luas_area_sales: nonNegativeNumericText.optional(),
    luas_gudang: nonNegativeNumericText.optional(),
    alamat_cabang: z.string().nullable().optional(),

    // --- field rab_item ---
    detail_items: z.array(detailItemSchema).min(1)
});

export const rabListQuerySchema = z.object({
    status: z.string().optional(),
    nomor_ulok: z.string().optional(),
    cabang: z.string().optional(),
    cabang_array: z.array(z.string()).optional(), // NEW: Backend-injected branches array
    nama_pt: z.string().optional(),
    email_pembuat: z.string().optional(),
    id_toko: z.coerce.number().int().positive().optional()
});

export const updateRabStatusSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    id_rab: z.coerce.number().int().positive(),
    status: z.string().min(1),
    actor_email: z.string().email().optional(),
    actor_role: z.string().trim().optional(),
    alasan_intervensi: z.string().trim().optional()
});

export const updateRabItemSchema = detailItemSchema.extend({
    id: z.coerce.number().int().positive()
});

const rabTotalsSchema = z.object({
    grand_total: z.coerce.number().nonnegative().optional(),
    grand_total_non_sbo: z.coerce.number().nonnegative().optional(),
    grand_total_final: z.coerce.number().nonnegative().optional()
});

export const bulkUpdateRabItemsSchema = z.object({
    items: z.array(updateRabItemSchema).min(1)
}).and(rabTotalsSchema);

export const replaceRabItemsSchema = z.object({
    items: z.array(detailItemSchema).min(1)
}).and(rabTotalsSchema);

export const deleteRabItemsSchema = z.object({
    item_ids: z.array(z.coerce.number().int().positive()).min(1)
});

export type SubmitRabInput = z.infer<typeof submitRabSchema>;
export type DetailItemInput = z.infer<typeof detailItemSchema>;
export type RabListQuery = z.infer<typeof rabListQuerySchema>;
export type UpdateRabStatusInput = z.infer<typeof updateRabStatusSchema>;
export type UpdateRabItemInput = z.infer<typeof updateRabItemSchema>;
export type BulkUpdateRabItemsInput = z.infer<typeof bulkUpdateRabItemsSchema>;
export type ReplaceRabItemsInput = z.infer<typeof replaceRabItemsSchema>;
export type DeleteRabItemsInput = z.infer<typeof deleteRabItemsSchema>;
