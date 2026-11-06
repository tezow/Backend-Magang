import { z } from "zod";

export const sendEmailNotificationSchema = z.object({
    cabang: z.string().trim().min(1),
    flag: z.string().trim().min(1),
    id_toko: z.coerce.number().int().positive().optional(),
    id_spk: z.coerce.number().int().positive().optional(),
    id_denda_action: z.coerce.number().int().positive().optional()
});

export type SendEmailNotificationInput = z.infer<typeof sendEmailNotificationSchema>;
