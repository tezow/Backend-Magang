import { z } from "zod";

export const dendaActionTypeSchema = z.enum(["SP", "TAKEOVER"]);
export const spReasonSchema = z.enum(["KETERLAMBATAN", "MENOLAK_SPK", "MANIPULASI", "KELALAIAN", "LAINNYA"]);
export const dendaActionStatusSchema = z.enum([
    "WAITING_MANAGER",
    "REJECTED_BY_MANAGER",
    "APPROVED",
    "SENT_TO_CONTRACTOR",
    "VIEWED_BY_CONTRACTOR",
    "ACKNOWLEDGED_BY_CONTRACTOR",
    "EXPIRED",
]);

export const listDendaActionsQuerySchema = z.object({
    id_toko: z.coerce.number().positive().optional(),
    id_opname_final: z.coerce.number().positive().optional(),
    nomor_ulok: z.string().trim().min(1).optional(),
    action_type: z.enum(["SP", "TAKEOVER"]).optional(),
    cabang_array: z.array(z.string()).optional(),
});

const requiredText = (max = 2000) => z.string().trim().min(1).max(max);

// Alasan yang tidak butuh ULOK (scope per kontraktor)
const KONTRAKTOR_SCOPE_REASONS = ["MANIPULASI", "LAINNYA"] as const;

export const createDendaActionSchema = z.discriminatedUnion("action_type", [
    z.object({
        action_type: z.literal("SP"),
        id_toko: z.coerce.number().positive().optional().nullable(),
        nama_kontraktor: z.string().trim().min(1).optional(),
        id_opname_final: z.coerce.number().positive().optional().nullable(),
        sp_level: z.coerce.number().int().min(1).max(3),
        alasan_sp: spReasonSchema,
        alasan_lainnya: z.string().trim().min(1).max(500).optional().nullable(), // untuk alasan LAINNYA
        catatan: requiredText(),
        lampiran_1_url: z.string().trim().max(1000).optional().nullable(),
        lampiran_2_url: z.string().trim().max(1000).optional().nullable(),
    }),
    z.object({
        id_opname_final: z.coerce.number().positive(),
        action_type: z.literal("TAKEOVER"),
        catatan: requiredText(),
        lampiran_1_url: z.string().trim().max(1000).optional().nullable(),
        lampiran_2_url: z.string().trim().max(1000).optional().nullable(),
    })
]).refine(data => {
    if (data.action_type === 'SP') {
        const isKontraktorScope = (KONTRAKTOR_SCOPE_REASONS as readonly string[]).includes(data.alasan_sp);
        // Alasan berbasis ULOK wajib ada id_toko
        if (!isKontraktorScope && !data.id_toko) {
            return false;
        }
        // Alasan berbasis kontraktor wajib ada nama_kontraktor (atau id_toko sebagai fallback)
        if (isKontraktorScope && !data.nama_kontraktor && !data.id_toko) {
            return false;
        }
        // Alasan LAINNYA wajib ada alasan_lainnya teks
        if (data.alasan_sp === 'LAINNYA' && !data.alasan_lainnya?.trim()) {
            return false;
        }
    }
    return true;
}, {
    message: "Validasi gagal: ULOK wajib dipilih untuk alasan berbasis ULOK; nama_kontraktor wajib untuk MANIPULASI/LAINNYA; alasan_lainnya wajib untuk LAINNYA.",
    path: ["id_toko"]
});

export const dendaActionIdParamsSchema = z.object({
    id: z.coerce.number().positive(),
});

export const rejectDendaActionSchema = z.object({
    alasan_penolakan: requiredText(),
});

export type DendaActionType = z.infer<typeof dendaActionTypeSchema>;
export const acknowledgeNoteSchema = z.object({
    catatan_acknowledge: z.string().trim().max(500).optional(),
});

export type DendaActionStatus = z.infer<typeof dendaActionStatusSchema>;
export type SpReason = z.infer<typeof spReasonSchema>;
export type ListDendaActionsQuery = z.infer<typeof listDendaActionsQuerySchema>;
export type CreateDendaActionInput = z.infer<typeof createDendaActionSchema>;
export type RejectDendaActionInput = z.infer<typeof rejectDendaActionSchema>;
export type AcknowledgeNoteInput = z.infer<typeof acknowledgeNoteSchema>;
