import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool";
import {
    DC_MEMBER_ACCESS_LEVEL,
    DC_MEMBER_TYPE,
    DC_PROJECT_STAGE_SEQUENCE,
    DC_PROJECT_STATUS,
    DC_TENDER_STATUS,
    type DcMemberAccessLevel,
    type DcProjectStatus
} from "./dc-development.constants";
import type {
    CreateDcArchiveProjectInput,
    CreateDcDocumentCustomItemInput,
    CreateDcProjectInput,
    CreateDcTenderInput,
    CreateDcVendorInput,
    CreateDcVendorUserInput,
    DcApprovalListQuery,
    DcArchiveProjectListQuery,
    DcDocumentListQuery,
    DcProjectListQuery
} from "./dc-development.schema";

export type DcProjectRow = {
    id: number;
    project_code: string;
    project_name: string;
    location_name: string | null;
    branch_name: string | null;
    address: string | null;
    area_size: string | null;
    status: DcProjectStatus;
    current_stage: DcProjectStatus;
    created_by_email: string | null;
    created_by_role: string | null;
    created_at: string;
    updated_at: string;
};

export type DcVendorCompanyRow = {
    id: number;
    company_name: string;
    npwp: string | null;
    address: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    status: string;
    created_by_email: string | null;
    created_at: string;
    updated_at: string;
    service_types?: string[];
};

export type DcTenderRow = {
    id: number;
    project_id: number;
    tender_type: string;
    status: string;
    title: string;
    owner_estimate_amount: string | null;
    oe_tolerance_percent: string;
    winner_participant_id: number | null;
    created_by_email: string | null;
    created_at: string;
    updated_at: string;
};

export type DcTenderParticipantRow = {
    id: number;
    tender_id: number;
    vendor_company_id: number;
    status: string;
    invited_by_email: string | null;
    invited_at: string;
    last_note: string | null;
    company_name?: string;
};

export type DcTenderSubmissionRow = {
    id: number;
    participant_id: number;
    submission_type: string;
    status: string;
    submitted_offer_amount: string | null;
    offer_vs_oe_percent: string | null;
    oe_review_required: boolean;
    oe_review_status: string | null;
    notes: string | null;
    submitted_by_email: string | null;
    submitted_at: string;
};

export type DcProjectMemberRow = {
    id: number;
    project_id: number;
    email: string;
    role: string | null;
    member_type: string;
    access_level: DcMemberAccessLevel;
    source_entity_type: string | null;
    source_entity_id: number | null;
    created_at: string;
    updated_at: string;
};

export type DcDocumentRow = {
    id: number;
    project_id: number | null;
    tender_id: number | null;
    participant_id: number | null;
    entity_type: string;
    entity_id: number | null;
    document_type: string;
    stage: string | null;
    status: string;
    created_by_email: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    current_version_id: number | null;
    version_no: number | null;
    drive_file_id: string | null;
    drive_folder_id: string | null;
    link_dokumen: string | null;
    link_folder: string | null;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: string | null;
    notes: string | null;
    uploaded_by_email: string | null;
    uploaded_by_role: string | null;
    version_created_at: string | null;
    project_code: string | null;
    project_name: string | null;
};

export type DcProjectTimelineRow = {
    id: number;
    project_id: number;
    task_name: string;
    start_date: string;
    end_date: string;
    progress_percent: string;
    status: string;
    assigned_to_email: string | null;
    created_at: string;
    updated_at: string;
};

export type DcIssueRow = {
    id: number;
    project_id: number;
    issue_type: string;
    title: string;
    description: string;
    status: string;
    severity: string;
    reported_by_email: string | null;
    assigned_to_email: string | null;
    resolved_at: string | null;
    resolution_notes: string | null;
    created_at: string;
    updated_at: string;
};

export type DcCategoryActivityLogRow = {
    id: number;
    project_id: number;
    actor_email: string;
    actor_role: string;
    created_at: string;
    metadata: any;
};

export type DcArchiveProjectRow = {
    id: number;
    project_id: number;
    archive_code: string;
    archive_name: string;
    branch_name: string;
    location_name: string | null;
    project_type: string;
    archive_type: string | null;
    initial_code: string | null;
    parent_dc_code: string | null;
    parent_dc_name: string | null;
    parent_branch_name: string | null;
    address: string | null;
    notes: string | null;
    created_by_email: string | null;
    created_by_role: string | null;
    created_at: string;
    updated_at: string;
    jumlah_dokumen: number;
    docs_pembangunan: number;
    docs_renovasi: number;
    docs_perluasan: number;
    custom_items_pembangunan: number;
    custom_items_renovasi: number;
    custom_items_perluasan: number;
    total_notes?: number;
    kategori_counts: Record<string, number>;
};

export type DcDocumentCustomItemRow = {
    id: number;
    archive_project_id: number;
    project_id: number;
    stage: "PEMBANGUNAN" | "RENOVASI" | "PERLUASAN";
    title: string;
    slots: string[];
    status: string;
    created_by_email: string | null;
    created_by_role: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
};

export type DcUploadedDocumentVersion = {
    drive_file_id: string;
    drive_folder_id: string | null;
    link_dokumen: string;
    link_folder: string | null;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    notes?: string | null;
    uploaded_by_email: string;
    uploaded_by_role: string;
};

export type DcBastRow = {
    id: number;
    project_id: number;
    participant_id: number | null;
    bast_type: string;
    notes: string | null;
    status: string;
    checklist: unknown | null;
    created_at: string;
    updated_at: string;
};

export type DcTermScheduleRow = {
    id: number;
    participant_id: number;
    term_no: number;
    percentage: string | null;
    amount: string | null;
    requirements: string | null;
    status: string;
    created_at: string;
};

export type DcTermClaimRow = {
    id: number;
    term_schedule_id: number;
    claimed_amount: string | null;
    status: string;
    submitted_by_email: string | null;
    submitted_at: string;
    updated_at: string;
};

const DC_PROJECT_COLUMNS = `
    id, project_code, project_name, location_name, branch_name, address,
    area_size, status, current_stage, created_by_email, created_by_role,
    created_at, updated_at
`;

const DC_DOCUMENT_SELECT = `
    d.id, d.project_id, d.tender_id, d.participant_id, d.entity_type, d.entity_id,
    d.document_type, d.stage, d.status, d.created_by_email, d.created_at, d.updated_at, d.deleted_at,
    v.id AS current_version_id,
    v.version_no,
    v.drive_file_id,
    v.drive_folder_id,
    v.link_dokumen,
    v.link_folder,
    v.file_name,
    v.mime_type,
    v.size_bytes,
    v.notes,
    v.uploaded_by_email,
    v.uploaded_by_role,
    v.created_at AS version_created_at,
    p.project_code,
    p.project_name
`;

const REQUIRED_ARCHIVE_DOCUMENT_CATEGORIES: string[] = [];

const insertActivityLog = async (
    client: PoolClient,
    input: {
        project_id?: number | null;
        entity_type: string;
        entity_id?: number | null;
        actor_email?: string | null;
        actor_role?: string | null;
        action: string;
        status_before?: string | null;
        status_after?: string | null;
        reason?: string | null;
        metadata?: Record<string, unknown> | null;
    }
) => {
    await client.query(
        `INSERT INTO dc_activity_log (
            project_id, entity_type, entity_id, actor_email, actor_role,
            action, status_before, status_after, reason, metadata, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, timezone('Asia/Jakarta', now()))`,
        [
            input.project_id ?? null,
            input.entity_type,
            input.entity_id ?? null,
            input.actor_email ?? null,
            input.actor_role ?? null,
            input.action,
            input.status_before ?? null,
            input.status_after ?? null,
            input.reason ?? null,
            input.metadata ? JSON.stringify(input.metadata) : null
        ]
    );
};

export const dcDevelopmentRepository = {
    async insertActivityLog(input: {
        project_id?: number | null;
        entity_type: string;
        entity_id?: number | null;
        actor_email?: string | null;
        actor_role?: string | null;
        action: string;
        status_before?: string | null;
        status_after?: string | null;
        reason?: string | null;
        metadata?: Record<string, unknown> | null;
    }) {
        return withTransaction(async (client) => {
            await insertActivityLog(client, input);
        });
    },

    async listCategoryActivityLogs(projectId: number, categoryId: string): Promise<DcCategoryActivityLogRow[]> {
        const result = await pool.query(
            `SELECT id, project_id, actor_email, actor_role, created_at, metadata
             FROM dc_activity_log
             WHERE project_id = $1 
               AND action = 'EDIT_CATEGORY_DOCUMENTS' 
               AND metadata->>'category_id' = $2
             ORDER BY created_at DESC`,
            [projectId, categoryId]
        );
        return result.rows;
    },

    async listArchiveProjects(filter: DcArchiveProjectListQuery, bypassAccess = false): Promise<DcArchiveProjectRow[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        const joins: string[] = [];

        if (!bypassAccess) {
            values.push(filter.actor_email);
            joins.push(`JOIN dc_project_member m ON m.project_id = a.project_id AND LOWER(m.email) = LOWER($${values.length})`);
        }
        if (filter.branch_name) {
            values.push(filter.branch_name);
            conditions.push(`(a.branch_name = $${values.length} OR a.parent_branch_name = $${values.length})`);
        }
        if (filter.archive_type && filter.archive_type !== "all") {
            values.push(filter.archive_type);
            conditions.push(`a.archive_type = $${values.length}`);
        }
        if (filter.search) {
            values.push(`%${filter.search}%`);
            conditions.push(`(
                a.archive_code ILIKE $${values.length}
                OR a.archive_name ILIKE $${values.length}
                OR COALESCE(a.location_name, '') ILIKE $${values.length}
                OR COALESCE(a.initial_code, '') ILIKE $${values.length}
                OR COALESCE(a.parent_dc_code, '') ILIKE $${values.length}
                OR COALESCE(a.parent_dc_name, '') ILIKE $${values.length}
                OR COALESCE(a.parent_branch_name, '') ILIKE $${values.length}
                OR a.branch_name ILIKE $${values.length}
            )`);
        }

        if (filter.status && filter.status !== "all") {
            const comparator = filter.status === "lengkap" ? ">" : "=";
            conditions.push(`(
                SELECT COUNT(DISTINCT d.document_type)
                FROM dc_document d
                LEFT JOIN dc_document_version v ON v.document_id = d.id AND v.is_current = true
                WHERE d.entity_type = 'DC_ARCHIVE_PROJECT'
                  AND d.project_id = a.project_id
                  AND d.status <> 'DELETED'
                  AND v.drive_file_id IS NOT NULL
            ) ${comparator} 0`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query<DcArchiveProjectRow>(
            `SELECT
                a.id,
                a.project_id,
                a.archive_code,
                a.archive_name,
                a.branch_name,
                a.location_name,
                a.project_type,
                a.archive_type,
                a.initial_code,
                a.parent_dc_code,
                a.parent_dc_name,
                a.parent_branch_name,
                a.address,
                a.notes,
                a.created_by_email,
                a.created_by_role,
                a.created_at,
                a.updated_at,
                COUNT(DISTINCT d.id) FILTER (WHERE v.drive_file_id IS NOT NULL)::int AS jumlah_dokumen,
                COUNT(DISTINCT split_part(d.document_type, '__', 1)) FILTER (WHERE UPPER(COALESCE(d.stage, '')) = 'PEMBANGUNAN' AND split_part(d.document_type, '__', 1) !~ '^(H|I|J|L)_' AND v.drive_file_id IS NOT NULL)::int AS docs_pembangunan,
                COUNT(DISTINCT split_part(d.document_type, '__', 1)) FILTER (WHERE UPPER(COALESCE(d.stage, '')) = 'RENOVASI' AND v.drive_file_id IS NOT NULL)::int AS docs_renovasi,
                COUNT(DISTINCT split_part(d.document_type, '__', 1)) FILTER (WHERE UPPER(COALESCE(d.stage, '')) = 'PERLUASAN' AND v.drive_file_id IS NOT NULL)::int AS docs_perluasan,
                (
                    SELECT COUNT(*)::int
                    FROM dc_document_custom_item
                    WHERE archive_project_id = a.id AND stage = 'PEMBANGUNAN' AND deleted_at IS NULL
                ) AS custom_items_pembangunan,
                (
                    SELECT COUNT(*)::int
                    FROM dc_document_custom_item
                    WHERE archive_project_id = a.id AND stage = 'RENOVASI' AND deleted_at IS NULL
                ) AS custom_items_renovasi,
                (
                    SELECT COUNT(*)::int
                    FROM dc_document_custom_item
                    WHERE archive_project_id = a.id AND stage = 'PERLUASAN' AND deleted_at IS NULL
                ) AS custom_items_perluasan,
                (
                    SELECT COUNT(DISTINCT d_notes.id)::int
                    FROM dc_document d_notes
                    LEFT JOIN dc_document_version v_notes ON v_notes.document_id = d_notes.id AND v_notes.is_current = true
                    WHERE d_notes.entity_type = 'DC_ARCHIVE_PROJECT'
                      AND d_notes.project_id = a.project_id
                      AND d_notes.status <> 'DELETED'
                      AND (d_notes.document_type IS NULL OR d_notes.document_type NOT LIKE 'CAT_NOTE_%')
                      AND v_notes.notes IS NOT NULL
                      AND v_notes.notes <> ''
                ) AS total_notes,
                COALESCE(
                    jsonb_object_agg(d.document_type, doc_counts.total) FILTER (WHERE d.document_type IS NOT NULL),
                    '{}'::jsonb
                ) AS kategori_counts
             FROM dc_archive_project a
             ${joins.join("\n")}
             LEFT JOIN (
                SELECT d2.project_id, d2.document_type, COUNT(*)::int AS total
                FROM dc_document d2
                LEFT JOIN dc_document_version v2 ON v2.document_id = d2.id AND v2.is_current = true
                WHERE d2.entity_type = 'DC_ARCHIVE_PROJECT'
                  AND d2.status <> 'DELETED'
                  AND v2.drive_file_id IS NOT NULL
                GROUP BY d2.project_id, d2.document_type
             ) doc_counts ON doc_counts.project_id = a.project_id
             LEFT JOIN dc_document d
                ON d.entity_type = 'DC_ARCHIVE_PROJECT'
               AND d.project_id = a.project_id
               AND d.status <> 'DELETED'
               AND d.document_type = doc_counts.document_type
             LEFT JOIN dc_document_version v
                ON v.document_id = d.id AND v.is_current = true
             ${whereClause}
             GROUP BY a.id
             ORDER BY a.updated_at DESC, a.id DESC`,
            values
        );

        return result.rows;
    },

    async createArchiveProject(input: CreateDcArchiveProjectInput): Promise<DcArchiveProjectRow> {
        return withTransaction(async (client) => {
            const projectResult = await client.query<DcProjectRow>(
                `INSERT INTO dc_project (
                    project_code, project_name, location_name, branch_name, address,
                    area_size, status, current_stage, created_by_email, created_by_role,
                    created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$6,$7,$8, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING ${DC_PROJECT_COLUMNS}`,
                [
                    input.archive_code,
                    input.archive_name,
                    input.location_name ?? null,
                    input.branch_name,
                    input.address ?? null,
                    DC_PROJECT_STATUS.LEGACY_ARCHIVE,
                    input.actor_email,
                    input.actor_role
                ]
            );
            const project = projectResult.rows[0];

            const archiveResult = await client.query<DcArchiveProjectRow>(
                `INSERT INTO dc_archive_project (
                    project_id, archive_code, archive_name, branch_name, location_name,
                    project_type, archive_type, initial_code, parent_dc_code, parent_dc_name,
                    parent_branch_name, address, notes, created_by_email, created_by_role,
                    created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id, project_id, archive_code, archive_name, branch_name, location_name,
                    project_type, archive_type, initial_code, parent_dc_code, parent_dc_name,
                    parent_branch_name, address, notes, created_by_email, created_by_role,
                    created_at, updated_at, 0::int AS jumlah_dokumen,
                    0::int AS docs_pembangunan, 0::int AS docs_renovasi, 0::int AS docs_perluasan,
                    '{}'::jsonb AS kategori_counts`,
                [
                    project.id,
                    input.archive_code,
                    input.archive_name,
                    input.branch_name,
                    input.location_name ?? null,
                    input.project_type,
                    input.archive_type ?? input.project_type,
                    input.initial_code ?? null,
                    input.parent_dc_code ?? null,
                    input.parent_dc_name ?? null,
                    input.parent_branch_name ?? input.branch_name,
                    input.address ?? null,
                    input.notes ?? null,
                    input.actor_email,
                    input.actor_role
                ]
            );
            const archive = archiveResult.rows[0];

            await this.upsertProjectMember(client, {
                project_id: project.id,
                email: input.actor_email,
                role: input.actor_role,
                member_type: DC_MEMBER_TYPE.INTERNAL,
                access_level: DC_MEMBER_ACCESS_LEVEL.MANAGE,
                source_entity_type: "DC_ARCHIVE_PROJECT",
                source_entity_id: archive.id
            });

            await insertActivityLog(client, {
                project_id: project.id,
                entity_type: "DC_ARCHIVE_PROJECT",
                entity_id: archive.id,
                actor_email: input.actor_email,
                actor_role: input.actor_role,
                action: "CREATE_ARCHIVE_PROJECT",
                status_after: "LEGACY_ARCHIVE",
                metadata: { archive_code: input.archive_code, project_type: input.project_type }
            });

            return archive;
        });
    },

    async listProjects(filter: DcProjectListQuery): Promise<DcProjectRow[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        const joins: string[] = [];

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`status = $${values.length}`);
        }
        if (filter.current_stage) {
            values.push(filter.current_stage);
            conditions.push(`current_stage = $${values.length}`);
        }
        if (filter.branch_name) {
            values.push(filter.branch_name);
            conditions.push(`branch_name = $${values.length}`);
        }
        if (filter.search) {
            values.push(`%${filter.search}%`);
            conditions.push(`(project_code ILIKE $${values.length} OR project_name ILIKE $${values.length} OR COALESCE(location_name, '') ILIKE $${values.length})`);
        }
        if (filter.actor_email) {
            values.push(filter.actor_email);
            joins.push(`JOIN dc_project_member m ON m.project_id = dc_project.id AND LOWER(m.email) = LOWER($${values.length})`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query<DcProjectRow>(
            `SELECT ${DC_PROJECT_COLUMNS}
             FROM dc_project
             ${joins.join("\n")}
             ${whereClause}
             ORDER BY updated_at DESC, id DESC`,
            values
        );

        return result.rows;
    },

    async createProject(input: CreateDcProjectInput): Promise<DcProjectRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcProjectRow>(
                `INSERT INTO dc_project (
                    project_code, project_name, location_name, branch_name, address,
                    area_size, status, current_stage, created_by_email, created_by_role,
                    created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING ${DC_PROJECT_COLUMNS}`,
                [
                    input.project_code,
                    input.project_name,
                    input.location_name ?? null,
                    input.branch_name ?? null,
                    input.address ?? null,
                    input.area_size ?? null,
                    DC_PROJECT_STATUS.PROJECT_CREATED,
                    DC_PROJECT_STATUS.PROJECT_CREATED,
                    input.created_by_email ?? null,
                    input.created_by_role ?? null
                ]
            );

            const project = result.rows[0];
            if (input.created_by_email) {
                await this.upsertProjectMember(client, {
                    project_id: project.id,
                    email: input.created_by_email,
                    role: input.created_by_role ?? null,
                    member_type: DC_MEMBER_TYPE.INTERNAL,
                    access_level: DC_MEMBER_ACCESS_LEVEL.MANAGE,
                    source_entity_type: "DC_PROJECT",
                    source_entity_id: project.id
                });
            }

            await insertActivityLog(client, {
                project_id: project.id,
                entity_type: "DC_PROJECT",
                entity_id: project.id,
                actor_email: input.created_by_email,
                actor_role: input.created_by_role,
                action: "CREATE_PROJECT",
                status_after: project.status
            });

            return project;
        });
    },

    async findProjectById(id: number): Promise<DcProjectRow | null> {
        const result = await pool.query<DcProjectRow>(
            `SELECT ${DC_PROJECT_COLUMNS}
             FROM dc_project
             WHERE id = $1
             LIMIT 1`,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async findArchiveProjectById(id: number): Promise<DcArchiveProjectRow | null> {
        const result = await pool.query<DcArchiveProjectRow>(
            `SELECT
                id,
                project_id,
                archive_code,
                archive_name,
                branch_name,
                location_name,
                project_type,
                archive_type,
                initial_code,
                parent_dc_code,
                parent_dc_name,
                parent_branch_name,
                address,
                notes,
                created_by_email,
                created_by_role,
                created_at,
                updated_at
             FROM dc_archive_project
             WHERE id = $1
             LIMIT 1`,
            [id]
        );
        return result.rows[0] ?? null;
    },

    async advanceProjectStage(input: {
        id: number;
        actor_email: string;
        actor_role: string;
        reason?: string;
        target_stage?: DcProjectStatus;
        is_intervention?: boolean;
    }): Promise<DcProjectRow> {
        return withTransaction(async (client) => {
            const currentRes = await client.query<DcProjectRow>(
                `SELECT ${DC_PROJECT_COLUMNS}
                 FROM dc_project
                 WHERE id = $1
                 FOR UPDATE`,
                [input.id]
            );

            const current = currentRes.rows[0];
            if (!current) throw new Error(`DC project dengan id ${input.id} tidak ditemukan`);

            const stageSequence = DC_PROJECT_STAGE_SEQUENCE as readonly string[];
            const currentIndex = stageSequence.indexOf(current.current_stage);
            if (currentIndex < 0) {
                throw new Error("Arsip legacy tidak dapat diproses lewat workflow stage project aktif");
            }
            const nextStage = input.target_stage ?? DC_PROJECT_STAGE_SEQUENCE[currentIndex + 1];
            if (!nextStage) return current;

            const targetIndex = stageSequence.indexOf(nextStage);
            const isNextStage = targetIndex === currentIndex + 1;
            if (!isNextStage && !input.is_intervention) {
                throw new Error("Perubahan stage tidak berurutan wajib memakai intervensi");
            }
            if (!isNextStage && input.is_intervention && !input.reason?.trim()) {
                throw new Error("Alasan intervensi wajib diisi");
            }

            const updatedRes = await client.query<DcProjectRow>(
                `UPDATE dc_project
                 SET current_stage = $1,
                     status = $1,
                     updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $2
                 RETURNING ${DC_PROJECT_COLUMNS}`,
                [nextStage, input.id]
            );
            const updated = updatedRes.rows[0];

            await insertActivityLog(client, {
                project_id: input.id,
                entity_type: "DC_PROJECT",
                entity_id: input.id,
                actor_email: input.actor_email,
                actor_role: input.actor_role,
                action: input.is_intervention ? "INTERVENE_STAGE" : "ADVANCE_STAGE",
                status_before: current.current_stage,
                status_after: updated.current_stage,
                reason: input.reason ?? null,
                metadata: { target_stage: input.target_stage ?? null }
            });

            return updated;
        });
    },

    async createTender(projectId: number, input: CreateDcTenderInput): Promise<DcTenderRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcTenderRow>(
                `INSERT INTO dc_tender (
                    project_id, tender_type, status, title, owner_estimate_amount,
                    oe_tolerance_percent, created_by_email, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id, project_id, tender_type, status, title, owner_estimate_amount,
                    oe_tolerance_percent, winner_participant_id, created_by_email, created_at, updated_at`,
                [
                    projectId,
                    input.tender_type,
                    DC_TENDER_STATUS.DRAFT,
                    input.title,
                    input.owner_estimate_amount ?? null,
                    input.oe_tolerance_percent,
                    input.created_by_email ?? null
                ]
            );

            const tender = result.rows[0];
            await insertActivityLog(client, {
                project_id: projectId,
                entity_type: "DC_TENDER",
                entity_id: tender.id,
                actor_email: input.created_by_email,
                action: "CREATE_TENDER",
                status_after: tender.status,
                metadata: { tender_type: tender.tender_type }
            });

            return tender;
        });
    },

    async listTenders(filter: { project_id?: number; tender_type?: string; status?: string }): Promise<(DcTenderRow & { project_code?: string; project_name?: string })[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        if (filter.project_id) {
            values.push(filter.project_id);
            conditions.push(`t.project_id = $${values.length}`);
        }
        if (filter.tender_type) {
            values.push(filter.tender_type);
            conditions.push(`t.tender_type = $${values.length}`);
        }
        if (filter.status) {
            values.push(filter.status);
            conditions.push(`t.status = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT t.*, p.project_code, p.project_name
             FROM dc_tender t
             LEFT JOIN dc_project p ON p.id = t.project_id
             ${whereClause}
             ORDER BY t.created_at DESC`
        , values);
        return result.rows;
    },

    async getTenderById(tenderId: number): Promise<DcTenderRow | null> {
        const result = await pool.query<DcTenderRow>(
            `SELECT * FROM dc_tender WHERE id = $1`, [tenderId]
        );
        return result.rows[0] ?? null;
    },

    async listTenderParticipants(tenderId: number): Promise<DcTenderParticipantRow[]> {
        const result = await pool.query<DcTenderParticipantRow>(
            `SELECT tp.*, vc.company_name
             FROM dc_tender_participant tp
             JOIN dc_vendor_company vc ON vc.id = tp.vendor_company_id
             WHERE tp.tender_id = $1
             ORDER BY tp.invited_at DESC`,
            [tenderId]
        );
        return result.rows;
    },

    async listTenderSubmissions(tenderId: number): Promise<DcTenderSubmissionRow[]> {
        const result = await pool.query<DcTenderSubmissionRow>(
            `SELECT ts.*
             FROM dc_tender_submission ts
             JOIN dc_tender_participant tp ON tp.id = ts.participant_id
             WHERE tp.tender_id = $1
             ORDER BY ts.submitted_at DESC`,
            [tenderId]
        );
        return result.rows;
    },

    async inviteTenderParticipant(tenderId: number, vendorId: number, email?: string): Promise<DcTenderParticipantRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcTenderParticipantRow>(
                `INSERT INTO dc_tender_participant (tender_id, vendor_company_id, status, invited_by_email, invited_at)
                 VALUES ($1, $2, 'INVITED', $3, timezone('Asia/Jakarta', now()))
                 RETURNING *`,
                [tenderId, vendorId, email ?? null]
            );

            await client.query(
                `UPDATE dc_tender SET status = 'IN_PROGRESS', updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $1 AND status = 'DRAFT'`,
                [tenderId]
            );

            await insertActivityLog(client, {
                entity_type: "DC_TENDER",
                entity_id: tenderId,
                actor_email: email,
                action: "INVITE_PARTICIPANT",
                metadata: { vendor_company_id: vendorId }
            });

            return result.rows[0];
        });
    },

    async submitTenderSubmission(participantId: number, tender: DcTenderRow, input: any): Promise<DcTenderSubmissionRow> {
        return withTransaction(async (client) => {
            let oeReviewRequired = false;
            let offerVsOePercent = null;

            if (tender.owner_estimate_amount && input.submitted_offer_amount) {
                const oe = Number(tender.owner_estimate_amount);
                const offer = Number(input.submitted_offer_amount);
                if (oe > 0) {
                    offerVsOePercent = ((offer - oe) / oe) * 100;
                    const tolerance = Number(tender.oe_tolerance_percent);
                    if (offerVsOePercent > tolerance || offerVsOePercent < -tolerance) {
                        oeReviewRequired = true;
                    }
                }
            }

            const result = await client.query<DcTenderSubmissionRow>(
                `INSERT INTO dc_tender_submission (
                    participant_id, submission_type, status, submitted_offer_amount,
                    offer_vs_oe_percent, oe_review_required, oe_review_status, notes,
                    submitted_by_email, submitted_at
                ) VALUES ($1, $2, 'SUBMITTED', $3, $4, $5, $6, $7, $8, timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [
                    participantId,
                    input.submission_type,
                    input.submitted_offer_amount ?? null,
                    offerVsOePercent,
                    oeReviewRequired,
                    oeReviewRequired ? 'PENDING' : null,
                    input.notes ?? null,
                    input.submitted_by_email ?? null
                ]
            );

            await client.query(
                `UPDATE dc_tender_participant SET status = 'SUBMITTED' WHERE id = $1`,
                [participantId]
            );

            await insertActivityLog(client, {
                entity_type: "DC_TENDER_PARTICIPANT",
                entity_id: participantId,
                actor_email: input.submitted_by_email,
                action: "SUBMIT_OFFER",
                metadata: { offer_amount: input.submitted_offer_amount, requires_oe_review: oeReviewRequired }
            });

            return result.rows[0];
        });
    },

    async setTenderWinner(tenderId: number, participantId: number, actorEmail: string, actorRole: string): Promise<DcTenderRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcTenderRow>(
                `UPDATE dc_tender
                 SET winner_participant_id = $1,
                     status = 'COMPLETED',
                     updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $2
                 RETURNING *`,
                [participantId, tenderId]
            );

            await client.query(
                `UPDATE dc_tender_participant SET status = 'WON' WHERE id = $1`,
                [participantId]
            );

            await client.query(
                `UPDATE dc_tender_participant SET status = 'LOST' WHERE tender_id = $1 AND id != $2`,
                [tenderId, participantId]
            );

            const tender = result.rows[0];

            await insertActivityLog(client, {
                project_id: tender.project_id,
                entity_type: "DC_TENDER",
                entity_id: tenderId,
                actor_email: actorEmail,
                actor_role: actorRole,
                action: "SET_WINNER",
                status_after: 'COMPLETED',
                metadata: { winner_participant_id: participantId }
            });

            return tender;
        });
    },

    async listProjectTimelines(projectId: number): Promise<DcProjectTimelineRow[]> {
        const result = await pool.query<DcProjectTimelineRow>(
            `SELECT * FROM dc_project_timeline
             WHERE project_id = $1
             ORDER BY start_date ASC, id ASC`,
            [projectId]
        );
        return result.rows;
    },

    async addProjectTimeline(projectId: number, input: any): Promise<DcProjectTimelineRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcProjectTimelineRow>(
                `INSERT INTO dc_project_timeline (
                    project_id, task_name, start_date, end_date, progress_percent, status, assigned_to_email, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 0, 'NOT_STARTED', $5, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [projectId, input.task_name, input.start_date, input.end_date, input.assigned_to_email ?? null]
            );

            await insertActivityLog(client, {
                project_id: projectId,
                entity_type: "DC_PROJECT_TIMELINE",
                entity_id: result.rows[0].id,
                actor_email: input.actor_email,
                action: "ADD_TIMELINE_TASK",
                metadata: { task_name: input.task_name, start_date: input.start_date, end_date: input.end_date }
            });

            return result.rows[0];
        });
    },

    async updateProjectTimeline(taskId: number, input: any): Promise<DcProjectTimelineRow> {
        return withTransaction(async (client) => {
            const currentRes = await client.query(`SELECT project_id, status FROM dc_project_timeline WHERE id = $1`, [taskId]);
            const current = currentRes.rows[0];

            let updateSql = `UPDATE dc_project_timeline SET updated_at = timezone('Asia/Jakarta', now())`;
            const params: any[] = [taskId];
            let paramIndex = 2;

            if (input.progress_percent !== undefined) {
                updateSql += `, progress_percent = $${paramIndex++}`;
                params.push(input.progress_percent);
            }
            if (input.status) {
                updateSql += `, status = $${paramIndex++}`;
                params.push(input.status);
            }

            updateSql += ` WHERE id = $1 RETURNING *`;

            const result = await client.query<DcProjectTimelineRow>(updateSql, params);

            await insertActivityLog(client, {
                project_id: current.project_id,
                entity_type: "DC_PROJECT_TIMELINE",
                entity_id: taskId,
                actor_email: input.actor_email,
                action: "UPDATE_TIMELINE_TASK",
                status_before: current.status,
                status_after: input.status,
                metadata: { progress_percent: input.progress_percent }
            });

            return result.rows[0];
        });
    },

    async listProjectIssues(projectId: number): Promise<DcIssueRow[]> {
        const result = await pool.query<DcIssueRow>(
            `SELECT * FROM dc_issue
             WHERE project_id = $1
             ORDER BY created_at DESC`,
            [projectId]
        );
        return result.rows;
    },

    async addProjectIssue(projectId: number, input: any): Promise<DcIssueRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcIssueRow>(
                `INSERT INTO dc_issue (
                    project_id, issue_type, title, description, status, severity, reported_by_email, assigned_to_email, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [projectId, input.issue_type, input.title, input.description, input.severity, input.actor_email, input.assigned_to_email ?? null]
            );

            await insertActivityLog(client, {
                project_id: projectId,
                entity_type: "DC_ISSUE",
                entity_id: result.rows[0].id,
                actor_email: input.actor_email,
                action: "REPORT_ISSUE",
                status_after: 'OPEN',
                metadata: { issue_type: input.issue_type, severity: input.severity }
            });

            return result.rows[0];
        });
    },

    async updateProjectIssue(issueId: number, input: any): Promise<DcIssueRow> {
        return withTransaction(async (client) => {
            const currentRes = await client.query(`SELECT project_id, status FROM dc_issue WHERE id = $1`, [issueId]);
            const current = currentRes.rows[0];

            let resolvedAtSql = input.status === 'RESOLVED' || input.status === 'CLOSED' ? `timezone('Asia/Jakarta', now())` : `NULL`;

            const result = await client.query<DcIssueRow>(
                `UPDATE dc_issue
                 SET status = $1,
                     resolution_notes = COALESCE($2, resolution_notes),
                     resolved_at = ${resolvedAtSql},
                     updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $3
                 RETURNING *`,
                [input.status, input.resolution_notes ?? null, issueId]
            );

            await insertActivityLog(client, {
                project_id: current.project_id,
                entity_type: "DC_ISSUE",
                entity_id: issueId,
                actor_email: input.actor_email,
                action: "UPDATE_ISSUE",
                status_before: current.status,
                status_after: input.status,
                metadata: { resolution_notes: input.resolution_notes }
            });

            return result.rows[0];
        });
    },

    async listProjectBast(projectId: number): Promise<DcBastRow[]> {
        const result = await pool.query<DcBastRow>(
            `SELECT * FROM dc_bast WHERE project_id = $1 ORDER BY created_at DESC`,
            [projectId]
        );
        return result.rows;
    },

    async createProjectBast(projectId: number, input: any): Promise<DcBastRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcBastRow>(
                `INSERT INTO dc_bast (
                    project_id, participant_id, bast_type, notes, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'DRAFT', timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [projectId, input.participant_id ?? null, input.bast_type, input.notes ?? null]
            );

            await insertActivityLog(client, {
                project_id: projectId,
                entity_type: "DC_BAST",
                entity_id: result.rows[0].id,
                actor_email: input.actor_email,
                action: "CREATE_BAST",
                status_after: 'DRAFT',
                metadata: { bast_type: input.bast_type }
            });

            return result.rows[0];
        });
    },

    async updateProjectBast(bastId: number, input: any): Promise<DcBastRow> {
        return withTransaction(async (client) => {
            const currentRes = await client.query(`SELECT project_id, status FROM dc_bast WHERE id = $1`, [bastId]);
            const current = currentRes.rows[0];

            const result = await client.query<DcBastRow>(
                `UPDATE dc_bast
                 SET status = $1,
                     checklist = COALESCE($2, checklist),
                     notes = COALESCE($3, notes),
                     updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $4
                 RETURNING *`,
                [input.status, input.checklist ?? null, input.notes ?? null, bastId]
            );

            await insertActivityLog(client, {
                project_id: current.project_id,
                entity_type: "DC_BAST",
                entity_id: bastId,
                actor_email: input.actor_email,
                action: "UPDATE_BAST",
                status_before: current.status,
                status_after: input.status,
            });

            return result.rows[0];
        });
    },

    async listParticipantTerms(participantId: number): Promise<{ schedules: DcTermScheduleRow[], claims: DcTermClaimRow[] }> {
        const schedulesRes = await pool.query<DcTermScheduleRow>(
            `SELECT * FROM dc_term_schedule WHERE participant_id = $1 ORDER BY term_no ASC`,
            [participantId]
        );

        let claims: DcTermClaimRow[] = [];
        if (schedulesRes.rows.length > 0) {
            const scheduleIds = schedulesRes.rows.map(s => s.id);
            const claimsRes = await pool.query<DcTermClaimRow>(
                `SELECT * FROM dc_term_claim WHERE term_schedule_id = ANY($1) ORDER BY submitted_at DESC`,
                [scheduleIds]
            );
            claims = claimsRes.rows;
        }

        return { schedules: schedulesRes.rows, claims };
    },

    async addTermSchedule(participantId: number, input: any): Promise<DcTermScheduleRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcTermScheduleRow>(
                `INSERT INTO dc_term_schedule (
                    participant_id, term_no, percentage, amount, requirements, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, 'PROPOSED', timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [participantId, input.term_no, input.percentage, input.amount, input.requirements ?? null]
            );

            await insertActivityLog(client, {
                entity_type: "DC_TERM_SCHEDULE",
                entity_id: result.rows[0].id,
                actor_email: input.actor_email,
                action: "ADD_TERM_SCHEDULE",
                status_after: 'PROPOSED',
                metadata: { term_no: input.term_no, amount: input.amount }
            });

            return result.rows[0];
        });
    },

    async submitTermClaim(termId: number, input: any): Promise<DcTermClaimRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcTermClaimRow>(
                `INSERT INTO dc_term_claim (
                    term_schedule_id, claimed_amount, status, submitted_by_email, submitted_at, updated_at
                ) VALUES ($1, $2, 'SUBMITTED', $3, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING *`,
                [termId, input.claimed_amount, input.actor_email]
            );

            await insertActivityLog(client, {
                entity_type: "DC_TERM_CLAIM",
                entity_id: result.rows[0].id,
                actor_email: input.actor_email,
                action: "SUBMIT_TERM_CLAIM",
                status_after: 'SUBMITTED',
                metadata: { claimed_amount: input.claimed_amount }
            });

            return result.rows[0];
        });
    },

    async listVendors(): Promise<DcVendorCompanyRow[]> {
        const result = await pool.query<DcVendorCompanyRow & { service_types: string[] | null }>(
            `SELECT v.id, v.company_name, v.npwp, v.address, v.contact_name, v.contact_email,
                v.contact_phone, v.status, v.created_by_email, v.created_at, v.updated_at,
                COALESCE(array_agg(s.service_type) FILTER (WHERE s.service_type IS NOT NULL), '{}') AS service_types
             FROM dc_vendor_company v
             LEFT JOIN dc_vendor_service s ON s.vendor_company_id = v.id
             GROUP BY v.id
             ORDER BY v.company_name ASC`
        );

        return result.rows;
    },

    async createVendor(input: CreateDcVendorInput): Promise<DcVendorCompanyRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcVendorCompanyRow>(
                `INSERT INTO dc_vendor_company (
                    company_name, npwp, address, contact_name, contact_email, contact_phone,
                    status, created_by_email, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id, company_name, npwp, address, contact_name, contact_email,
                    contact_phone, status, created_by_email, created_at, updated_at`,
                [
                    input.company_name,
                    input.npwp ?? null,
                    input.address ?? null,
                    input.contact_name ?? null,
                    input.contact_email ?? null,
                    input.contact_phone ?? null,
                    input.created_by_email ?? null
                ]
            );

            const vendor = result.rows[0];
            for (const serviceType of input.service_types) {
                await client.query(
                    `INSERT INTO dc_vendor_service (vendor_company_id, service_type)
                     VALUES ($1,$2)
                     ON CONFLICT (vendor_company_id, service_type) DO NOTHING`,
                    [vendor.id, serviceType]
                );
            }

            await insertActivityLog(client, {
                entity_type: "DC_VENDOR_COMPANY",
                entity_id: vendor.id,
                actor_email: input.created_by_email,
                action: "CREATE_VENDOR",
                status_after: vendor.status,
                metadata: { service_types: input.service_types }
            });

            return { ...vendor, service_types: input.service_types };
        });
    },

    async createVendorUser(vendorId: number, input: CreateDcVendorUserInput): Promise<unknown> {
        const result = await pool.query(
            `INSERT INTO dc_vendor_user (vendor_company_id, email, full_name, phone, status, created_at)
             VALUES ($1,$2,$3,$4,'ACTIVE', timezone('Asia/Jakarta', now()))
             RETURNING id, vendor_company_id, email, full_name, phone, status, created_at`,
            [vendorId, input.email, input.full_name ?? null, input.phone ?? null]
        );

        return result.rows[0];
    },

    async listApprovals(filter: DcApprovalListQuery): Promise<unknown[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        if (filter.status) {
            values.push(filter.status);
            conditions.push(`a.status = $${values.length}`);
        }
        if (filter.required_role) {
            values.push(filter.required_role);
            conditions.push(`a.required_role = $${values.length}`);
        }
        if (filter.project_id) {
            values.push(filter.project_id);
            conditions.push(`a.project_id = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT a.*, p.project_code, p.project_name, p.current_stage
             FROM dc_approval a
             LEFT JOIN dc_project p ON p.id = a.project_id
             ${whereClause}
             ORDER BY a.created_at DESC, a.id DESC`,
            values
        );

        return result.rows;
    },

    async listDocuments(filter: DcDocumentListQuery, bypassAccess = false): Promise<DcDocumentRow[]> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        const joins: string[] = [];
        if (!bypassAccess) {
            values.push(filter.actor_email);
            joins.push(`JOIN dc_project_member m ON m.project_id = d.project_id`);
            conditions.push(`LOWER(m.email) = LOWER($${values.length})`);
        }
        conditions.push(`d.status <> 'DELETED'`);
        if (filter.project_id) {
            values.push(filter.project_id);
            conditions.push(`d.project_id = $${values.length}`);
        }
        if (filter.tender_id) {
            values.push(filter.tender_id);
            conditions.push(`d.tender_id = $${values.length}`);
        }
        if (filter.participant_id) {
            values.push(filter.participant_id);
            conditions.push(`d.participant_id = $${values.length}`);
        }
        if (filter.document_type) {
            values.push(filter.document_type);
            conditions.push(`d.document_type = $${values.length}`);
        }
        if (filter.entity_type) {
            values.push(filter.entity_type);
            conditions.push(`d.entity_type = $${values.length}`);
        }
        if (filter.stage) {
            values.push(filter.stage);
            conditions.push(`d.stage = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query<DcDocumentRow>(
            `SELECT ${DC_DOCUMENT_SELECT}
             FROM dc_document d
             ${joins.join("\n")}
             LEFT JOIN dc_document_version v ON v.document_id = d.id AND v.is_current = true
             LEFT JOIN dc_project p ON p.id = d.project_id
             ${whereClause}
             ORDER BY d.created_at DESC, d.id DESC`,
            values
        );

        return result.rows;
    },

    async upsertProjectMember(
        client: PoolClient,
        input: {
            project_id: number;
            email: string;
            role?: string | null;
            member_type: string;
            access_level: DcMemberAccessLevel;
            source_entity_type?: string | null;
            source_entity_id?: number | null;
        }
    ): Promise<void> {
        const updated = await client.query(
            `UPDATE dc_project_member
             SET role = $3,
                 member_type = $4,
                 access_level = $5,
                 updated_at = timezone('Asia/Jakarta', now())
             WHERE project_id = $1
               AND LOWER(email) = LOWER($2)
               AND COALESCE(source_entity_type, '') = COALESCE($6, '')
               AND COALESCE(source_entity_id, 0) = COALESCE($7, 0)`,
            [
                input.project_id,
                input.email,
                input.role ?? null,
                input.member_type,
                input.access_level,
                input.source_entity_type ?? null,
                input.source_entity_id ?? null
            ]
        );

        if ((updated.rowCount ?? 0) > 0) return;

        await client.query(
            `INSERT INTO dc_project_member (
                project_id, email, role, member_type, access_level,
                source_entity_type, source_entity_id, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
            ON CONFLICT DO NOTHING`,
            [
                input.project_id,
                input.email,
                input.role ?? null,
                input.member_type,
                input.access_level,
                input.source_entity_type ?? null,
                input.source_entity_id ?? null
            ]
        );
    },

    async listCustomDocumentItems(filter: { archive_project_id: number; stage?: string | null }): Promise<DcDocumentCustomItemRow[]> {
        const values: unknown[] = [filter.archive_project_id];
        const conditions = ["archive_project_id = $1", "status <> 'DELETED'"];
        if (filter.stage) {
            values.push(filter.stage);
            conditions.push(`stage = $${values.length}`);
        }

        const result = await pool.query<DcDocumentCustomItemRow>(
            `SELECT id, archive_project_id, project_id, stage, title, slots, status,
                    created_by_email, created_by_role, created_at, updated_at, deleted_at
             FROM dc_document_custom_item
             WHERE ${conditions.join(" AND ")}
             ORDER BY id ASC`,
            values
        );
        return result.rows;
    },

    async createCustomDocumentItem(archiveProject: DcArchiveProjectRow, input: CreateDcDocumentCustomItemInput): Promise<DcDocumentCustomItemRow> {
        return withTransaction(async (client) => {
            const result = await client.query<DcDocumentCustomItemRow>(
                `INSERT INTO dc_document_custom_item (
                    archive_project_id, project_id, stage, title, slots, status,
                    created_by_email, created_by_role, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5::jsonb,'ACTIVE',$6,$7, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id, archive_project_id, project_id, stage, title, slots, status,
                    created_by_email, created_by_role, created_at, updated_at, deleted_at`,
                [
                    archiveProject.id,
                    archiveProject.project_id,
                    input.stage,
                    input.title,
                    JSON.stringify(input.slots),
                    input.actor_email,
                    input.actor_role
                ]
            );
            const item = result.rows[0];
            await insertActivityLog(client, {
                project_id: archiveProject.project_id,
                entity_type: "DC_DOCUMENT_CUSTOM_ITEM",
                entity_id: item.id,
                actor_email: input.actor_email,
                actor_role: input.actor_role,
                action: "CREATE_CUSTOM_DOCUMENT_ITEM",
                status_after: item.status,
                metadata: { stage: input.stage, title: input.title, slots: input.slots }
            });
            return item;
        });
    },

    async findCustomDocumentItemById(id: number): Promise<DcDocumentCustomItemRow | null> {
        const result = await pool.query<DcDocumentCustomItemRow>(
            `SELECT id, archive_project_id, project_id, stage, title, slots, status,
                    created_by_email, created_by_role, created_at, updated_at, deleted_at
             FROM dc_document_custom_item
             WHERE id = $1 AND status <> 'DELETED'
             LIMIT 1`,
            [id]
        );
        return result.rows[0] ?? null;
    },

    async softDeleteCustomDocumentItem(id: number, actor: { email: string; role: string }): Promise<DcDocumentCustomItemRow | null> {
        return withTransaction(async (client) => {
            const result = await client.query<DcDocumentCustomItemRow>(
                `UPDATE dc_document_custom_item
                 SET status = 'DELETED', deleted_at = timezone('Asia/Jakarta', now()), updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $1 AND status <> 'DELETED'
                 RETURNING id, archive_project_id, project_id, stage, title, slots, status,
                    created_by_email, created_by_role, created_at, updated_at, deleted_at`,
                [id]
            );
            const item = result.rows[0] ?? null;
            if (item) {
                await insertActivityLog(client, {
                    project_id: item.project_id,
                    entity_type: "DC_DOCUMENT_CUSTOM_ITEM",
                    entity_id: item.id,
                    actor_email: actor.email,
                    actor_role: actor.role,
                    action: "DELETE_CUSTOM_DOCUMENT_ITEM",
                    status_before: "ACTIVE",
                    status_after: "DELETED",
                    metadata: { stage: item.stage, title: item.title }
                });
            }
            return item;
        });
    },

    async findProjectMember(projectId: number, email: string): Promise<DcProjectMemberRow | null> {
        const result = await pool.query<DcProjectMemberRow>(
            `SELECT id, project_id, email, role, member_type, access_level,
                    source_entity_type, source_entity_id, created_at, updated_at
             FROM dc_project_member
             WHERE project_id = $1
               AND LOWER(email) = LOWER($2)
             ORDER BY
                CASE access_level
                    WHEN 'MANAGE' THEN 3
                    WHEN 'UPLOAD' THEN 2
                    ELSE 1
                END DESC,
                id DESC
             LIMIT 1`,
            [projectId, email]
        );
        return result.rows[0] ?? null;
    },

    async validateDocumentRelations(input: {
        project_id: number;
        tender_id?: number;
        participant_id?: number;
    }): Promise<void> {
        if (input.tender_id) {
            const tender = await pool.query(
                `SELECT id FROM dc_tender WHERE id = $1 AND project_id = $2`,
                [input.tender_id, input.project_id]
            );
            if ((tender.rowCount ?? 0) === 0) {
                throw new Error("Tender tidak terhubung dengan project DC yang dipilih");
            }
        }

        if (input.participant_id) {
            const participant = await pool.query(
                `SELECT tp.id
                 FROM dc_tender_participant tp
                 JOIN dc_tender t ON t.id = tp.tender_id
                 WHERE tp.id = $1
                   AND t.project_id = $2
                   AND ($3::int IS NULL OR tp.tender_id = $3::int)`,
                [input.participant_id, input.project_id, input.tender_id ?? null]
            );
            if ((participant.rowCount ?? 0) === 0) {
                throw new Error("Participant tidak terhubung dengan project/tender DC yang dipilih");
            }
        }
    },

    async createDocumentWithVersion(
        input: {
            project_id: number;
            tender_id?: number | null;
            participant_id?: number | null;
            entity_type: string;
            entity_id?: number | null;
            document_type: string;
            stage?: string | null;
            created_by_email: string;
            notes?: string | null;
        },
        version?: DcUploadedDocumentVersion
    ): Promise<DcDocumentRow> {
        return withTransaction(async (client) => {
            const documentResult = await client.query<{ id: number }>(
                `INSERT INTO dc_document (
                    project_id, tender_id, participant_id, entity_type, entity_id,
                    document_type, stage, status, created_by_email, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id`,
                [
                    input.project_id,
                    input.tender_id ?? null,
                    input.participant_id ?? null,
                    input.entity_type,
                    input.entity_id ?? null,
                    input.document_type,
                    input.stage ?? null,
                    input.created_by_email
                ]
            );

            const documentId = documentResult.rows[0].id;

            if (version || input.notes) {
                await client.query(
                    `INSERT INTO dc_document_version (
                        document_id, version_no, drive_file_id, drive_folder_id, link_dokumen, link_folder,
                        file_name, mime_type, size_bytes, notes, uploaded_by_email, uploaded_by_role,
                        is_current, created_at
                    ) VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true, timezone('Asia/Jakarta', now()))`,
                    [
                        documentId,
                        version?.drive_file_id ?? null,
                        version?.drive_folder_id ?? null,
                        version?.link_dokumen ?? null,
                        version?.link_folder ?? null,
                        version?.file_name ?? null,
                        version?.mime_type ?? null,
                        version?.size_bytes ?? null,
                        input.notes ?? version?.notes ?? null,
                        version?.uploaded_by_email ?? input.created_by_email,
                        version?.uploaded_by_role ?? null
                    ]
                );
            }

            await insertActivityLog(client, {
                project_id: input.project_id,
                entity_type: "DC_DOCUMENT",
                entity_id: documentId,
                actor_email: input.created_by_email,
                actor_role: version?.uploaded_by_role ?? "SYSTEM",
                action: "CREATE_DOCUMENT",
                status_after: "ACTIVE",
                metadata: { document_type: input.document_type, file_name: version?.file_name ?? null }
            });

            const created = await client.query<DcDocumentRow>(
                `SELECT ${DC_DOCUMENT_SELECT}
                 FROM dc_document d
                 LEFT JOIN dc_document_version v ON v.document_id = d.id AND v.is_current = true
                 LEFT JOIN dc_project p ON p.id = d.project_id
                 WHERE d.id = $1`,
                [documentId]
            );
            return created.rows[0];
        });
    },

    async findDocumentById(id: number): Promise<DcDocumentRow | null> {
        const result = await pool.query<DcDocumentRow>(
            `SELECT ${DC_DOCUMENT_SELECT}
             FROM dc_document d
             LEFT JOIN dc_document_version v ON v.document_id = d.id AND v.is_current = true
             LEFT JOIN dc_project p ON p.id = d.project_id
             WHERE d.id = $1
               AND d.status <> 'DELETED'`,
            [id]
        );
        return result.rows[0] ?? null;
    },

    async updateDocumentNotes(documentId: number, notes: string | null, actor: { email: string; role: string }): Promise<void> {
        await withTransaction(async (client) => {
            const updated = await client.query(
                `UPDATE dc_document_version
                 SET notes = $2
                 WHERE document_id = $1 AND is_current = true`,
                [documentId, notes]
            );
            if ((updated.rowCount ?? 0) > 0) return;

            const versionNoResult = await client.query<{ version_no: number }>(
                `SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no
                 FROM dc_document_version
                 WHERE document_id = $1`,
                [documentId]
            );

            await client.query(
                `INSERT INTO dc_document_version (
                    document_id, version_no, drive_file_id, drive_folder_id, link_dokumen, link_folder,
                    file_name, mime_type, size_bytes, notes, uploaded_by_email, uploaded_by_role,
                    is_current, created_at
                ) VALUES ($1,$2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$3,$4,$5,true, timezone('Asia/Jakarta', now()))`,
                [documentId, versionNoResult.rows[0]?.version_no ?? 1, notes, actor.email, actor.role]
            );
        });
    },

    async updateDocumentMetadata(
        id: number,
        input: { document_type?: string; stage?: string | null }
    ): Promise<DcDocumentRow | null> {
        const fields: string[] = [];
        const values: Array<string | number | null> = [];

        if (typeof input.document_type !== "undefined") {
            values.push(input.document_type);
            fields.push(`document_type = $${values.length}`);
        }
        if (typeof input.stage !== "undefined") {
            values.push(input.stage ?? null);
            fields.push(`stage = $${values.length}`);
        }

        if (fields.length > 0) {
            values.push(id);
            await pool.query(
                `UPDATE dc_document
                 SET ${fields.join(", ")}, updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $${values.length}`,
                values
            );
        }

        return this.findDocumentById(id);
    },

    async addDocumentVersion(id: number, version: DcUploadedDocumentVersion): Promise<DcDocumentRow | null> {
        return withTransaction(async (client) => {
            const current = await client.query<{ project_id: number | null; document_type: string }>(
                `SELECT project_id, document_type FROM dc_document WHERE id = $1 AND status <> 'DELETED' FOR UPDATE`,
                [id]
            );
            if ((current.rowCount ?? 0) === 0) return null;

            const versionNoResult = await client.query<{ version_no: number }>(
                `SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no
                 FROM dc_document_version
                 WHERE document_id = $1`,
                [id]
            );
            const versionNo = versionNoResult.rows[0].version_no;

            await client.query(
                `UPDATE dc_document_version SET is_current = false WHERE document_id = $1`,
                [id]
            );

            await client.query(
                `INSERT INTO dc_document_version (
                    document_id, version_no, drive_file_id, drive_folder_id, link_dokumen, link_folder,
                    file_name, mime_type, size_bytes, notes, uploaded_by_email, uploaded_by_role,
                    is_current, created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true, timezone('Asia/Jakarta', now()))`,
                [
                    id,
                    versionNo,
                    version.drive_file_id,
                    version.drive_folder_id,
                    version.link_dokumen,
                    version.link_folder,
                    version.file_name,
                    version.mime_type,
                    version.size_bytes,
                    version.notes ?? null,
                    version.uploaded_by_email,
                    version.uploaded_by_role
                ]
            );

            await client.query(
                `UPDATE dc_document SET updated_at = timezone('Asia/Jakarta', now()) WHERE id = $1`,
                [id]
            );

            await insertActivityLog(client, {
                project_id: current.rows[0].project_id,
                entity_type: "DC_DOCUMENT",
                entity_id: id,
                actor_email: version.uploaded_by_email,
                actor_role: version.uploaded_by_role,
                action: "UPLOAD_DOCUMENT_VERSION",
                status_after: `VERSION_${versionNo}`,
                metadata: { file_name: version.file_name, document_type: current.rows[0].document_type }
            });

            const updated = await client.query<DcDocumentRow>(
                `SELECT ${DC_DOCUMENT_SELECT}
                 FROM dc_document d
                 LEFT JOIN dc_document_version v ON v.document_id = d.id AND v.is_current = true
                 LEFT JOIN dc_project p ON p.id = d.project_id
                 WHERE d.id = $1`,
                [id]
            );
            return updated.rows[0] ?? null;
        });
    },

    async softDeleteDocument(id: number, actor: { email: string; role: string }): Promise<DcDocumentRow | null> {
        return withTransaction(async (client) => {
            const result = await client.query<DcDocumentRow>(
                `UPDATE dc_document
                 SET status = 'DELETED',
                     deleted_at = timezone('Asia/Jakarta', now()),
                     updated_at = timezone('Asia/Jakarta', now())
                 WHERE id = $1
                   AND status <> 'DELETED'
                 RETURNING id, project_id, tender_id, participant_id, entity_type, entity_id,
                    document_type, stage, status, created_by_email, created_at, updated_at, deleted_at,
                    NULL::int AS current_version_id,
                    NULL::int AS version_no,
                    NULL::varchar AS drive_file_id,
                    NULL::varchar AS drive_folder_id,
                    NULL::text AS link_dokumen,
                    NULL::text AS link_folder,
                    NULL::varchar AS file_name,
                    NULL::varchar AS mime_type,
                    NULL::bigint AS size_bytes,
                    NULL::text AS notes,
                    NULL::varchar AS uploaded_by_email,
                    NULL::varchar AS uploaded_by_role,
                    NULL::timestamp AS version_created_at,
                    NULL::varchar AS project_code,
                    NULL::varchar AS project_name`,
                [id]
            );
            const deleted = result.rows[0] ?? null;
            if (deleted) {
                await insertActivityLog(client, {
                    project_id: deleted.project_id,
                    entity_type: "DC_DOCUMENT",
                    entity_id: id,
                    actor_email: actor.email,
                    actor_role: actor.role,
                    action: "DELETE_DOCUMENT",
                    status_before: "ACTIVE",
                    status_after: "DELETED",
                    metadata: { document_type: deleted.document_type }
                });
            }
            return deleted;
        });
    }
};
