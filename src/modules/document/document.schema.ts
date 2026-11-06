import { z } from "zod";

const optionalTrimmedString = z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional()
);

export const penyimpananDokumenCreateSchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    kode_toko: z.string().trim().min(1).optional(),
    nama_toko: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    nama_dokumen: z.string().trim().min(1),
    folder_name: z.string().trim().min(1).optional()
}).superRefine((value, ctx) => {
    if (value.id_toko) return;
    if (value.kode_toko && value.nama_toko && value.cabang) return;

    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "id_toko atau kode_toko + nama_toko + cabang wajib diisi"
    });
});

export const penyimpananDokumenArchiveStoreCreateSchema = z.object({
    nomor_ulok: optionalTrimmedString,
    kode_toko: z.string().trim().min(1),
    nama_toko: z.string().trim().min(1),
    cabang: z.string().trim().min(1),
    proyek: optionalTrimmedString,
    folder_link: optionalTrimmedString
});

export const penyimpananDokumenUpdateSchema = z.object({
    nama_dokumen: z.string().trim().min(1).optional()
});

export const penyimpananDokumenListQuerySchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    nama_dokumen: z.string().trim().min(1).optional(),
    kode_toko: z.string().trim().min(1).optional(),
    nama_toko: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional()
});

export const penyimpananDokumenMigrationSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().email().optional()
});

export const penyimpananDokumenIdParamSchema = z.object({
    id: z.coerce.number().int().positive()
});

export type PenyimpananDokumenCreateInput = z.infer<typeof penyimpananDokumenCreateSchema>;
export type PenyimpananDokumenArchiveStoreCreateInput = z.infer<typeof penyimpananDokumenArchiveStoreCreateSchema>;
export type PenyimpananDokumenUpdateInput = z.infer<typeof penyimpananDokumenUpdateSchema>;
export type PenyimpananDokumenListQueryInput = z.infer<typeof penyimpananDokumenListQuerySchema>;
