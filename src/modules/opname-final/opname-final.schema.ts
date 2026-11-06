import { z } from "zod";

export const opnameFinalListQuerySchema = z.object({
    status: z.string().trim().min(1).optional(),
    aksi: z.enum(["active", "terkunci"]).optional(),
    id_toko: z.coerce.number().int().positive().optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional(), // Backend-injected branches
    nama_kontraktor: z.string().trim().min(1).optional(),
    tipe_opname: z.enum(["OPNAME", "OPNAME_FINAL"]).optional()
});

export const lockOpnameFinalItemSchema = z.object({
    id_rab_item: z.coerce.number().int().positive().optional(),
    id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
    status: z.enum(["pending", "disetujui", "ditolak"]).optional(),
    volume_akhir: z.coerce.number(),
    selisih_volume: z.coerce.number(),
    total_selisih: z.coerce.number().int(),
    total_harga_opname: z.coerce.number().int().optional().default(0),
    desain: z.string().trim().min(1).optional(),
    kualitas: z.string().trim().min(1).optional(),
    spesifikasi: z.string().trim().min(1).optional(),
    foto: z.string().trim().min(1).optional(),
    catatan: z.string().trim().min(1).optional()
}).refine(
    (data) =>
        (typeof data.id_rab_item !== "undefined" && typeof data.id_instruksi_lapangan_item === "undefined")
        || (typeof data.id_rab_item === "undefined" && typeof data.id_instruksi_lapangan_item !== "undefined"),
    { message: "Isi tepat salah satu: id_rab_item atau id_instruksi_lapangan_item" }
);

export const lockOpnameFinalSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    email_pembuat: z.string().email(),
    aksi: z.enum(["active", "terkunci"]).optional().default("terkunci"),
    grand_total_opname: z.union([z.string().trim().min(1), z.coerce.number()]).transform((value) => String(value)),
    grand_total_rab: z.union([z.string().trim().min(1), z.coerce.number()]).transform((value) => String(value)),
    opname_item: z.array(lockOpnameFinalItemSchema).min(1)
});

export const opnameFinalInterventionSchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    target_status: z.enum([
        "Menunggu Persetujuan Koordinator",
        "Menunggu Persetujuan Manajer",
        "Menunggu Persetujuan Direktur Kontraktor",
        "Ditolak oleh Koordinator",
        "Ditolak oleh Manajer",
        "Ditolak oleh Direktur Kontraktor",
    ]),
    alasan_intervensi: z.string().trim().min(5, "alasan_intervensi minimal 5 karakter"),
});

export type OpnameFinalListQueryInput = z.infer<typeof opnameFinalListQuerySchema>;
export type LockOpnameFinalInput = z.infer<typeof lockOpnameFinalSchema>;
export type LockOpnameFinalItemInput = z.infer<typeof lockOpnameFinalItemSchema>;
export type OpnameFinalInterventionInput = z.infer<typeof opnameFinalInterventionSchema>;
