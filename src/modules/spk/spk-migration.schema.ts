import { z } from "zod";

export const spkMigrationActionSchema = z.enum([
    "insert",
    "skip",
    "replace_spk",
    "update_status_pdf"
]);

export const spkMigrationPreviewSchema = z.object({
    actor_role: z.string().min(1),
    actor_email: z.string().email().optional()
});

export const spkMigrationCommitSchema = spkMigrationPreviewSchema.extend({
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
        source_spk_id: z.coerce.number().int().positive(),
        action: spkMigrationActionSchema
    })).min(1))
});

export type SpkMigrationAction = z.infer<typeof spkMigrationActionSchema>;
export type SpkMigrationCommitInput = z.infer<typeof spkMigrationCommitSchema>;
