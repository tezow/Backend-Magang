import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import type {
    InstruksiLapanganMigrationAction,
    InstruksiLapanganMigrationCommitInput
} from "./instruksi-lapangan-migration.schema";

type CellRow = Record<string, unknown>;
type Item = {
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume: number;
    harga_material: number;
    harga_upah: number;
    total_material: number;
    total_upah: number;
    total_harga: number;
};
type Candidate = {
    source_candidate_id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    email_pembuat: string;
    status: string;
    tanggal_mulai: string | null;
    tanggal_selesai: string | null;
    created_at: string | null;
    items: Item[];
    source_item_count: number;
    metadata_item_count: number;
    warnings: string[];
    toko_id?: number | null;
    nama_toko?: string | null;
    cabang?: string | null;
    existing_id?: number | null;
    issues?: string[];
};

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");
const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, " ");
const numberValue = (value: unknown) => {
    const raw = text(value).replace(/\s/g, "");
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(raw)
            ? raw.replace(/\./g, "")
            : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};
const scopeValue = (value: unknown) => key(value) === "SIPIL" ? "Sipil" : key(value);
const parseDate = (value: unknown): string | null => {
    const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
};
const itemKey = (row: CellRow) => [
    key(row.kategori_pekerjaan),
    key(row.jenis_pekerjaan),
    key(row.satuan),
    numberValue(row.vol_rab),
    numberValue(row.harga_material),
    numberValue(row.harga_upah)
].join("|");

const parseWorkbook = (buffer: Buffer): Candidate[] => {
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
    
    const availableSheets = Object.keys(workbook.Sheets);
    
    if (!workbook.Sheets.data_rab || !workbook.Sheets.opname_final) {
        // Cek apakah user upload rab_kedua by mistake
        const hasRabKeduaSheets = availableSheets.includes("Form2") || availableSheets.includes("Form3");
        if (hasRabKeduaSheets) {
            throw new AppError(
                "File yang diupload adalah rab_kedua.xlsx. Untuk migrasi dari rab_kedua, gunakan halaman 'Migrasi rab_kedua' (bukan OPNAME_v1).",
                400
            );
        }
        
        throw new AppError(
            `Sheet data_rab dan opname_final wajib tersedia di OPNAME_v1.xlsx. Sheet yang ditemukan: ${availableSheets.join(", ") || "(kosong)"}`,
            400
        );
    }
    const rabRows = xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets.data_rab, { defval: null, raw: false });
    const opnameRows = xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets.opname_final, { defval: null, raw: false });
    const metadata = new Map<string, CellRow[]>();
    for (const row of opnameRows) {
        if (key(row.IL) !== "YA") continue;
        const groupKey = `${key(row.no_ulok)}|${key(row.lingkup_pekerjaan)}`;
        metadata.set(groupKey, [...(metadata.get(groupKey) ?? []), row]);
    }
    const groups = new Map<string, CellRow[]>();
    for (const row of rabRows) {
        if (key(row.IL) !== "YA") continue;
        const groupKey = `${key(row.no_ulok)}|${key(row.lingkup_pekerjaan)}`;
        if (groupKey.startsWith("|") || groupKey.endsWith("|")) continue;
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
    }

    let id = 700000;
    return [...groups.entries()].map(([groupKey, sourceRows]) => {
        id += 1;
        const metadataRows = metadata.get(groupKey) ?? [];
        const uniqueItems = new Map<string, CellRow>();
        sourceRows.forEach((row) => uniqueItems.set(itemKey(row), row));
        const dates = metadataRows
            .map((row) => parseDate(row.tanggal_submit))
            .filter((value): value is string => Boolean(value))
            .sort();
        const statuses = new Set(metadataRows.map((row) => key(row.approval_status)));
        const warnings: string[] = [];
        if (metadataRows.length === 0) warnings.push("Metadata status/tanggal tidak ditemukan; status dibuat Menunggu Persetujuan Koordinator");
        if (statuses.has("PENDING")) warnings.push("Terdapat item Pending di opname_final");
        if (uniqueItems.size < sourceRows.length) warnings.push(`${sourceRows.length - uniqueItems.size} item identik dideduplikasi`);
        const [nomorUlok, lingkup] = groupKey.split("|");
        const items = [...uniqueItems.values()].map((row) => {
            const volume = numberValue(row.vol_rab);
            const hargaMaterial = numberValue(row.harga_material);
            const hargaUpah = numberValue(row.harga_upah);
            return {
                kategori_pekerjaan: text(row.kategori_pekerjaan) || "LAINNYA",
                jenis_pekerjaan: text(row.jenis_pekerjaan),
                satuan: text(row.satuan) || "-",
                volume,
                harga_material: hargaMaterial,
                harga_upah: hargaUpah,
                total_material: volume * hargaMaterial,
                total_upah: volume * hargaUpah,
                total_harga: volume * (hargaMaterial + hargaUpah)
            };
        });
        return {
            source_candidate_id: id,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: scopeValue(lingkup),
            email_pembuat: text(metadataRows.find((row) => text(row.pic_username))?.pic_username)
                || text(sourceRows.find((row) => text(row.pic_username))?.pic_username)
                || "migration@sparta.local",
            status: metadataRows.length > 0 && statuses.size === 1 && statuses.has("APPROVED")
                ? "Disetujui"
                : "Menunggu Persetujuan Koordinator",
            tanggal_mulai: dates[0] ?? null,
            tanggal_selesai: dates.at(-1) ?? dates[0] ?? null,
            created_at: dates[0] ? `${dates[0]} 00:00:00` : null,
            items,
            source_item_count: sourceRows.length,
            metadata_item_count: metadataRows.length,
            warnings
        };
    });
};

const resolveCandidates = async (candidates: Candidate[]): Promise<Candidate[]> => {
    if (candidates.length === 0) return [];
    const result = await pool.query<{
        id: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        nama_toko: string;
        cabang: string;
        existing_id: number | null;
    }>(`
        SELECT t.id, t.nomor_ulok, t.lingkup_pekerjaan, t.nama_toko, t.cabang, existing.id AS existing_id
        FROM toko t
        LEFT JOIN LATERAL (
            SELECT id FROM instruksi_lapangan
            WHERE id_toko = t.id
            ORDER BY id DESC LIMIT 1
        ) existing ON TRUE
        WHERE UPPER(t.nomor_ulok) = ANY($1::text[])
    `, [[...new Set(candidates.map((candidate) => candidate.nomor_ulok))]]);
    const targets = new Map(result.rows.map((row) => [
        `${key(row.nomor_ulok)}|${key(row.lingkup_pekerjaan)}`,
        row
    ]));
    return candidates.map((candidate) => {
        const target = targets.get(`${candidate.nomor_ulok}|${key(candidate.lingkup_pekerjaan)}`);
        const issues: string[] = [];
        if (!target) issues.push("Toko ULOK + lingkup tidak ditemukan di database");
        if (candidate.items.length === 0) issues.push("Tidak memiliki item IL");
        if (candidate.items.some((item) => !item.jenis_pekerjaan)) issues.push("Terdapat item tanpa jenis pekerjaan");
        return {
            ...candidate,
            toko_id: target?.id ?? null,
            nama_toko: target?.nama_toko ?? null,
            cabang: target?.cabang ?? null,
            existing_id: target?.existing_id ?? null,
            issues
        };
    });
};

const insertItems = async (client: PoolClient, idInstruksi: number, items: Item[]) => {
    const values: unknown[] = [];
    const placeholders = items.map((item, index) => {
        const offset = index * 10;
        values.push(idInstruksi, item.kategori_pekerjaan, item.jenis_pekerjaan, item.satuan, item.volume,
            item.harga_material, item.harga_upah, item.total_material, item.total_upah, item.total_harga);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10})`;
    });
    await client.query(`
        INSERT INTO instruksi_lapangan_item (
            id_instruksi_lapangan, kategori_pekerjaan, jenis_pekerjaan, satuan, volume,
            harga_material, harga_upah, total_material, total_upah, total_harga
        ) VALUES ${placeholders.join(",")}
    `, values);
};

const writeCandidate = async (
    client: PoolClient,
    candidate: Candidate,
    action: InstruksiLapanganMigrationAction
) => {
    if (action === "skip") return { status: "skipped", source_candidate_id: candidate.source_candidate_id, target_id: null };
    if ((candidate.issues?.length ?? 0) > 0 || !candidate.toko_id) {
        throw new AppError(`IL ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak valid: ${candidate.issues?.join(", ")}`, 422);
    }
    if (action === "insert" && candidate.existing_id) throw new AppError(`IL ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} sudah ada`, 409);
    if (action === "replace" && !candidate.existing_id) throw new AppError(`IL existing ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak ditemukan`, 404);
    const grandTotal = candidate.items.reduce((sum, item) => sum + item.total_harga, 0);
    const grandTotalNonSbo = candidate.items
        .filter((item) => key(item.kategori_pekerjaan) !== "PEKERJAAN SBO")
        .reduce((sum, item) => sum + item.total_harga, 0);
    const noPpn = [candidate.cabang, candidate.nama_toko]
        .some((value) => /\b(BATAM|BINTAN)\b/.test(key(value)));
    const grandTotalFinal = (noPpn ? grandTotalNonSbo : grandTotalNonSbo * 1.11).toFixed(2);
    let targetId = candidate.existing_id ?? null;
    if (action === "replace" && targetId) {
        await client.query(`DELETE FROM instruksi_lapangan_item WHERE id_instruksi_lapangan = $1`, [targetId]);
        await client.query(`
            UPDATE instruksi_lapangan
            SET status=$1,email_pembuat=$2,tanggal_mulai=$3,tanggal_selesai=$4,
                grand_total=$5,grand_total_non_sbo=$6,grand_total_final=$7,
                created_at=COALESCE($8::timestamp,created_at)
            WHERE id=$9
        `, [candidate.status, candidate.email_pembuat, candidate.tanggal_mulai, candidate.tanggal_selesai,
            grandTotal.toString(), grandTotalNonSbo.toString(), grandTotalFinal, candidate.created_at, targetId]);
    } else {
        const inserted = await client.query<{ id: number }>(`
            INSERT INTO instruksi_lapangan (
                id_toko,status,email_pembuat,tanggal_mulai,tanggal_selesai,
                grand_total,grand_total_non_sbo,grand_total_final,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamp,timezone('Asia/Jakarta',now())))
            RETURNING id
        `, [candidate.toko_id, candidate.status, candidate.email_pembuat, candidate.tanggal_mulai,
            candidate.tanggal_selesai, grandTotal.toString(), grandTotalNonSbo.toString(), grandTotalFinal, candidate.created_at]);
        targetId = inserted.rows[0].id;
    }
    await insertItems(client, targetId, candidate.items);
    return { status: action === "replace" ? "replaced" : "inserted", source_candidate_id: candidate.source_candidate_id, target_id: targetId };
};

export const instruksiLapanganMigrationService = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) throw new AppError("Hanya Super Human yang dapat melakukan migrasi Instruksi Lapangan", 403);
        const candidates = await resolveCandidates(parseWorkbook(buffer));
        const details = candidates.map((candidate) => ({
            source_candidate_id: candidate.source_candidate_id,
            nomor_ulok: candidate.nomor_ulok,
            lingkup_pekerjaan: candidate.lingkup_pekerjaan,
            nama_toko: candidate.nama_toko,
            cabang: candidate.cabang,
            email_pembuat: candidate.email_pembuat,
            status: candidate.status,
            tanggal_mulai: candidate.tanggal_mulai,
            tanggal_selesai: candidate.tanggal_selesai,
            item_count: candidate.items.length,
            source_item_count: candidate.source_item_count,
            metadata_item_count: candidate.metadata_item_count,
            grand_total: candidate.items.reduce((sum, item) => sum + item.total_harga, 0),
            existing_id: candidate.existing_id,
            db_state: (candidate.issues?.length ?? 0) > 0 ? "invalid" : candidate.existing_id ? "conflict" : "ready",
            issues: candidate.issues ?? [],
            warnings: candidate.warnings
        }));
        return {
            total_candidates: details.length,
            total_items: details.reduce((sum, row) => sum + row.item_count, 0),
            ready_count: details.filter((row) => row.db_state === "ready").length,
            conflict_count: details.filter((row) => row.db_state === "conflict").length,
            invalid_count: details.filter((row) => row.db_state === "invalid").length,
            details
        };
    },

    async commit(buffer: Buffer, input: InstruksiLapanganMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) throw new AppError("Hanya Super Human yang dapat melakukan migrasi Instruksi Lapangan", 403);
        const candidates = await resolveCandidates(parseWorkbook(buffer));
        const byId = new Map(candidates.map((candidate) => [candidate.source_candidate_id, candidate]));
        const results = await withTransaction(async (client) => {
            const rows = [];
            for (const selection of input.selections) {
                const candidate = byId.get(selection.source_candidate_id);
                if (!candidate) throw new AppError(`Kandidat ${selection.source_candidate_id} tidak ditemukan`, 404);
                rows.push(await writeCandidate(client, candidate, selection.action));
            }
            await activityLogRepository.insert({
                entity_type: "INSTRUKSI_LAPANGAN",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi Instruksi Lapangan dari OPNAME_v1",
                metadata: { total_selected: input.selections.length }
            }, client);
            return rows;
        });
        return {
            total_selected: input.selections.length,
            inserted: results.filter((row) => row.status === "inserted").length,
            replaced: results.filter((row) => row.status === "replaced").length,
            skipped: results.filter((row) => row.status === "skipped").length,
            details: results
        };
    }
};
