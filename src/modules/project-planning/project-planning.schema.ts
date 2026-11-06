import { z } from "zod";

const zBooleanString = z.preprocess((val) => {
    if (typeof val === 'string') {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === '') return false;
        if (lower === 'true' || lower === '1') return true;
    }
    return Boolean(val);
}, z.boolean());

const fasilitasItemSchema = z.object({
    jenis_fasilitas: z.string(),
    nama_fasilitas_lainnya: z.string().nullable().optional(),
    is_tersedia: zBooleanString.default(false),
    keterangan: z.string().nullable().optional()
});

const optionalText = z.string().optional().or(z.literal(""));
const optionalDate = z.string().optional().or(z.literal("")).nullable();

const validateProjectPlanningBusinessRules = (val: {
    jenis_pengajuan: string;
    fasilitas?: z.infer<typeof fasilitasItemSchema>[];
}, ctx: z.RefinementCtx) => {
    const jenis = val.jenis_pengajuan
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);

    if (jenis.includes("DARK STORE") && jenis.length > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Dark Store tidak bisa digabung dengan jenis pengajuan lain",
            path: ["jenis_pengajuan"],
        });
    }

    (val.fasilitas ?? []).forEach((fac, index) => {
        const selected = fac.jenis_fasilitas === "LAINNYA"
            ? !!fac.nama_fasilitas_lainnya?.trim()
            : fac.is_tersedia;
        if (selected && !fac.keterangan?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Keterangan fasilitas wajib diisi jika fasilitas dipilih",
                path: ["fasilitas", index, "keterangan"],
            });
        }
    });
};

// ============================================================
// SUBMIT FPD (oleh Coordinator/Cabang) — record baru
// ============================================================

export const submitProjekPlanningSchema = z.object({
    id_toko: z.coerce.number().int().min(0).optional().default(0),
    nomor_ulok: z.string().min(1),
    // New fields for manual toko creation
    cabang: optionalText,
    nama_toko: optionalText,
    kode_toko: optionalText,
    alamat_toko: optionalText,
    link_google_maps: optionalText,
    akhir_masa_sewa: optionalDate,
    spd: z.coerce.number().nonnegative().optional().nullable(),
    link_ba_tidak_sesuai_standar: optionalText,
    
    email_pembuat: z.string().email(),
    lingkup_pekerjaan: optionalText,
    jenis_proyek: optionalText,
    estimasi_biaya: z.coerce.number().nonnegative().optional(),
    keterangan: z.string().optional(),
    link_fpd: optionalText,
    link_siteplan: optionalText,
    luas_bangunan: optionalText,
    luas_area_terbuka: optionalText,
    luas_area_terbangun: optionalText,
    luas_gudang: optionalText,
    luas_area_parkir: optionalText,
    luas_area_sales: optionalText,
    pxl_bangunan: optionalText,
    pxl_area_parkir: optionalText,
    p_bangunan: optionalText,
    l_bangunan: optionalText,
    p_area_parkir: optionalText,
    l_area_parkir: optionalText,
    jumlah_ac: z.coerce.number().int().optional(),
    pk_ac: optionalText,
    listrik_va: z.coerce.number().int().optional(),
    listrik_phase: z.coerce.number().int().optional(),
    sumber_air_bersih: optionalText,
    drainase_air_kotor: optionalText,

    // ── Identitas Pengajuan ──────────────────────────────────
    nama_pengaju: z.string().min(1, "Nama pengaju wajib diisi"),
    nama_lokasi: optionalText,

    // ── Jenis Pengajuan Desain ───────────────────────────────
    jenis_pengajuan: z.string().min(1, "Jenis pengajuan wajib dipilih"),
    jenis_pengajuan_lainnya: z.string().optional(),

    // ── Fasilitas Yang Disediakan ────────────────────────────
    fasilitas: z.array(fasilitasItemSchema).optional().default([]),

    // ── Ketentuan dari Pengelola/Landlord/Pihak Ketiga ───────
    ketentuan: z.array(z.string()).optional().default([]),

    // ── Catatan Desain (Hasil Ukur & Kondisi Lingkungan) ─────
    catatan_design: z.array(z.string()).optional().default([]),

    // ── Upload Files ─────────────────────────────────────────
    link_gambar_kerja: z.string().optional(),

    // ── Ruko / Non-Ruko ──────────────────────────────────────
    is_ruko: zBooleanString.optional().default(false),
    jumlah_lantai: z.coerce.number().int().min(1).max(20).optional(),

    // ── Gambar Kompetitor ────────────────────────────────────
    link_gambar_kompetitor: z.string().optional(),

    // ── Head to Head & Seating Area ─────────────────────────
    is_head_to_head: zBooleanString.optional().default(false),
    jarak_head_to_head: z.coerce.number().nonnegative().optional().nullable(),
    is_seating_area: zBooleanString.optional().default(false),

    // ── Kategori Toko ────────────────────────────────────────
    is_dark_store: zBooleanString.optional().default(false),

    // ── Tipe Bean Spot ───────────────────────────────────────
    beanspot_tipe: optionalText,
}).superRefine(validateProjectPlanningBusinessRules);

export type SubmitProjekPlanningInput = z.infer<typeof submitProjekPlanningSchema>;

// ============================================================
// RESUBMIT FPD (oleh Coordinator/Cabang — update record DRAFT yang sudah ada)
// ============================================================

export const resubmitProjekPlanningSchema = z.object({
    id_toko: z.coerce.number().int().min(0).optional().default(0),
    nomor_ulok: z.string().optional(),
    cabang: optionalText,
    nama_toko: optionalText,
    kode_toko: optionalText,
    alamat_toko: optionalText,
    proyek: optionalText,
    link_google_maps: optionalText,
    akhir_masa_sewa: optionalDate,
    spd: z.coerce.number().nonnegative().optional().nullable(),
    link_ba_tidak_sesuai_standar: optionalText,
    email_pembuat: z.string().email(),
    lingkup_pekerjaan: optionalText,
    jenis_proyek: optionalText,
    estimasi_biaya: z.coerce.number().nonnegative().optional(),
    keterangan: z.string().optional(),
    link_fpd: optionalText,
    link_siteplan: optionalText,
    luas_bangunan: optionalText,
    luas_area_terbuka: optionalText,
    luas_area_terbangun: optionalText,
    luas_gudang: optionalText,
    luas_area_parkir: optionalText,
    luas_area_sales: optionalText,
    pxl_bangunan: optionalText,
    pxl_area_parkir: optionalText,
    p_bangunan: optionalText,
    l_bangunan: optionalText,
    p_area_parkir: optionalText,
    l_area_parkir: optionalText,
    jumlah_ac: z.coerce.number().int().optional(),
    pk_ac: optionalText,
    listrik_va: z.coerce.number().int().optional(),
    listrik_phase: z.coerce.number().int().optional(),
    sumber_air_bersih: optionalText,
    drainase_air_kotor: optionalText,

    // ── Identitas Pengajuan ──────────────────────────────────
    nama_pengaju: z.string().min(1, "Nama pengaju wajib diisi"),
    nama_lokasi: optionalText,

    // ── Jenis Pengajuan Desain ───────────────────────────────
    jenis_pengajuan: z.string().min(1, "Jenis pengajuan wajib dipilih"),
    jenis_pengajuan_lainnya: z.string().optional(),

    // ── Fasilitas Yang Disediakan ────────────────────────────
    fasilitas: z.array(fasilitasItemSchema).optional().default([]),

    // ── Ketentuan dari Pengelola/Landlord/Pihak Ketiga ───────
    ketentuan: z.array(z.string()).optional().default([]),

    // ── Catatan Desain (Hasil Ukur & Kondisi Lingkungan) ─────
    catatan_design: z.array(z.string()).optional().default([]),

    // ── Upload Files ─────────────────────────────────────────
    link_gambar_kerja: z.string().optional(),

    // ── Ruko / Non-Ruko ──────────────────────────────────────
    is_ruko: zBooleanString.optional().default(false),
    jumlah_lantai: z.coerce.number().int().min(1).max(20).optional(),

    // ── Gambar Kompetitor ────────────────────────────────────
    link_gambar_kompetitor: z.string().optional(),

    // ── Head to Head & Seating Area ─────────────────────────
    is_head_to_head: zBooleanString.optional().default(false),
    jarak_head_to_head: z.coerce.number().nonnegative().optional().nullable(),
    is_seating_area: zBooleanString.optional().default(false),

    // ── Kategori Toko ────────────────────────────────────────
    is_dark_store: zBooleanString.optional().default(false),

    // ── Tipe Bean Spot ───────────────────────────────────────
    beanspot_tipe: optionalText,
}).superRefine(validateProjectPlanningBusinessRules);

export type ResubmitProjekPlanningInput = z.infer<typeof resubmitProjekPlanningSchema>;

// ============================================================
// APPROVAL (dipakai oleh BM, PP Manager)
// ============================================================

export const approvalSchema = z
    .object({
        approver_email: z.string().trim().email(),
        tindakan: z.enum(["APPROVE", "REJECT"]),
        catatan: z.string().optional(),
        alasan_penolakan: z.string().optional(),
    })
    .superRefine((val, ctx) => {
        if (val.tindakan === "REJECT" && !val.alasan_penolakan?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "alasan_penolakan wajib diisi saat menolak",
                path: ["alasan_penolakan"],
            });
        }
    });

export type ApprovalInput = z.infer<typeof approvalSchema>;

// ============================================================
// PP APPROVAL STAGE 1 (bisa APPROVE dengan/tanpa 3D, atau REJECT)
// ============================================================

export const ppApproval1Schema = z
    .object({
        approver_email: z.string().trim().email(),
        tindakan: z.enum(["APPROVE", "REJECT"]),
        butuh_desain_3d: z.boolean().optional().default(false),
        catatan: z.string().optional(),
        alasan_penolakan: z.string().optional(),
    })
    .superRefine((val, ctx) => {
        if (val.tindakan === "REJECT" && !val.alasan_penolakan?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "alasan_penolakan wajib diisi saat menolak",
                path: ["alasan_penolakan"],
            });
        }
    });

export type PpApproval1Input = z.infer<typeof ppApproval1Schema>;

// ============================================================
// REVIEW FINAL RAB & GAMBAR (PP Specialist / PP Manager)
// ============================================================

export const finalReviewSchema = z
    .object({
        approver_email: z.string().trim().email(),
        rab_tindakan: z.enum(["APPROVE", "REJECT"]),
        gambar_tindakan: z.enum(["APPROVE", "REJECT"]),
        catatan: z.string().optional(),
        alasan_penolakan: z.string().optional(),
        rab_rejected_item_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
        rab_rejected_item_notes: z.string().optional(),
        rab_rejected_items: z.array(z.object({ id: z.number(), note: z.string().optional() })).optional(),
    })
    .superRefine((val, ctx) => {
        if (val.gambar_tindakan === "REJECT" && !val.alasan_penolakan?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "alasan_penolakan wajib diisi saat menolak gambar final",
                path: ["alasan_penolakan"],
            });
        }
        if (
            val.rab_tindakan === "REJECT"
            && val.rab_rejected_item_ids.length === 0
            && !val.rab_rejected_item_notes?.trim()
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Catatan revisi RAB general atau item RAB wajib diisi saat menolak RAB",
                path: ["rab_rejected_item_notes"],
            });
        }
    });

export type FinalReviewInput = z.infer<typeof finalReviewSchema>;

// ============================================================
// UPLOAD 3D (oleh PP Specialist)
// ============================================================

export const upload3dSchema = z.object({
    uploader_email: z.string().email(),
    link_desain_3d: z.string().optional(),
    keterangan: z.string().optional(),
});

export type Upload3dInput = z.infer<typeof upload3dSchema>;

// ============================================================
// UPLOAD RAB & GAMBAR KERJA (oleh Coordinator/Cabang)
// ============================================================

export const uploadRabSchema = z.object({
    uploader_email: z.string().email(),
    id_toko: z.coerce.number().int().min(0).optional().default(0),
    nomor_ulok: z.string().optional(),
    cabang: optionalText,
    nama_toko: optionalText,
    kode_toko: optionalText,
    alamat_toko: optionalText,
    proyek: optionalText,
    jenis_proyek: optionalText,
    link_rab_sipil: z.string().optional(),
    link_rab_me: z.string().optional(),
    id_rab_sipil: z.coerce.number().int().positive().optional().nullable(),
    id_rab_me: z.coerce.number().int().positive().optional().nullable(),
    link_gambar_kerja_final_sipil: z.string().optional(),
    link_gambar_kerja_final_me: z.string().optional(),
    fasilitas: z.array(fasilitasItemSchema).optional().default([]),
    keterangan: z.string().optional(),
});

export type UploadRabInput = z.infer<typeof uploadRabSchema>;

// ============================================================
// QUERY LIST
// ============================================================

export const listProjekPlanningQuerySchema = z.object({
    status: z.string().optional(),
    nomor_ulok: z.string().optional(),
    cabang: z.string().optional(),
    email_pembuat: z.string().optional(),
    id_toko: z.coerce.number().int().positive().optional(),
    cabang_array: z.array(z.string()).optional(),
    _is_global_access: z.boolean().optional(),
    jenis: z.union([z.string(), z.array(z.string())]).optional(),
});

export type ListProjekPlanningQuery = z.infer<typeof listProjekPlanningQuerySchema>;

export const rabRequestQuerySchema = z.object({
    actor_email: z.string().trim().email(),
});

export const rabPrefillQuerySchema = z.object({
    actor_email: z.string().trim().email(),
    lingkup: z.enum(["SIPIL", "ME"]),
});

export type RabRequestQuery = z.infer<typeof rabRequestQuerySchema>;
export type RabPrefillQuery = z.infer<typeof rabPrefillQuerySchema>;

export const projekPlanningInterventionSchema = z.object({
    actor_email: z.string().trim().email(),
    actor_role: z.string().trim().min(1),
    target_status: z.enum([
        "DRAFT",
        "WAITING_BM_APPROVAL",
        "WAITING_PP_APPROVAL_1",
        "PP_DESIGN_3D_REQUIRED",
        "WAITING_RAB_UPLOAD",
        "WAITING_BM_APPROVAL_2",
        "WAITING_BM_REGIONAL_APPROVAL",
        "WAITING_PP_MANAGER_APPROVAL",
        "WAITING_PP_APPROVAL_2",
        "COMPLETED",
        "REJECTED",
    ]),
    alasan_intervensi: z.string().trim().min(5, "alasan_intervensi minimal 5 karakter"),
});

export type ProjekPlanningInterventionInput = z.infer<typeof projekPlanningInterventionSchema>;
