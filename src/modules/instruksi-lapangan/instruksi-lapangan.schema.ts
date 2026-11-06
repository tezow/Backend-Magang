import { z } from "zod";

export const instruksiLapanganItemSchema = z.object({
    kategori_pekerjaan: z.string().min(1),
    jenis_pekerjaan: z.string().min(1),
    satuan: z.string().min(1),
    volume: z.coerce.number().nonnegative(),
    harga_material: z.coerce.number().nonnegative(),
    harga_upah: z.coerce.number().nonnegative(),
    catatan: z.string().optional().nullable(),
});

export const submitInstruksiLapanganSchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    nomor_ulok: z.string().min(1),
    lingkup_pekerjaan: z.string().trim().optional(),
    email_pembuat: z.string().email(),
    tanggal_mulai: z.string().min(1),
    tanggal_selesai: z.string().min(1),
    id_instruksi_lapangan_revisi: z.coerce.number().int().positive().optional(),
    
    // Optional file from frontend
    lampiran: z.string().optional(),
    
    // Items
    detail_items: z.array(instruksiLapanganItemSchema).min(1)
});

export const listInstruksiLapanganQuerySchema = z.object({
    status: z.string().optional(),
    nomor_ulok: z.string().optional(),
    cabang: z.string().optional(),
    cabang_array: z.array(z.string()).optional(), // Backend-injected branches
    email_pembuat: z.string().optional(),
    id_toko: z.coerce.number().int().positive().optional()
});

export type SubmitInstruksiLapanganInput = z.infer<typeof submitInstruksiLapanganSchema>;
export type InstruksiLapanganItemInput = z.infer<typeof instruksiLapanganItemSchema>;
export type ListInstruksiLapanganQuery = z.infer<typeof listInstruksiLapanganQuerySchema>;
