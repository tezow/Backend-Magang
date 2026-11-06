import { z } from "zod";

export const pengawasanMigrationActionSchema = z.enum([
    "insert",
    "skip",
    "replace_pengawasan",
    "update_pdf",
    "save_pdf_pending"
]);

export const pengawasanMigrationPreviewSchema = z.object({
    actor_role: z.string().trim().min(1)
});

export const pengawasanMigrationCommitSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().trim().email().optional(),
    selections: z.array(
        z.object({
            source_pengawasan_id: z.coerce.number().int().positive(),
            action: pengawasanMigrationActionSchema
        })
    ).min(1)
});

export type PengawasanMigrationAction = z.infer<typeof pengawasanMigrationActionSchema>;
export type PengawasanMigrationCommitInput = z.infer<typeof pengawasanMigrationCommitSchema>;
