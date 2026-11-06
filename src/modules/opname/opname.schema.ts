import { z } from "zod";

export const opnameStatusSchema = z.enum(["pending", "disetujui", "ditolak"]);

const normalizeVerificationValue = (value: unknown, options: readonly string[]) => {
    if (typeof value !== "string") return value;
    const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
    return options.find((option) => option.toLocaleLowerCase("id-ID") === normalized) ?? value.trim();
};

const sesuaiOptions = ["Sesuai", "Tidak Sesuai"] as const;
const kualitasOptions = ["Baik", "Tidak Baik"] as const;
const desainSchema = z.preprocess(
    (value) => normalizeVerificationValue(value, sesuaiOptions),
    z.enum(sesuaiOptions, { message: "desain tidak valid. Gunakan: Sesuai, Tidak Sesuai" })
);
const kualitasSchema = z.preprocess(
    (value) => normalizeVerificationValue(value, kualitasOptions),
    z.enum(kualitasOptions, { message: "kualitas tidak valid. Gunakan: Baik, Tidak Baik" })
);
const spesifikasiSchema = z.preprocess(
    (value) => normalizeVerificationValue(value, sesuaiOptions),
    z.enum(sesuaiOptions, { message: "spesifikasi tidak valid. Gunakan: Sesuai, Tidak Sesuai" })
);

export const createOpnameSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    id_opname_final: z.coerce.number().int().positive(),
    id_rab_item: z.coerce.number().int().positive().optional(),
    id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
    status: opnameStatusSchema.optional(),
    volume_akhir: z.coerce.number(),
    selisih_volume: z.coerce.number(),
    total_selisih: z.coerce.number().int(),
    total_harga_opname: z.coerce.number().int().optional().default(0),
    desain: desainSchema.optional(),
    kualitas: kualitasSchema.optional(),
    spesifikasi: spesifikasiSchema.optional(),
    catatan: z.string().trim().min(1).optional()
}).refine(
    (data) =>
        (typeof data.id_rab_item !== "undefined" && typeof data.id_instruksi_lapangan_item === "undefined")
        || (typeof data.id_rab_item === "undefined" && typeof data.id_instruksi_lapangan_item !== "undefined"),
    { message: "Isi tepat salah satu: id_rab_item atau id_instruksi_lapangan_item" }
);

export const bulkCreateOpnameItemSchema = z.object({
    id: z.coerce.number().int().positive().optional(),
    id_toko: z.coerce.number().int().positive().optional(),
    id_rab_item: z.coerce.number().int().positive().optional(),
    id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
    status: opnameStatusSchema.optional(),
    volume_akhir: z.coerce.number(),
    selisih_volume: z.coerce.number(),
    total_selisih: z.coerce.number().int(),
    total_harga_opname: z.coerce.number().int().optional().default(0),
    desain: desainSchema.optional(),
    kualitas: kualitasSchema.optional(),
    spesifikasi: spesifikasiSchema.optional(),
    catatan: z.string().trim().min(1).optional()
}).refine(
    (data) =>
        (typeof data.id_rab_item !== "undefined" && typeof data.id_instruksi_lapangan_item === "undefined")
        || (typeof data.id_rab_item === "undefined" && typeof data.id_instruksi_lapangan_item !== "undefined"),
    { message: "Isi tepat salah satu: id_rab_item atau id_instruksi_lapangan_item" }
);

export const bulkCreateOpnameSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    email_pembuat: z.string().email(),
    tipe_opname: z.enum(["OPNAME", "OPNAME_FINAL"]).optional().default("OPNAME"),
    grand_total_opname: z.union([z.string().trim().min(1), z.coerce.number()]).transform((value) => String(value)),
    grand_total_rab: z.union([z.string().trim().min(1), z.coerce.number()]).transform((value) => String(value)),
    items: z.array(bulkCreateOpnameItemSchema).min(1)
});

export const updateOpnameSchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    id_opname_final: z.coerce.number().int().positive().optional(),
    id_rab_item: z.coerce.number().int().positive().optional(),
    id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
    status: opnameStatusSchema.optional(),
    volume_akhir: z.coerce.number().optional(),
    selisih_volume: z.coerce.number().optional(),
    total_selisih: z.coerce.number().int().optional(),
    total_harga_opname: z.coerce.number().int().optional(),
    desain: desainSchema.optional(),
    kualitas: kualitasSchema.optional(),
    spesifikasi: spesifikasiSchema.optional(),
    foto: z.string().trim().min(1).optional(),
    catatan: z.string().trim().min(1).optional()
}).refine(
    (data: {
        id_toko?: number;
        id_opname_final?: number;
        id_rab_item?: number;
        id_instruksi_lapangan_item?: number;
        status?: "pending" | "disetujui" | "ditolak";
        volume_akhir?: number;
        selisih_volume?: number;
        total_selisih?: number;
        total_harga_opname?: number;
        desain?: string;
        kualitas?: string;
        spesifikasi?: string;
        foto?: string;
        catatan?: string;
    }) =>
        typeof data.id_toko !== "undefined"
        || typeof data.id_opname_final !== "undefined"
        || typeof data.id_rab_item !== "undefined"
        || typeof data.id_instruksi_lapangan_item !== "undefined"
        || typeof data.status !== "undefined"
        || typeof data.volume_akhir !== "undefined"
        || typeof data.selisih_volume !== "undefined"
        || typeof data.total_selisih !== "undefined"
        || typeof data.total_harga_opname !== "undefined"
        || typeof data.desain !== "undefined"
        || typeof data.kualitas !== "undefined"
        || typeof data.spesifikasi !== "undefined"
        || typeof data.foto !== "undefined"
        || typeof data.catatan !== "undefined",
    { message: "Minimal satu field harus diisi untuk update" }
);

export const listOpnameQuerySchema = z.object({
    id_toko: z.coerce.number().int().positive().optional(),
    id_opname_final: z.coerce.number().int().positive().optional(),
    id_rab_item: z.coerce.number().int().positive().optional(),
    id_instruksi_lapangan_item: z.coerce.number().int().positive().optional(),
    status: opnameStatusSchema.optional(),
    tipe_opname: z.enum(["OPNAME", "OPNAME_FINAL"]).optional()
});

export type CreateOpnameInput = z.infer<typeof createOpnameSchema>;
export type CreateOpnameData = CreateOpnameInput & { foto?: string };
export type CreateBulkOpnameItemInput = z.infer<typeof bulkCreateOpnameItemSchema>;
export type CreateBulkOpnameItemData = CreateBulkOpnameItemInput & { foto?: string };
export type BulkCreateOpnameInput = z.infer<typeof bulkCreateOpnameSchema>;
export type UpdateOpnameInput = z.infer<typeof updateOpnameSchema>;
export type ListOpnameQueryInput = z.infer<typeof listOpnameQuerySchema>;

export const bulkApproveOpnameSchema = z.object({
    id_toko: z.coerce.number().int().positive()
});
export type BulkApproveOpnameInput = z.infer<typeof bulkApproveOpnameSchema>;
