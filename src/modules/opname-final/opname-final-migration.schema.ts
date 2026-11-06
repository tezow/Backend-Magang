import { z } from "zod";

export const opnameFinalMigrationActionSchema = z.enum(["insert", "replace", "skip"]);

export const opnameFinalMigrationPreviewSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().email().optional()
});

export const opnameFinalMigrationCommitSchema = opnameFinalMigrationPreviewSchema.extend({
    selections: z.union([
        z.string().transform((value, ctx) => {
            try {
                return JSON.parse(value);
            } catch {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Format selections tidak valid" });
                return z.NEVER;
            }
        }),
        z.array(z.unknown())
    ]).pipe(z.array(z.object({
        source_candidate_id: z.coerce.number().int().positive(),
        action: opnameFinalMigrationActionSchema
    })).min(1))
});

export type OpnameFinalMigrationAction = z.infer<typeof opnameFinalMigrationActionSchema>;
export type OpnameFinalMigrationCommitInput = z.infer<typeof opnameFinalMigrationCommitSchema>;
