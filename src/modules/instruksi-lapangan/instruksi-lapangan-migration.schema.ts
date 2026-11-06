import { z } from "zod";

export const instruksiLapanganMigrationActionSchema = z.enum(["insert", "replace", "skip"]);

export const instruksiLapanganMigrationPreviewSchema = z.object({
    actor_role: z.string().trim().min(1),
    actor_email: z.string().email().optional()
});

export const instruksiLapanganMigrationCommitSchema = instruksiLapanganMigrationPreviewSchema.extend({
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
        action: instruksiLapanganMigrationActionSchema
    })).min(1))
});

export type InstruksiLapanganMigrationAction = z.infer<typeof instruksiLapanganMigrationActionSchema>;
export type InstruksiLapanganMigrationCommitInput = z.infer<typeof instruksiLapanganMigrationCommitSchema>;
