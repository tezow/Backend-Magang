import { z } from "zod";

export const pengawasanStatusSchema = z.enum(["progress", "selesai", "terlambat", "tidak_dikerjakan"]);

export const createPengawasanSchema = z.object({
    id_gantt: z.coerce.number().int().positive(),
    tanggal_pengawasan: z.string().trim().min(1),
    kategori_pekerjaan: z.string().trim().min(1),
    jenis_pekerjaan: z.string().trim().min(1),
    catatan: z.string().trim().min(1).optional(),
    dokumentasi: z.string().trim().min(1).optional(),
    status: pengawasanStatusSchema.optional(),
    append_resolution: z.coerce.boolean().optional(),
    opname_data: z.object({
        id_toko: z.coerce.number().int().positive(),
        id_rab_item: z.coerce.number().int().positive().optional(),
        id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
        volume_akhir: z.coerce.number(),
        selisih_volume: z.coerce.number(),
        total_selisih: z.coerce.number(),
        total_harga_opname: z.coerce.number(),
        desain: z.string().trim().min(1),
        kualitas: z.string().trim().min(1),
        spesifikasi: z.string().trim().min(1),
        catatan: z.string().trim().optional()
    }).optional()
});

export const bulkCreatePengawasanSchema = z.object({
    items: z.array(createPengawasanSchema).min(1)
});

const updatePengawasanFieldsSchema = z.object({
    kategori_pekerjaan: z.string().trim().min(1).optional(),
    jenis_pekerjaan: z.string().trim().min(1).optional(),
    catatan: z.string().trim().min(1).optional(),
    dokumentasi: z.string().trim().min(1).optional(),
    status: pengawasanStatusSchema.optional(),
    opname_data: z.object({
        id_toko: z.coerce.number().int().positive(),
        id_rab_item: z.coerce.number().int().positive().optional(),
        id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
        volume_akhir: z.coerce.number(),
        selisih_volume: z.coerce.number(),
        total_selisih: z.coerce.number(),
        total_harga_opname: z.coerce.number(),
        desain: z.string().trim().min(1),
        kualitas: z.string().trim().min(1),
        spesifikasi: z.string().trim().min(1),
        catatan: z.string().trim().optional()
    }).optional()
});

export const updatePengawasanSchema = updatePengawasanFieldsSchema;

export const bulkUpdatePengawasanSchema = z.object({
    items: z.array(
        updatePengawasanFieldsSchema.extend({
            id: z.coerce.number().int().positive()
        })
    ).min(1)
});

export const listPengawasanQuerySchema = z.object({
    id_gantt: z.coerce.number().int().positive().optional(),
    tanggal: z.string().trim().min(1).optional(),
    kategori_pekerjaan: z.string().trim().min(1).optional(),
    jenis_pekerjaan: z.string().trim().min(1).optional(),
    status: pengawasanStatusSchema.optional(),
    cabang_array: z.array(z.string()).optional(),
    nama_kontraktor: z.string().trim().min(1).optional()
});

export type PengawasanStatusInput = z.infer<typeof pengawasanStatusSchema>;
export type CreatePengawasanInput = z.infer<typeof createPengawasanSchema>;
export type CreatePengawasanData = Omit<CreatePengawasanInput, "tanggal_pengawasan"> & {
    id_pengawasan_gantt: number;
    dokumentasi?: string;
};
export type BulkCreatePengawasanInput = z.infer<typeof bulkCreatePengawasanSchema>;
export type UpdatePengawasanInput = z.infer<typeof updatePengawasanSchema>;
export type BulkUpdatePengawasanInput = z.infer<typeof bulkUpdatePengawasanSchema>;
export type BulkUpdatePengawasanItemInput = BulkUpdatePengawasanInput["items"][number];
export type ListPengawasanQueryInput = z.infer<typeof listPengawasanQuerySchema>;
