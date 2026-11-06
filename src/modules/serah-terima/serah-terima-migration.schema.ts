import { z } from "zod";

export const serahTerimaMigrationActionSchema = z.enum(["insert", "replace", "skip"]);

export const serahTerimaMigrationPreviewSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().email().optional()
});

export const serahTerimaMigrationCommitSchema = serahTerimaMigrationPreviewSchema.extend({
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
        action: serahTerimaMigrationActionSchema
    })).min(1))
});

export type SerahTerimaMigrationAction = z.infer<typeof serahTerimaMigrationActionSchema>;
export type SerahTerimaMigrationCommitInput = z.infer<typeof serahTerimaMigrationCommitSchema>;
