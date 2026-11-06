import { z } from "zod";

export const pertambahanSpkMigrationActionSchema = z.enum([
    "insert",
    "replace",
    "skip"
]);

export const pertambahanSpkMigrationPreviewSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().email().optional()
});

export const pertambahanSpkMigrationCommitSchema = pertambahanSpkMigrationPreviewSchema.extend({
    selections: z.union([
        z.string().transform((value, ctx) => {
            try {
                return JSON.parse(value);
            } catch {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Format selections tidak valid"
                });
                return z.NEVER;
            }
        }),
        z.array(z.unknown())
    ]).pipe(z.array(z.object({
        source_candidate_id: z.coerce.number().int().positive(),
        action: pertambahanSpkMigrationActionSchema
    })).min(1))
});

export type PertambahanSpkMigrationAction = z.infer<typeof pertambahanSpkMigrationActionSchema>;
export type PertambahanSpkMigrationCommitInput = z.infer<typeof pertambahanSpkMigrationCommitSchema>;
