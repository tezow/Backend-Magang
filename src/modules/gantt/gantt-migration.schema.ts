import { z } from "zod";

export const ganttMigrationActionSchema = z.enum([
    "insert_source",
    "replace_source",
    "skip",
]);

export const ganttMigrationCommitSchema = z.object({
    actor_email: z.string().trim().email(),
    actor_role: z.string().trim().min(1),
    selections: z.array(
        z.object({
            nomor_ulok: z.string().trim().min(1),
            lingkup_pekerjaan: z.string().trim(),
            action: ganttMigrationActionSchema,
        })
    ).min(1),
});

export type GanttMigrationAction = z.infer<typeof ganttMigrationActionSchema>;
export type GanttMigrationCommitInput = z.infer<typeof ganttMigrationCommitSchema>;
