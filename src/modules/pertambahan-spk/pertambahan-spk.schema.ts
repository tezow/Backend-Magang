import { z } from "zod";

const VARCHAR_255 = 255;
const VARCHAR_500 = 500;

export const createPertambahanSpkSchema = z.object({
    id: z.coerce.number().int().positive().optional(),
    id_spk: z.coerce.number().int().positive(),
    pertambahan_hari: z.string().min(1).max(VARCHAR_255),
    tanggal_spk_akhir: z.string().min(1).max(VARCHAR_255),
    tanggal_spk_akhir_setelah_perpanjangan: z.string().min(1).max(VARCHAR_255),
    alasan_perpanjangan: z.string().min(1).max(VARCHAR_500),
    dibuat_oleh: z.string().min(1).max(VARCHAR_255),
    status_persetujuan: z.string().min(1).max(VARCHAR_255).default("Menunggu Persetujuan"),
    disetujui_oleh: z.string().max(VARCHAR_255).nullable().optional(),
    waktu_persetujuan: z.string().nullable().optional(),
    alasan_penolakan: z.string().max(VARCHAR_500).nullable().optional(),
    link_pdf: z.string().max(VARCHAR_500).nullable().optional(),
    link_lampiran_pendukung: z.string().max(VARCHAR_500).nullable().optional()
});

export const updatePertambahanSpkSchema = z.object({
    id_spk: z.coerce.number().int().positive().optional(),
    pertambahan_hari: z.string().min(1).max(VARCHAR_255).optional(),
    tanggal_spk_akhir: z.string().min(1).max(VARCHAR_255).optional(),
    tanggal_spk_akhir_setelah_perpanjangan: z.string().min(1).max(VARCHAR_255).optional(),
    alasan_perpanjangan: z.string().min(1).max(VARCHAR_500).optional(),
    dibuat_oleh: z.string().min(1).max(VARCHAR_255).optional(),
    status_persetujuan: z.string().min(1).max(VARCHAR_255).optional(),
    disetujui_oleh: z.string().max(VARCHAR_255).nullable().optional(),
    waktu_persetujuan: z.string().nullable().optional(),
    alasan_penolakan: z.string().max(VARCHAR_500).nullable().optional(),
    link_pdf: z.string().max(VARCHAR_500).nullable().optional(),
    link_lampiran_pendukung: z.string().max(VARCHAR_500).nullable().optional()
})
    .refine((value) => Object.keys(value).length > 0, {
        message: "Minimal satu field harus diisi untuk update"
    });

export const pertambahanSpkListQuerySchema = z.object({
    id_spk: z.coerce.number().int().positive().optional(),
    status_persetujuan: z.string().optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    cabang_array: z.array(z.string()).optional(),
    nama_kontraktor: z.string().trim().min(1).optional()
});

export const pertambahanSpkApprovalSchema = z
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

export const pertambahanSpkInterventionSchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    target_status: z.enum(["WAITING_FOR_BM_APPROVAL", "APPROVED_BY_BM", "REJECTED_BY_BM", "Menunggu Persetujuan", "Disetujui BM", "Ditolak BM"]),
    alasan_intervensi: z.string().trim().optional()
});

export type CreatePertambahanSpkInput = z.infer<typeof createPertambahanSpkSchema>;
export type UpdatePertambahanSpkInput = z.infer<typeof updatePertambahanSpkSchema>;
export type PertambahanSpkListQuery = z.infer<typeof pertambahanSpkListQuerySchema>;
export type PertambahanSpkApprovalInput = z.infer<typeof pertambahanSpkApprovalSchema>;
export type PertambahanSpkInterventionInput = z.infer<typeof pertambahanSpkInterventionSchema>;
