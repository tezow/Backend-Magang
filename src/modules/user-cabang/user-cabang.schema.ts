import { z } from "zod";

export const createUserCabangSchema = z.object({
    cabang: z.string().trim().min(1),
    email_sat: z.string().trim().email(),
    nama_lengkap: z.string().trim().min(1).optional(),
    jabatan: z.string().trim().min(1).optional(),
    nama_pt: z.string().trim().min(1).optional(),
    workspace: z.enum(["store", "dc"]).optional()
});

export const updateUserCabangSchema = z.object({
    cabang: z.string().trim().min(1).optional(),
    email_sat: z.string().trim().email().optional(),
    nama_lengkap: z.string().trim().min(1).nullable().optional(),
    jabatan: z.string().trim().min(1).nullable().optional(),
    nama_pt: z.string().trim().min(1).nullable().optional(),
    workspace: z.enum(["store", "dc"]).optional()
}).refine((payload) => Object.keys(payload).length > 0, {
    message: "Minimal satu field harus diisi"
});

export const listUserCabangQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    cabang: z.string().trim().min(1).optional(),
    email_sat: z.string().trim().email().optional(),
    jabatan: z.string().trim().min(1).optional(),
    nama_pt: z.string().trim().min(1).optional(),
    include_branch_scope: z.coerce.boolean().optional(),
    workspace: z.enum(["store", "dc"]).optional()
});

export const userCabangIdParamSchema = z.object({
    id: z.coerce.number().int().positive()
});

export type CreateUserCabangInput = z.infer<typeof createUserCabangSchema>;
export type UpdateUserCabangInput = z.infer<typeof updateUserCabangSchema>;
export type ListUserCabangQueryInput = z.infer<typeof listUserCabangQuerySchema>;
