import { z } from "zod";

export const rabMigrationActionSchema = z.enum([
    "insert",
    "skip",
    "update_created_at",
    "replace_rab_items",
    "replace_toko_rab_items",
    "replace_items"
]);

export const rabMigrationPreviewSchema = z.object({
    actor_role: z.string().min(1),
    actor_email: z.string().email().optional()
});

export const rabMigrationCommitSchema = rabMigrationPreviewSchema.extend({
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
        source_rab_id: z.coerce.number().int().positive(),
        action: rabMigrationActionSchema
    })).min(1))
});

export type RabMigrationAction = z.infer<typeof rabMigrationActionSchema>;
export type RabMigrationPreviewInput = z.infer<typeof rabMigrationPreviewSchema>;
export type RabMigrationCommitInput = z.infer<typeof rabMigrationCommitSchema>;
