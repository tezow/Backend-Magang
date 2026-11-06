import { z } from "zod";

export const resendEmailSchema = z.object({
    ulok: z.string().trim().min(1),
    lingkup: z.string().trim().min(1),
    cabang: z.string().trim().min(1),
});

export const cabangLookupSchema = z.object({
    keyword: z.string().trim().optional().default(""),
});

export const ulokByCabangSchema = z.object({
    cabang: z.string().trim().min(1),
    keyword: z.string().trim().optional().default(""),
});

export const lingkupByUlokSchema = z.object({
    ulok: z.string().trim().min(1),
});

export type ResendEmailInput = z.infer<typeof resendEmailSchema>;
export type CabangLookupInput = z.infer<typeof cabangLookupSchema>;
export type UlokByCabangInput = z.infer<typeof ulokByCabangSchema>;
export type LingkupByUlokInput = z.infer<typeof lingkupByUlokSchema>;
