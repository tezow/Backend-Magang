import { z } from "zod";

export const createSerahTerimaPdfSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    // Kompatibilitas client lama. Nilai ini sengaja diabaikan karena timestamp
    // resmi Serah Terima selalu ditentukan oleh server.
    tanggal_aktual: z.string().optional(),
});

export type CreateSerahTerimaPdfInput = z.infer<typeof createSerahTerimaPdfSchema>;

export const createUnifiedSerahTerimaPdfSchema = z.object({
    nomor_ulok: z.string().trim().min(1),
    takeover_sequence: z.number().optional(),
});

export type CreateUnifiedSerahTerimaPdfInput = z.infer<typeof createUnifiedSerahTerimaPdfSchema>;

export const listBerkasSerahTerimaQuerySchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional(),
});

export type ListBerkasSerahTerimaQueryInput = z.infer<typeof listBerkasSerahTerimaQuerySchema>;

export const correctSerahTerimaDateSchema = z.object({
    nomor_ulok: z.string().trim().min(1, "Nomor ULOK wajib diisi"),
    cabang: z.string().trim().min(1).optional(),
    tanggal_serah_terima: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD"),
    catatan: z.string().trim().max(500).optional(),
});

export type CorrectSerahTerimaDateInput = z.infer<typeof correctSerahTerimaDateSchema>;

export const listSerahTerimaDateCorrectionHistoryQuerySchema = z.object({
    nomor_ulok: z.string().trim().min(1, "Nomor ULOK wajib diisi"),
    cabang: z.string().trim().min(1).optional(),
});

export type ListSerahTerimaDateCorrectionHistoryQueryInput = z.infer<typeof listSerahTerimaDateCorrectionHistoryQuerySchema>;
