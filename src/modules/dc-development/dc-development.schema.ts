import { z } from "zod";
import {
    DC_PROJECT_STAGE_SEQUENCE,
    DC_TENDER_TYPE,
    DC_VENDOR_SERVICE_TYPES
} from "./dc-development.constants";

export const dcDocumentCustomSlotSchema = z.enum(["PDF/JPEG", "AUTOCAD", "WORD", "EXCEL", "PPT"]);
export const dcDocumentCustomStageSchema = z.enum(["PEMBANGUNAN", "RENOVASI", "PERLUASAN"]);

export const logDcCategoryEditSchema = z.object({
    category_id: z.string().trim().min(1),
    category_name: z.string().trim().min(1),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    action_details: z.array(z.string()).optional(),
    itemized_details: z.record(z.array(z.string())).optional()
});

export const dcCategoryLogListQuerySchema = z.object({
    category_id: z.string().trim().min(1)
});

export const dcProjectListQuerySchema = z.object({
    status: z.string().optional(),
    current_stage: z.string().optional(),
    branch_name: z.string().optional(),
    search: z.string().optional(),
    actor_email: z.string().email().optional(),
    actor_role: z.string().trim().optional()
});

export const createDcProjectSchema = z.object({
    project_code: z.string().trim().min(1),
    project_name: z.string().trim().min(1),
    location_name: z.string().trim().optional(),
    branch_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    area_size: z.coerce.number().nonnegative().optional(),
    created_by_email: z.string().email().optional(),
    created_by_role: z.string().trim().optional()
});

export const advanceDcProjectStageSchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    reason: z.string().trim().optional(),
    target_stage: z.enum(DC_PROJECT_STAGE_SEQUENCE).optional(),
    is_intervention: z.coerce.boolean().optional()
});

export const createDcVendorSchema = z.object({
    company_name: z.string().trim().min(1),
    npwp: z.string().trim().optional(),
    address: z.string().trim().optional(),
    contact_name: z.string().trim().optional(),
    contact_email: z.string().email().optional(),
    contact_phone: z.string().trim().optional(),
    service_types: z.array(z.enum(DC_VENDOR_SERVICE_TYPES as [string, ...string[]])).default([]),
    created_by_email: z.string().email().optional()
});

export const createDcVendorUserSchema = z.object({
    email: z.string().email(),
    full_name: z.string().trim().optional(),
    phone: z.string().trim().optional()
});

export const createDcTenderSchema = z.object({
    tender_type: z.nativeEnum(DC_TENDER_TYPE),
    title: z.string().trim().min(1),
    owner_estimate_amount: z.coerce.number().nonnegative().optional(),
    oe_tolerance_percent: z.coerce.number().positive().default(10),
    created_by_email: z.string().email().optional()
});

export const dcTenderListQuerySchema = z.object({
    project_id: z.coerce.number().int().positive().optional(),
    tender_type: z.string().optional(),
    status: z.string().optional()
});

export const inviteDcTenderParticipantSchema = z.object({
    vendor_company_id: z.coerce.number().int().positive(),
    invited_by_email: z.string().email().optional()
});

export const submitDcTenderSubmissionSchema = z.object({
    submission_type: z.string().trim().min(1),
    submitted_offer_amount: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional(),
    submitted_by_email: z.string().email().optional()
});

export const setDcTenderWinnerSchema = z.object({
    participant_id: z.coerce.number().int().positive(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});


export const createDcTimelineSchema = z.object({
    task_name: z.string().trim().min(1),
    start_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    end_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    assigned_to_email: z.string().email().optional(),
    actor_email: z.string().email().optional()
});

export const updateDcTimelineSchema = z.object({
    progress_percent: z.coerce.number().min(0).max(100).optional(),
    status: z.string().trim().optional(),
    actor_email: z.string().email().optional()
});

export const createDcIssueSchema = z.object({
    issue_type: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    severity: z.string().trim().min(1),
    assigned_to_email: z.string().email().optional(),
    actor_email: z.string().email()
});

export const updateDcIssueSchema = z.object({
    status: z.string().trim(),
    resolution_notes: z.string().trim().optional(),
    actor_email: z.string().email()
});

export const createDcBastSchema = z.object({
    bast_type: z.string().trim().min(1),
    participant_id: z.coerce.number().optional(),
    notes: z.string().trim().optional(),
    actor_email: z.string().email()
});

export const updateDcBastSchema = z.object({
    status: z.string().trim(),
    checklist: z.record(z.any()).optional(),
    notes: z.string().trim().optional(),
    actor_email: z.string().email()
});

export const createDcTermScheduleSchema = z.object({
    term_no: z.coerce.number().min(1),
    percentage: z.coerce.number().min(0.01).max(100),
    amount: z.coerce.number().min(0),
    requirements: z.string().trim().optional(),
    actor_email: z.string().email()
});

export const submitDcTermClaimSchema = z.object({
    claimed_amount: z.coerce.number().min(0),
    actor_email: z.string().email()
});

export const dcApprovalListQuerySchema = z.object({
    status: z.string().optional(),
    required_role: z.string().optional(),
    project_id: z.coerce.number().int().positive().optional()
});

export const dcDocumentListQuerySchema = z.object({
    project_id: z.coerce.number().int().positive().optional(),
    tender_id: z.coerce.number().int().positive().optional(),
    participant_id: z.coerce.number().int().positive().optional(),
    document_type: z.string().optional(),
    entity_type: z.string().optional(),
    stage: z.string().optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const createDcDocumentSchema = z.object({
    project_id: z.coerce.number().int().positive(),
    tender_id: z.coerce.number().int().positive().optional(),
    participant_id: z.coerce.number().int().positive().optional(),
    entity_type: z.string().trim().min(1).default("DC_PROJECT"),
    entity_id: z.coerce.number().int().positive().optional(),
    document_type: z.string().trim().min(1),
    stage: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const updateDcDocumentSchema = z.object({
    document_type: z.string().trim().min(1).optional(),
    stage: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const dcDocumentActorQuerySchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1),
    stage: z.string().trim().optional()
});

export const dcDocumentCustomItemListQuerySchema = z.object({
    stage: dcDocumentCustomStageSchema.optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const createDcDocumentCustomItemSchema = z.object({
    stage: dcDocumentCustomStageSchema,
    title: z.string().trim().min(1).max(255),
    slots: z.array(dcDocumentCustomSlotSchema).min(1),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const deleteDcDocumentCustomItemSchema = z.object({
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const dcArchiveProjectListQuerySchema = z.object({
    search: z.string().trim().optional(),
    branch_name: z.string().trim().optional(),
    archive_type: z.string().trim().optional(),
    status: z.enum(["all", "lengkap", "belum"]).optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export const createDcArchiveProjectSchema = z.object({
    archive_code: z.string().trim().min(1),
    archive_name: z.string().trim().min(1),
    branch_name: z.string().trim().min(1),
    location_name: z.string().trim().optional(),
    project_type: z.string().trim().min(1),
    archive_type: z.string().trim().optional(),
    initial_code: z.string().trim().optional(),
    parent_dc_code: z.string().trim().optional(),
    parent_dc_name: z.string().trim().optional(),
    parent_branch_name: z.string().trim().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    actor_email: z.string().email(),
    actor_role: z.string().trim().min(1)
});

export type DcProjectListQuery = z.infer<typeof dcProjectListQuerySchema>;
export type CreateDcProjectInput = z.infer<typeof createDcProjectSchema>;
export type AdvanceDcProjectStageInput = z.infer<typeof advanceDcProjectStageSchema>;
export type CreateDcVendorInput = z.infer<typeof createDcVendorSchema>;
export type CreateDcVendorUserInput = z.infer<typeof createDcVendorUserSchema>;
export type CreateDcTenderInput = z.infer<typeof createDcTenderSchema>;
export type DcTenderListQuery = z.infer<typeof dcTenderListQuerySchema>;
export type InviteDcTenderParticipantInput = z.infer<typeof inviteDcTenderParticipantSchema>;
export type SubmitDcTenderSubmissionInput = z.infer<typeof submitDcTenderSubmissionSchema>;
export type SetDcTenderWinnerInput = z.infer<typeof setDcTenderWinnerSchema>;

export type CreateDcTimelineInput = z.infer<typeof createDcTimelineSchema>;
export type UpdateDcTimelineInput = z.infer<typeof updateDcTimelineSchema>;
export type CreateDcIssueInput = z.infer<typeof createDcIssueSchema>;
export type UpdateDcIssueInput = z.infer<typeof updateDcIssueSchema>;

export type CreateDcBastInput = z.infer<typeof createDcBastSchema>;
export type UpdateDcBastInput = z.infer<typeof updateDcBastSchema>;
export type CreateDcTermScheduleInput = z.infer<typeof createDcTermScheduleSchema>;
export type SubmitDcTermClaimInput = z.infer<typeof submitDcTermClaimSchema>;

export type DcApprovalListQuery = z.infer<typeof dcApprovalListQuerySchema>;
export type DcDocumentListQuery = z.infer<typeof dcDocumentListQuerySchema>;
export type CreateDcDocumentInput = z.infer<typeof createDcDocumentSchema>;
export type UpdateDcDocumentInput = z.infer<typeof updateDcDocumentSchema>;
export type DcDocumentActorQuery = z.infer<typeof dcDocumentActorQuerySchema>;
export type DcDocumentCustomItemListQuery = z.infer<typeof dcDocumentCustomItemListQuerySchema>;
export type CreateDcDocumentCustomItemInput = z.infer<typeof createDcDocumentCustomItemSchema>;
export type DeleteDcDocumentCustomItemInput = z.infer<typeof deleteDcDocumentCustomItemSchema>;
export type DcArchiveProjectListQuery = z.infer<typeof dcArchiveProjectListQuerySchema>;
export type CreateDcArchiveProjectInput = z.infer<typeof createDcArchiveProjectSchema>;
