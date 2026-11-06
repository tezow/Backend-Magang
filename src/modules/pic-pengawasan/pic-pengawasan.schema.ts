import { z } from "zod";

export const createPicPengawasanSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    nomor_ulok: z.string().trim().min(1),
    id_rab: z.coerce.number().int().positive(),
    id_spk: z.coerce.number().int().positive(),
    kategori_lokasi: z.string().trim().min(1),
    durasi: z.string().trim().min(1),
    tanggal_mulai_spk: z.string().trim().min(1),
    plc_building_support: z.string().trim().min(1)
});

export const listPicPengawasanQuerySchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    id_rab: z.coerce.number().int().positive().optional(),
    id_spk: z.coerce.number().int().positive().optional()
});

export type CreatePicPengawasanInput = z.infer<typeof createPicPengawasanSchema>;
export type ListPicPengawasanQueryInput = z.infer<typeof listPicPengawasanQuerySchema>;