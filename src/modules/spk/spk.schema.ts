import { z } from "zod";

export const submitSpkSchema = z.object({
    id_toko: z.coerce.number().int().positive(),
    nomor_ulok: z.string().min(1),
    kode_toko: z.string()
        .length(4, "Kode toko harus tepat 4 karakter")
        .regex(/^[A-Z0-9]{4}$/i, "Kode toko harus 4 karakter alfanumerik (huruf dan angka)")
        .refine(val => val !== "----" && val.trim() !== "", "Kode toko tidak valid"),
    email_pembuat: z.string().email(),
    lingkup_pekerjaan: z.string().min(1),
    nama_kontraktor: z.string().min(1),
    proyek: z.string().min(1),
    waktu_mulai: z.string().min(1),
    durasi: z.coerce.number().int().positive(),
    grand_total: z.coerce.number().nonnegative(),
    par: z.string().optional().default(""),
    spk_manual_1: z.string().optional().default(""),
    spk_manual_2: z.string().optional().default("")
});

export const spkApprovalSchema = z
    .object({
        approver_email: z.string().email(),
        tindakan: z.enum(["APPROVE", "REJECT"]),
        alasan_penolakan: z.string().optional(),
        catatan_approval: z.string().nullable().optional()
    })
    .superRefine((value, ctx) => {
        if (value.tindakan === "REJECT" && !value.alasan_penolakan?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "alasan_penolakan wajib diisi saat reject",
                path: ["alasan_penolakan"]
            });
        }
    });

export const spkListQuerySchema = z.object({
    status: z.string().trim().min(1).optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    nama_kontraktor: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional() // Backend-injected branches
});

export const spkInterventionSchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    target_status: z.enum(["WAITING_FOR_BM_APPROVAL", "SPK_APPROVED", "SPK_REJECTED"]),
    alasan_intervensi: z.string().trim().optional()
});

export type SubmitSpkInput = z.infer<typeof submitSpkSchema>;
export type SpkApprovalInput = z.infer<typeof spkApprovalSchema>;
export type SpkListQuery = z.infer<typeof spkListQuerySchema>;
export type SpkInterventionInput = z.infer<typeof spkInterventionSchema>;
