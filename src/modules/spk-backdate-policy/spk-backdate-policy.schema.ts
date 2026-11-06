import { z } from "zod";

export const updateSpkBackdatePolicySchema = z.object({
    branches: z.array(z.string().trim().min(1)).default([]),
});

export type UpdateSpkBackdatePolicyInput = z.infer<typeof updateSpkBackdatePolicySchema>;
