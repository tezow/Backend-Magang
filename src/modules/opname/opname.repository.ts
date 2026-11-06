import { type PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { OPNAME_FINAL_STATUS, REJECTED_OPNAME_FINAL_STATUSES } from "../opname-final/opname-final.constants";
import type {
    CreateBulkOpnameItemData,
    CreateOpnameData,
    ListOpnameQueryInput,
    UpdateOpnameInput
} from "./opname.schema";

/**
 * Sanitize foto value: if it's an API proxy path (e.g. /api/opname/123/foto),
 * return null so the DB COALESCE keeps the existing Drive link.
 */
const sanitizeFotoValue = (foto: string | null | undefined): string | null => {
    if (!foto) return null;
    if (/^\/api\/opname\/\d+\/foto$/.test(foto)) return null;
    return foto;
};

const CONTRACTOR_PROCESS_STATUS = "Proses KTK/Approval Kontraktor";

const getOpnameFinalLookupTypes = (tipeOpname: string): string[] => {
    if (tipeOpname === "OPNAME") return ["OPNAME", "OPNAME_FINAL"];
    return [tipeOpname];
};

const isRejectedOpnameFinalStatus = (status: string): boolean =>
    REJECTED_OPNAME_FINAL_STATUSES.includes(status as (typeof REJECTED_OPNAME_FINAL_STATUSES)[number]);

const isFinalApprovalStatus = (status: string): boolean =>
    (Object.values(OPNAME_FINAL_STATUS) as string[]).includes(status);
export type OpnameRow = {
    id: number;
    id_toko: number;
    id_opname_final: number;
    id_rab_item: number | null;
    id_instruksi_lapangan_item: number | null;
    status: "pending" | "disetujui" | "ditolak";
    volume_akhir: number;
    selisih_volume: number;
    total_selisih: number;
    total_harga_opname: number;
    desain: string | null;
    kualitas: string | null;
    spesifikasi: string | null;
    foto: string | null;
    catatan: string | null;
    created_at: string;
    rab_item?: {
        id: number;
        id_rab: number;
        kategori_pekerjaan: string | null;
        jenis_pekerjaan: string | null;
        satuan: string | null;
        volume: number | null;
        harga_material: number | null;
        harga_upah: number | null;
        total_material: number | null;
        total_upah: number | null;
        total_harga: number | null;
        catatan: string | null;
    } | null;
    instruksi_lapangan_item?: {
        id: number;
        id_instruksi_lapangan: number;
        kategori_pekerjaan: string | null;
        jenis_pekerjaan: string | null;
        satuan: string | null;
        volume: number | null;
        harga_material: number | null;
        harga_upah: number | null;
        total_material: number | null;
        total_upah: number | null;
        total_harga: number | null;
        catatan: string | null;
    } | null;
    toko?: TokoSummaryRow | null;
};

export type OpnameFinalHeaderRow = {
    id: number;
    id_toko: number;
    tipe_opname: string;
    aksi: "active" | "terkunci" | string;
    status_opname_final: string;
    link_pdf_opname: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    alasan_penolakan: string | null;
    grand_total_opname: string | null;
    grand_total_rab: string | null;
    hari_denda: number | null;
    nilai_denda: string | null;
    tanggal_akhir_spk_denda: string | null;
    tanggal_serah_terima_denda: string | null;
    created_at: string;
};

export type TokoSummaryRow = {
    id: number;
    nomor_ulok: string | null;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

const returningColumns = `
    id,
    id_toko,
    id_opname_final,
    id_rab_item,
    id_instruksi_lapangan_item,
    status,
    volume_akhir,
    selisih_volume,
    total_selisih,
    total_harga_opname,
    desain,
    kualitas,
    spesifikasi,
    foto,
    catatan,
    created_at
`;

const returningColumnsFromOpnameItem = `
    oi.id,
    oi.id_toko,
    oi.id_opname_final,
    oi.id_rab_item,
    oi.id_instruksi_lapangan_item,
    oi.status,
    oi.volume_akhir,
    oi.selisih_volume,
    oi.total_selisih,
    oi.total_harga_opname,
    oi.desain,
    oi.kualitas,
    oi.spesifikasi,
    oi.foto,
    oi.catatan,
    oi.created_at,
    CASE WHEN ri.id IS NULL THEN NULL ELSE json_build_object(
        'id', ri.id,
        'id_rab', ri.id_rab,
        'kategori_pekerjaan', ri.kategori_pekerjaan,
        'jenis_pekerjaan', ri.jenis_pekerjaan,
        'satuan', ri.satuan,
        'volume', ri.volume,
        'harga_material', ri.harga_material,
        'harga_upah', ri.harga_upah,
        'total_material', ri.total_material,
        'total_upah', ri.total_upah,
        'total_harga', ri.total_harga,
        'catatan', ri.catatan
    ) END AS rab_item,
    CASE WHEN ili.id IS NULL THEN NULL ELSE json_build_object(
        'id', ili.id,
        'id_instruksi_lapangan', ili.id_instruksi_lapangan,
        'kategori_pekerjaan', ili.kategori_pekerjaan,
        'jenis_pekerjaan', ili.jenis_pekerjaan,
        'satuan', ili.satuan,
        'volume', ili.volume,
        'harga_material', ili.harga_material,
        'harga_upah', ili.harga_upah,
        'total_material', ili.total_material,
        'total_upah', ili.total_upah,
        'total_harga', ili.total_harga,
        'catatan', ili.catatan
    ) END AS instruksi_lapangan_item,
    CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object(
        'id', t.id,
        'nomor_ulok', t.nomor_ulok,
        'lingkup_pekerjaan', t.lingkup_pekerjaan,
        'nama_toko', t.nama_toko,
        'kode_toko', t.kode_toko,
        'proyek', t.proyek,
        'cabang', t.cabang,
        'alamat', t.alamat,
        'nama_kontraktor', t.nama_kontraktor
    ) END AS toko
`;

const opnameFinalColumns = `
    id,
    id_toko,
    tipe_opname,
    aksi,
    status_opname_final,
    link_pdf_opname,
    email_pembuat,
    pemberi_persetujuan_direktur,
    waktu_persetujuan_direktur,
    pemberi_persetujuan_koordinator,
    waktu_persetujuan_koordinator,
    pemberi_persetujuan_manager,
    waktu_persetujuan_manager,
    alasan_penolakan,
    grand_total_opname,
    grand_total_rab,
    hari_denda,
    nilai_denda,
    tanggal_akhir_spk_denda,
    tanggal_serah_terima_denda,
    created_at
`;

export const opnameRepository = {
    async create(input: CreateOpnameData): Promise<OpnameRow> {
        const result = await pool.query<OpnameRow>(
            `
            INSERT INTO opname_item (
                id_toko,
                id_opname_final,
                id_rab_item,
                id_instruksi_lapangan_item,
                status,
                volume_akhir,
                selisih_volume,
                total_selisih,
                total_harga_opname,
                desain,
                kualitas,
                spesifikasi,
                foto,
                catatan
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING ${returningColumns}
            `,
            [
                input.id_toko,
                input.id_opname_final,
                input.id_rab_item ?? null,
                input.id_instruksi_lapangan_item ?? null,
                input.status ?? "pending",
                input.volume_akhir,
                input.selisih_volume,
                input.total_selisih,
                input.total_harga_opname,
                input.desain ?? null,
                input.kualitas ?? null,
                input.spesifikasi ?? null,
                sanitizeFotoValue(input.foto),
                input.catatan ?? null
            ]
        );

        return result.rows[0];
    },

    async createBulkWithFinal(payload: {
        id_toko: number;
        email_pembuat: string;
        tipe_opname?: string;
        grand_total_opname: string;
        grand_total_rab: string;
        items: CreateBulkOpnameItemData[];
    }, existingClient?: PoolClient): Promise<{ opnameFinal: OpnameFinalHeaderRow; items: OpnameRow[] }> {
        return withTransaction(async (client) => {
            const tipeOpname = payload.tipe_opname || "OPNAME";
            const existingFinalResult = await client.query<OpnameFinalHeaderRow>(
                `
                SELECT ${opnameFinalColumns}
                FROM opname_final
                WHERE id_toko = $1 AND tipe_opname = ANY($2::text[])
                  AND EXISTS (
                      SELECT 1
                      FROM opname_item oi
                      WHERE oi.id_opname_final = opname_final.id
                  )
                ORDER BY id DESC
                LIMIT 1
                FOR UPDATE
                `,
                [payload.id_toko, getOpnameFinalLookupTypes(tipeOpname)]
            );

            let opnameFinalId: number;
            let shouldResetItemsToPending = false;
            if ((existingFinalResult.rowCount ?? 0) > 0) {
                const existingFinal = existingFinalResult.rows[0];
                const existingStatus = existingFinal.status_opname_final || "";
                const isRejected = isRejectedOpnameFinalStatus(existingStatus);
                const isLockedOrInApproval = !isRejected
                    && (
                        existingFinal.aksi === "terkunci"
                        || (isFinalApprovalStatus(existingStatus) && existingStatus !== CONTRACTOR_PROCESS_STATUS)
                    );

                if (isLockedOrInApproval) {
                    throw new AppError(
                        "Opname sudah dikunci atau sedang dalam proses approval. Data tidak bisa disubmit ulang.",
                        409
                    );
                }

                opnameFinalId = existingFinal.id;
                shouldResetItemsToPending = isRejected;
                await client.query(
                    `
                    UPDATE opname_final
                    SET email_pembuat = $1,
                        aksi = $2,
                        grand_total_opname = $3,
                        grand_total_rab = $4,
                        status_opname_final = $5,
                        tipe_opname = $6,
                        alasan_penolakan = NULL,
                        pemberi_persetujuan_direktur = NULL,
                        waktu_persetujuan_direktur = NULL,
                        pemberi_persetujuan_koordinator = NULL,
                        waktu_persetujuan_koordinator = NULL,
                        pemberi_persetujuan_manager = NULL,
                        waktu_persetujuan_manager = NULL
                    WHERE id = $7
                    `,
                    [
                        payload.email_pembuat,
                        "active",
                        payload.grand_total_opname,
                        payload.grand_total_rab,
                        CONTRACTOR_PROCESS_STATUS,
                        tipeOpname,
                        opnameFinalId
                    ]
                );
            } else {
                const createdFinalResult = await client.query<OpnameFinalHeaderRow>(
                    `
                    INSERT INTO opname_final (
                        id_toko,
                        tipe_opname,
                        email_pembuat,
                        aksi,
                        grand_total_opname,
                        grand_total_rab,
                        status_opname_final
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING ${opnameFinalColumns}
                    `,
                    [
                        payload.id_toko,
                        tipeOpname,
                        payload.email_pembuat,
                        "active",
                        payload.grand_total_opname,
                        payload.grand_total_rab,
                        CONTRACTOR_PROCESS_STATUS
                    ]
                );

                opnameFinalId = createdFinalResult.rows[0].id;
            }

            const items: OpnameRow[] = [];
            
            // SECURITY FIX: Validate that all submitted rab items actually belong to the payload's id_toko
            const rabItemIds = payload.items.map(i => i.id_rab_item).filter(id => id);
            if (rabItemIds.length > 0) {
                const rabItemCheck = await client.query(
                    `
                    SELECT ri.id, r.id_toko
                    FROM rab_item ri
                    JOIN rab r ON r.id = ri.id_rab
                    WHERE ri.id = ANY($1::int[])
                    `,
                    [rabItemIds]
                );
                for (const row of rabItemCheck.rows) {
                    if (Number(row.id_toko) !== Number(payload.id_toko)) {
                        throw new Error(`Validasi gagal: Item pekerjaan (RAB ID: ${row.id}) tidak sesuai dengan proyek toko yang dipilih (Toko ID: ${payload.id_toko}). Kemungkinan ada ketidaksesuaian data pada sisi aplikasi.`);
                    }
                }
            }

            for (const item of payload.items) {
                const itemTokoId = item.id_toko ?? payload.id_toko;
                const itemStatus = shouldResetItemsToPending ? "pending" : (item.status ?? "pending");

                if (typeof item.id !== "undefined") {
                    const updateByIdResult = await client.query<OpnameRow>(
                        `
                        UPDATE opname_item
                        SET id_toko = $1,
                            id_opname_final = $2,
                            id_rab_item = $3,
                            id_instruksi_lapangan_item = $4,
                            status = $5,
                            volume_akhir = $6,
                            selisih_volume = $7,
                            total_selisih = $8,
                            total_harga_opname = $9,
                            desain = $10,
                            kualitas = $11,
                            spesifikasi = $12,
                            foto = COALESCE($13, foto),
                            catatan = $14
                        WHERE id = $15
                        RETURNING ${returningColumns}
                        `,
                        [
                            itemTokoId,
                            opnameFinalId,
                            item.id_rab_item ?? null,
                            item.id_instruksi_lapangan_item ?? null,
                            itemStatus,
                            item.volume_akhir,
                            item.selisih_volume,
                            item.total_selisih,
                            item.total_harga_opname,
                            item.desain ?? null,
                            item.kualitas ?? null,
                            item.spesifikasi ?? null,
                            sanitizeFotoValue(item.foto),
                            item.catatan ?? null,
                            item.id
                        ]
                    );

                    if ((updateByIdResult.rowCount ?? 0) > 0) {
                        items.push(updateByIdResult.rows[0]);
                        continue;
                    }
                }

                const updateByKeysResult = await client.query<OpnameRow>(
                    `
                    UPDATE opname_item
                    SET id_opname_final = $1,
                        status = $2,
                        volume_akhir = $3,
                        selisih_volume = $4,
                        total_selisih = $5,
                        total_harga_opname = $6,
                        desain = $7,
                        kualitas = $8,
                        spesifikasi = $9,
                        foto = COALESCE($10, foto),
                        catatan = $11
                    WHERE id = (
                        SELECT id
                        FROM opname_item
                        WHERE id_toko = $12
                          AND (
                            ($13::int IS NOT NULL AND id_rab_item = $13::int AND id_instruksi_lapangan_item IS NULL)
                            OR
                            ($14::int IS NOT NULL AND id_instruksi_lapangan_item = $14::int AND id_rab_item IS NULL)
                          )
                        ORDER BY id DESC
                        LIMIT 1
                    )
                    RETURNING ${returningColumns}
                    `,
                    [
                        opnameFinalId,
                        itemStatus,
                        item.volume_akhir,
                        item.selisih_volume,
                        item.total_selisih,
                        item.total_harga_opname,
                        item.desain ?? null,
                        item.kualitas ?? null,
                        item.spesifikasi ?? null,
                        sanitizeFotoValue(item.foto),
                        item.catatan ?? null,
                        itemTokoId,
                        item.id_rab_item ?? null,
                        item.id_instruksi_lapangan_item ?? null
                    ]
                );

                if ((updateByKeysResult.rowCount ?? 0) > 0) {
                    items.push(updateByKeysResult.rows[0]);
                    continue;
                }

                const insertResult = await client.query<OpnameRow>(
                    `
                    INSERT INTO opname_item (
                        id_toko,
                        id_opname_final,
                        id_rab_item,
                        id_instruksi_lapangan_item,
                        status,
                        volume_akhir,
                        selisih_volume,
                        total_selisih,
                        total_harga_opname,
                        desain,
                        kualitas,
                        spesifikasi,
                        foto,
                        catatan
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING ${returningColumns}
                    `,
                    [
                        itemTokoId,
                        opnameFinalId,
                        item.id_rab_item ?? null,
                        item.id_instruksi_lapangan_item ?? null,
                        itemStatus,
                        item.volume_akhir,
                        item.selisih_volume,
                        item.total_selisih,
                        item.total_harga_opname,
                        item.desain ?? null,
                        item.kualitas ?? null,
                        item.spesifikasi ?? null,
                        sanitizeFotoValue(item.foto),
                        item.catatan ?? null
                    ]
                );

                items.push(insertResult.rows[0]);
            }

            const refreshedFinal = await client.query<OpnameFinalHeaderRow>(
                `
                SELECT ${opnameFinalColumns}
                FROM opname_final
                WHERE id = $1
                `,
                [opnameFinalId]
            );

            return {
                opnameFinal: refreshedFinal.rows[0],
                items
            };
        }, existingClient);
    },

    async findById(id: string): Promise<OpnameRow | null> {
        const result = await pool.query<OpnameRow>(
            `
            SELECT ${returningColumns}
            FROM opname_item
            WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async findAll(query: ListOpnameQueryInput): Promise<OpnameRow[]> {
        const conditions: string[] = [];
        const values: Array<number | string> = [];

        if (typeof query.id_toko !== "undefined") {
            values.push(query.id_toko);
            conditions.push(`oi.id_toko = $${values.length}`);
        }

        if (typeof query.id_opname_final !== "undefined") {
            values.push(query.id_opname_final);
            conditions.push(`oi.id_opname_final = $${values.length}`);
        }

        if (typeof query.id_rab_item !== "undefined") {
            values.push(query.id_rab_item);
            conditions.push(`oi.id_rab_item = $${values.length}`);
        }

        if (typeof query.id_instruksi_lapangan_item !== "undefined") {
            values.push(query.id_instruksi_lapangan_item);
            conditions.push(`oi.id_instruksi_lapangan_item = $${values.length}`);
        }

        if (typeof query.status !== "undefined") {
            values.push(query.status);
            conditions.push(`oi.status = $${values.length}`);
        }

        if (typeof query.tipe_opname !== "undefined") {
            values.push(query.tipe_opname);
            conditions.push(`ofn.tipe_opname = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query<OpnameRow>(
            `
            SELECT ${returningColumnsFromOpnameItem}
            FROM opname_item oi
            JOIN opname_final ofn ON ofn.id = oi.id_opname_final
            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
            LEFT JOIN toko t ON t.id = oi.id_toko
            ${whereClause}
            ORDER BY oi.id DESC
            `,
            values
        );

        return result.rows;
    },

    async findTokoById(id: number): Promise<TokoSummaryRow | null> {
        const result = await pool.query<TokoSummaryRow>(
            `
            SELECT
                id,
                nomor_ulok,
                lingkup_pekerjaan,
                nama_toko,
                kode_toko,
                proyek,
                cabang,
                alamat,
                nama_kontraktor
            FROM toko
            WHERE id = $1
            `,
            [id]
        );

        return result.rows[0] ?? null;
    },

    async updateById(id: string, input: UpdateOpnameInput): Promise<OpnameRow | null> {
        const setClauses: string[] = [];
        const values: Array<number | string | null> = [];

        if (typeof input.id_toko !== "undefined") {
            values.push(input.id_toko);
            setClauses.push(`id_toko = $${values.length}`);
        }

        if (typeof input.id_opname_final !== "undefined") {
            values.push(input.id_opname_final);
            setClauses.push(`id_opname_final = $${values.length}`);
        }

        if (typeof input.id_rab_item !== "undefined") {
            values.push(input.id_rab_item);
            setClauses.push(`id_rab_item = $${values.length}`);
            setClauses.push("id_instruksi_lapangan_item = NULL");
        }

        if (typeof input.id_instruksi_lapangan_item !== "undefined") {
            values.push(input.id_instruksi_lapangan_item);
            setClauses.push(`id_instruksi_lapangan_item = $${values.length}`);
            setClauses.push("id_rab_item = NULL");
        }

        if (typeof input.status !== "undefined") {
            values.push(input.status);
            setClauses.push(`status = $${values.length}`);
        }

        if (typeof input.volume_akhir !== "undefined") {
            values.push(input.volume_akhir);
            setClauses.push(`volume_akhir = $${values.length}`);
        }

        if (typeof input.selisih_volume !== "undefined") {
            values.push(input.selisih_volume);
            setClauses.push(`selisih_volume = $${values.length}`);
        }

        if (typeof input.total_selisih !== "undefined") {
            values.push(input.total_selisih);
            setClauses.push(`total_selisih = $${values.length}`);
        }

        if (typeof input.total_harga_opname !== "undefined") {
            values.push(input.total_harga_opname);
            setClauses.push(`total_harga_opname = $${values.length}`);
        }

        if (typeof input.desain !== "undefined") {
            values.push(input.desain);
            setClauses.push(`desain = $${values.length}`);
        }

        if (typeof input.kualitas !== "undefined") {
            values.push(input.kualitas);
            setClauses.push(`kualitas = $${values.length}`);
        }

        if (typeof input.spesifikasi !== "undefined") {
            values.push(input.spesifikasi);
            setClauses.push(`spesifikasi = $${values.length}`);
        }

        if (typeof input.foto !== "undefined") {
            const sanitized = sanitizeFotoValue(input.foto);
            if (sanitized !== null) {
                values.push(sanitized);
                setClauses.push(`foto = $${values.length}`);
            }
        }

        if (typeof input.catatan !== "undefined") {
            values.push(input.catatan);
            setClauses.push(`catatan = $${values.length}`);
        }

        values.push(id);

        const result = await pool.query<OpnameRow>(
            `
            UPDATE opname_item
            SET ${setClauses.join(", ")}
            WHERE id = $${values.length}
            RETURNING ${returningColumns}
            `,
            values
        );

        return result.rows[0] ?? null;
    },

    async deleteById(id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM opname_item WHERE id = $1`,
            [id]
        );

        return (result.rowCount ?? 0) > 0;
    },

    async syncApprovedInstruksiLapangan(idToko: number, idInstruksiLapangan: number): Promise<void> {
        // 1. Get the opname configuration for this toko if it exists
        const opfRes = await pool.query(`
            SELECT id_opname_final, workflow_version, id_pengawasan_gantt_target, tanggal_slot_opname
            FROM opname_item 
            WHERE id_toko = $1 
            LIMIT 1
        `, [idToko]);

        const opfRow = opfRes.rows[0] ?? null;
        if (!opfRow) {
            // Opname hasn't been generated yet (Pengawasan not finished).
            // IL will be picked up naturally when opname is generated later.
            return;
        }

        // 2. Find IL items that are missing in opname_item
        const missingIlItemsRes = await pool.query(`
            SELECT ili.id, ili.volume, ili.total_harga
            FROM instruksi_lapangan_item ili
            WHERE ili.id_instruksi_lapangan = $1
            AND ili.id NOT IN (
                SELECT id_instruksi_lapangan_item FROM opname_item 
                WHERE id_toko = $2 AND id_instruksi_lapangan_item IS NOT NULL
            )
        `, [idInstruksiLapangan, idToko]);

        if (missingIlItemsRes.rowCount === 0) {
            return;
        }

        // 3. Insert missing IL items to opname_item
        for (const item of missingIlItemsRes.rows) {
            const workflowVersion = opfRow.workflow_version === 'legacy' ? 'legacy' : 1;
            const targetGantt = opfRow.workflow_version === 'legacy' ? null : opfRow.id_pengawasan_gantt_target;
            const targetDate = opfRow.workflow_version === 'legacy' ? null : opfRow.tanggal_slot_opname;

            await pool.query(`
                INSERT INTO opname_item (
                    id_toko,
                    id_opname_final,
                    id_instruksi_lapangan_item,
                    status,
                    volume_akhir,
                    selisih_volume,
                    total_selisih,
                    total_harga_opname,
                    workflow_version,
                    id_pengawasan_gantt_target,
                    tanggal_slot_opname,
                    desain,
                    kualitas,
                    spesifikasi
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                idToko,
                opfRow.id_opname_final,
                item.id,
                'pending',
                item.volume,
                0,
                0,
                Math.round(parseFloat(item.total_harga)),
                workflowVersion,
                targetGantt,
                targetDate,
                'Sesuai',
                'Sesuai',
                'Sesuai'
            ]);
        }
    },

    async bulkApproveByTokoId(
        idToko: number,
        existingClient?: PoolClient
    ): Promise<{ updatedCount: number; idOpnameFinal?: number }> {
        const db = existingClient ?? pool;
        const result = await db.query<{ id: number; id_opname_final: number }>(
            `
            UPDATE opname_item
            SET status = 'disetujui'
            WHERE id_toko = $1 AND status = 'pending'
            RETURNING id, id_opname_final
            `,
            [idToko]
        );

        const updatedCount = result.rowCount ?? 0;
        const idOpnameFinal = result.rows[0]?.id_opname_final;

        return { updatedCount, idOpnameFinal };
    }
};
