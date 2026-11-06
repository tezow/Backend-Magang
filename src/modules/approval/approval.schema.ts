import { z } from "zod";

const jabatanSchema = z.preprocess((value) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (normalized === "DIREKTUR KONTRAKTOR" || normalized === "DIREKTUR_KONTRAKTOR") {
        return "DIREKTUR";
    }
    return normalized;
}, z.enum(["KOORDINATOR", "MANAGER", "DIREKTUR", "KONTRAKTOR"]));
const tindakanSchema = z.enum(["APPROVE", "REJECT"]);
const rabBeanspotTypeSchema = z.preprocess((value) => {
    if (value === null || value === undefined) return value;
    const normalized = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (!normalized) return undefined;
    if (normalized === "RTD") return "RTD_ONLY";
    return normalized;
}, z.enum(["TIDAK", "ADVANCE", "MEDIUM", "RTD_ONLY"]).nullable().optional());
const nullablePositiveNumberSchema = z.preprocess((value) => {
    if (value === "") return null;
    return value;
}, z.coerce.number().positive().nullable().optional());

export const approvalActionSchema = z
    .object({
        approver_email: z.string().email(),
        nama_lengkap: z.string().nullable().optional(),
        jabatan: jabatanSchema,
        tindakan: tindakanSchema,
        // Frontend/Postman kadang mengirim null saat approve.
        alasan_penolakan: z.string().nullable().optional(),
        catatan_approval: z.string().nullable().optional(),
        revisi_item_ids: z.array(z.coerce.number().int().positive()).optional(),
        revisi_item_notes: z.record(z.string(), z.string().nullable().optional()).optional(),
        beanspot_type: rabBeanspotTypeSchema,
        is_hth: z.boolean().nullable().optional(),
        hth_meter: nullablePositiveNumberSchema,
        is_fasade: z.boolean().nullable().optional()
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

export type ApprovalActionInput = z.infer<typeof approvalActionSchema>;
