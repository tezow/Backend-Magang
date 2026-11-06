import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import { calculateDendaByTokoId } from "../denda/denda-keterlambatan";
import { opnameFinalService } from "./opname-final.service";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import type {
    OpnameFinalMigrationAction,
    OpnameFinalMigrationCommitInput
} from "./opname-final-migration.schema";

type CellRow = Record<string, unknown>;
type SourceItem = {
    source_row: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume_rab: number;
    volume_akhir: number;
    selisih_volume: number;
    harga_material: number;
    harga_upah: number;
    total_harga_akhir: number;
    approval_status: "APPROVED" | "PENDING" | "REJECTED";
    desain: string | null;
    kualitas: string | null;
    spesifikasi: string | null;
    foto: string | null;
    catatan: string | null;
    is_il: boolean;
    created_at: string | null;
    source_id: number | null;
    source_type: "RAB" | "IL" | null;
    matched_unit_price: number;
    match_warning: string | null;
    match_issue: string | null;
};
type Candidate = {
    source_candidate_id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    email_pembuat: string;
    created_at: string | null;
    migration_type: "PARTIAL" | "FINAL";
    approved_count: number;
    pending_count: number;
    rejected_count: number;
    items: SourceItem[];
    toko_id: number | null;
    nama_toko: string | null;
    cabang: string | null;
    existing_id: number | null;
    existing_type: string | null;
    existing_status: string | null;
    expected_item_count: number;
    grand_total_rab: number;
    grand_total_opname: number;
    issues: string[];
    warnings: string[];
};
type DbSourceItem = {
    id: number;
    id_toko: number;
    source_type: "RAB" | "IL";
    kategori_pekerjaan: string | null;
    jenis_pekerjaan: string | null;
    satuan: string | null;
    volume: number | string | null;
    harga_material: number | string | null;
    harga_upah: number | string | null;
    total_harga: number | string | null;
};

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");
const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, " ");
const workKey = (value: unknown) => key(value).replace(/[^A-Z0-9]+/g, "");
const scopeValue = (value: unknown) => key(value) === "SIPIL" ? "Sipil" : key(value);

// Volume limits untuk deteksi data corruption
const VOLUME_LIMITS: Record<string, number> = {
    M2: 1000,    // Max 1000 M2 area untuk 1 toko
    M3: 500,     // Max 500 M3 volume
    M1: 500,     // Max 500 M length
    KG: 10000,   // Max 10 ton (10,000 kg)
    TTK: 200,    // Max 200 points (electrical/plumbing)
    BH: 500,     // Max 500 units
    LS: 20,      // Max 20 lump sum items
    BTG: 1000,   // Max 1000 pieces
    UNIT: 500,   // Max 500 units
    SET: 100,    // Max 100 sets
    MODULE: 50,  // Max 50 modules
    MODUL: 50,   // Max 50 modules
};

const validateVolume = (volume: number, satuan: string, jenisPekerjaan: string): string | null => {
    const normalizedSatuan = satuan.toUpperCase().trim();  // Case-insensitive
    const limit = VOLUME_LIMITS[normalizedSatuan] || 10000;  // Default 10k if satuan not in list
    
    // Check for extreme values (likely data corruption)
    if (volume > limit) {
        return `Volume ${volume.toLocaleString()} ${satuan} melebihi batas wajar (max ${limit.toLocaleString()}). Kemungkinan data corrupt: "${jenisPekerjaan}"`;
    }
    
    // Check for impossible negative volumes (except for cut/fill work)
    if (volume < -100 && normalizedSatuan !== "M3") {
        return `Volume negatif ekstrem (${volume}) tidak wajar untuk ${satuan}`;
    }
    
    return null;  // Valid
};

const numberValue = (value: unknown): number => {
    const raw = text(value).replace(/\s/g, "");
    if (!raw) return 0;
    
    // Deteksi format:
    // 1. Jika ada koma → format Indonesia (1.234,56 → 1234.56)
    // 2. Jika ada multiple dots → thousand separator (1.234.567 → 1234567)
    // 3. Jika hanya 1 dot → ALWAYS treat as decimal (46.236 → 46.236)
    //    Kenapa? Karena Excel biasanya export angka dengan dot sebagai desimal
    //    Jika user input "46 ribu", Excel akan store sebagai 46000, bukan "46.000"
    
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")  // Format Indonesia
        : (raw.match(/\./g) || []).length > 1       // Multiple dots → thousand separator
            ? raw.replace(/\./g, "")
        : raw;                                       // Single dot or no dot → keep as-is (decimal)
    
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;

    // FIX EXCEL AUTO-DATE BUG:
    // Jika user mengetik "03.07", Excel mengubahnya menjadi "3 Juli" diam-diam.
    // Saat dibaca oleh xlsx, angkanya menjadi serial date Excel.
    // Range serial yang dicek:
    //   - 2010-01-01 = 40179
    //   - 2042-12-31 = 51909
    // Volume konstruksi untuk SATU baris item pekerjaan Alfamart mustahil mencapai 40.000+ unit.
    // Sehingga: jika nilai ada di range ini, PASTI itu efek auto-date Excel, bukan volume nyata.
    // Kita balikkan kembali secara otomatis menjadi format Desimal (Hari.Bulan).
    if (parsed >= 40179 && parsed <= 51909) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel epoch is 1899-12-30
        const date = new Date(excelEpoch.getTime() + Math.floor(parsed) * 86400000);
        const day = date.getUTCDate();
        const month = date.getUTCMonth() + 1; // 1-12
        const fractional = parsed - Math.floor(parsed);
        // Susun ulang menjadi "Hari.Bulan"
        return parseFloat(`${day}.${month.toString().padStart(2, '0')}`) + fractional;
    }
    
    return parsed;
};
const parseTimestamp = (value: unknown): string | null => {
    const raw = text(value);
    const localized = raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)?(\d{1,2})[.:](\d{2})[.:](\d{2})/
    );
    if (localized) {
        return `${localized[3]}-${localized[2].padStart(2, "0")}-${localized[1].padStart(2, "0")} ${localized[4].padStart(2, "0")}:${localized[5]}:${localized[6]}`;
    }
    const dateOnly = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateOnly) return `${dateOnly[3]}-${dateOnly[2].padStart(2, "0")}-${dateOnly[1].padStart(2, "0")} 00:00:00`;
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}:\d{2}))?/);
    return iso ? `${iso[1]} ${iso[2] ?? "00:00:00"}` : null;
};
const sourceItemKey = (row: CellRow) => [
    workKey(row.kategori_pekerjaan),
    workKey(row.jenis_pekerjaan),
    workKey(row.satuan),
    key(row.IL) === "YA" ? "IL" : "RAB"
].join("|");

/**
 * Download gambar dari URL (Cloudinary atau lainnya)
 * Return buffer jika berhasil, null jika gagal
 */
const downloadImageFromUrl = async (url: string): Promise<Buffer | null> => {
    if (!url || !url.startsWith("http")) return null;
    
    try {
        console.log(`[MIGRATION] Downloading image from: ${url.substring(0, 80)}...`);
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "SPARTA-Migration/1.0"
            }
        });

        if (!response.ok) {
            console.warn(`[MIGRATION] Failed to download image: ${response.status} ${response.statusText}`);
            return null;
        }

        const contentType = response.headers.get("content-type");
        if (!contentType?.startsWith("image/")) {
            console.warn(`[MIGRATION] URL is not an image: ${contentType}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log(`[MIGRATION] Downloaded ${buffer.length} bytes`);
        return buffer;
    } catch (error) {
        console.error(`[MIGRATION] Error downloading image:`, error instanceof Error ? error.message : String(error));
        return null;
    }
};

/**
 * Upload gambar ke Google Drive dan return file ID
 * Return null jika gagal
 */
const uploadImageToDrive = async (
    googleProvider: GoogleProvider,
    buffer: Buffer,
    nomorUlok: string,
    itemIndex: number,
    jenisPekerjaan: string
): Promise<string | null> => {
    try {
        // Sanitize filename
        const sanitizedJenis = jenisPekerjaan
            .replace(/[^a-zA-Z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 50);
        
        const fileName = `OPNAME_MIGRATION_${nomorUlok.replace(/[^a-zA-Z0-9]/g, "")}_${sanitizedJenis}_${itemIndex}_${Date.now()}.jpg`;

        console.log(`[MIGRATION] Uploading to Drive: ${fileName}`);

        const result = await googleProvider.uploadFile(
            env.PDF_STORAGE_FOLDER_ID,
            fileName,
            "image/jpeg",
            buffer,
            2,
            googleProvider.spartaDrive || undefined
        );

        const fileId = result.id;
        if (!fileId) {
            console.warn(`[MIGRATION] Upload returned no file ID`);
            return null;
        }

        console.log(`[MIGRATION] Uploaded successfully, file ID: ${fileId}`);
        return fileId;
    } catch (error) {
        console.error(`[MIGRATION] Error uploading to Drive:`, error instanceof Error ? error.message : String(error));
        return null;
    }
};

const parseWorkbook = (buffer: Buffer): Candidate[] => {
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
    if (!workbook.Sheets.opname_final) throw new AppError("Sheet opname_final tidak ditemukan", 400);
    const rows = xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets.opname_final, { defval: null, raw: false });
    const groups = new Map<string, Array<CellRow & { __row: number }>>();
    rows.forEach((row, index) => {
        const nomorUlok = key(row.no_ulok);
        const lingkup = key(row.lingkup_pekerjaan);
        if (!nomorUlok || !lingkup) return;
        const groupKey = `${nomorUlok}|${lingkup}`;
        groups.set(groupKey, [...(groups.get(groupKey) ?? []), { ...row, __row: index + 2 }]);
    });

    let candidateId = 900000;
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, sourceRows]) => {
        candidateId += 1;
        // Deduplicate dan tentukan RAB vs IL:
        // - Jika kolom IL sudah eksplisit "YA" → ikuti apa adanya
        // - Jika ada 2+ baris dengan item SAMA dan sama-sama bukan IL:
        //   → yang paling LAMA jadi RAB, yang paling BARU otomatis dipromosi jadi IL
        //   (logika bisnis: submit pertama = baseline RAB, submit ulang = revisi lingkup = IL)
        const baseKeyGroups = new Map<string, Array<CellRow & { __row: number }>>();
        for (const row of sourceRows) {
            const baseKey = [
                workKey(String(row.kategori_pekerjaan ?? "")),
                workKey(String(row.jenis_pekerjaan ?? "")),
                workKey(String(row.satuan ?? ""))
            ].join("|");
            baseKeyGroups.set(baseKey, [...(baseKeyGroups.get(baseKey) ?? []), row]);
        }

        const latestRows: Array<CellRow & { __row: number }> = [];
        const promotedToIL = new Set<number>(); // Set __row yang dipromosi otomatis ke IL

        for (const groupRows of baseKeyGroups.values()) {
            // Urutkan dari yang paling lama ke paling baru
            const sorted = [...groupRows].sort((a, b) => {
                const dateA = parseTimestamp(a.tanggal_submit) ?? "";
                const dateB = parseTimestamp(b.tanggal_submit) ?? "";
                if (dateA !== dateB) return dateA < dateB ? -1 : 1;
                return a.__row - b.__row;
            });

            const explicitIL = sorted.filter((r) => key(r.IL) === "YA");
            const nonIL = sorted.filter((r) => key(r.IL) !== "YA");

            if (explicitIL.length > 0) {
                // Ada IL eksplisit: ambil RAB terbaru + IL terbaru
                if (nonIL.length > 0) latestRows.push(nonIL[nonIL.length - 1]);
                latestRows.push(explicitIL[explicitIL.length - 1]);
            } else if (nonIL.length >= 2) {
                // Tidak ada IL eksplisit tapi ada 2+ baris sama
                const oldest = nonIL[0];
                const newest = nonIL[nonIL.length - 1];
                
                // Cek apakah volume akhir berbeda
                const volOld = numberValue(oldest.vol_rab) + numberValue(oldest.selisih);
                const volNew = numberValue(newest.vol_rab) + numberValue(newest.selisih);
                
                if (Math.abs(volOld - volNew) > 0.001) {
                    // Volume beda -> promosi otomatis
                    latestRows.push(oldest); // tertua = RAB
                    latestRows.push(newest); // terbaru = IL (dipromosi)
                    promotedToIL.add(newest.__row);
                } else {
                    // Volume sama persis -> ini double submit, ambil yang terbaru saja
                    latestRows.push(newest);
                }
            } else {
                for (const row of nonIL) latestRows.push(row);
                for (const row of explicitIL) latestRows.push(row);
            }
        }
        const approvedCount = latestRows.filter((row) => key(row.approval_status) === "APPROVED").length;
        const pendingCount = latestRows.filter((row) => key(row.approval_status) === "PENDING").length;
        const rejectedCount = latestRows.filter((row) => key(row.approval_status) === "REJECTED").length;
        const migrationType = latestRows.length > 0 && approvedCount === latestRows.length
            ? "FINAL"
            : "PARTIAL";
        const dates = latestRows.map((row) => parseTimestamp(row.tanggal_submit)).filter((value): value is string => Boolean(value)).sort();
        const [nomorUlok, lingkup] = groupKey.split("|");
        const items: SourceItem[] = latestRows.map((row) => {
            const volRab = numberValue(row.vol_rab);
            const selisihVolume = numberValue(row.selisih);
            const satuan = text(row.satuan);
            const jenisPekerjaan = text(row.jenis_pekerjaan);
            
            // SIMPLE & ROBUST: volume_akhir = vol_rab + selisih
            // Ini konsisten dengan formula Excel dan tidak perlu parsing ambiguous number format
            const volumeAkhir = volRab + selisihVolume;
            
            // Validate volume 
            const volumeIssue = validateVolume(volumeAkhir, satuan, jenisPekerjaan);
            
            return {
                source_row: row.__row,
                kategori_pekerjaan: text(row.kategori_pekerjaan),
                jenis_pekerjaan: jenisPekerjaan,
                satuan,
                volume_rab: volRab,
                volume_akhir: volumeAkhir,
                selisih_volume: selisihVolume,
                harga_material: numberValue(row.harga_material),
                harga_upah: numberValue(row.harga_upah),
                total_harga_akhir: numberValue(row.total_harga_akhir),
                approval_status: key(row.approval_status) === "APPROVED"
                    ? "APPROVED"
                    : key(row.approval_status) === "REJECTED"
                        ? "REJECTED"
                        : "PENDING",
                desain: text(row.desain) || null,
                kualitas: text(row.kualitas) || null,
                spesifikasi: text(row.spesifikasi) || null,
                foto: text(row.foto_url) || null,
                catatan: text(row.catatan) || null,
                is_il: key(row.IL) === "YA" || promotedToIL.has(row.__row),
                created_at: parseTimestamp(row.tanggal_submit),
                source_id: null,
                source_type: null,
                matched_unit_price: 0,
                match_warning: null,  // No longer needed - simple formula
                match_issue: volumeIssue,
            };
        });
        return {
            source_candidate_id: candidateId,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: scopeValue(lingkup),
            email_pembuat: text(latestRows.find((row) => text(row.pic_username))?.pic_username) || "migration@sparta.local",
            created_at: dates.at(-1) ?? null,
            migration_type: migrationType,
            approved_count: approvedCount,
            pending_count: pendingCount,
            rejected_count: rejectedCount,
            items,
            toko_id: null,
            nama_toko: null,
            cabang: null,
            existing_id: null,
            existing_type: null,
            existing_status: null,
            expected_item_count: 0,
            grand_total_rab: 0,
            grand_total_opname: 0,
            issues: latestRows.length === 0 ? ["Tidak memiliki item opname"] : [],
            warnings: []
        };
    });
};

const chooseSourceMatch = (item: SourceItem, sources: DbSourceItem[]): DbSourceItem | null => {
    const expectedType = item.is_il ? "IL" : "RAB";
    const byName = sources.filter((source) =>
        source.source_type === expectedType
        && workKey(source.jenis_pekerjaan) === workKey(item.jenis_pekerjaan)
    );
    if (byName.length === 1) return byName[0];
    const byCategoryAndUnit = byName.filter((source) =>
        workKey(source.kategori_pekerjaan) === workKey(item.kategori_pekerjaan)
        && workKey(source.satuan) === workKey(item.satuan)
    );
    if (byCategoryAndUnit.length === 1) return byCategoryAndUnit[0];
    const byPrice = byCategoryAndUnit.filter((source) =>
        Math.abs(numberValue(source.harga_material) - item.harga_material) < 0.01
        && Math.abs(numberValue(source.harga_upah) - item.harga_upah) < 0.01
    );
    if (byPrice.length === 1) return byPrice[0];
    const byVolume = byPrice.filter((source) =>
        Math.abs(numberValue(source.volume) - item.volume_rab) < 0.0001
    );
    if (byVolume.length === 1) return byVolume[0];
    if (byVolume.length > 1) return [...byVolume].sort((a, b) => b.id - a.id)[0];
    
    // Fallback: Jika volume tidak match (mungkin volume_rab di excel corrupt),
    // pilih item terbaru berdasarkan harga
    return byPrice.length > 0
        ? [...byPrice].sort((a, b) => b.id - a.id)[0]
        : null;
};

const resolveCandidates = async (buffer: Buffer): Promise<Candidate[]> => {
    const candidates = parseWorkbook(buffer);
    const uloks = [...new Set(candidates.map((candidate) => candidate.nomor_ulok))];
    const targetResult = await pool.query<{
        toko_id: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        nama_toko: string | null;
        cabang: string | null;
        existing_id: number | null;
        existing_type: string | null;
        existing_status: string | null;
    }>(`
        SELECT t.id AS toko_id, t.nomor_ulok, t.lingkup_pekerjaan, t.nama_toko, t.cabang,
               existing.id AS existing_id, existing.tipe_opname AS existing_type,
               existing.status_opname_final AS existing_status
        FROM toko t
        LEFT JOIN LATERAL (
            SELECT id, tipe_opname, status_opname_final
            FROM opname_final
            WHERE id_toko = t.id
            ORDER BY CASE WHEN tipe_opname = 'OPNAME_FINAL' THEN 0 ELSE 1 END, id DESC
            LIMIT 1
        ) existing ON TRUE
        WHERE UPPER(t.nomor_ulok) = ANY($1::text[])
    `, [uloks]);
    const targetByKey = new Map(targetResult.rows.map((row) => [
        `${key(row.nomor_ulok)}|${key(row.lingkup_pekerjaan)}`,
        row
    ]));
    const tokoIds = targetResult.rows.map((row) => row.toko_id);
    let rabSourceResult: { rows: DbSourceItem[] } = { rows: [] };
    let ilSourceResult: { rows: DbSourceItem[] } = { rows: [] };
    if (tokoIds.length > 0) {
        rabSourceResult = await pool.query<DbSourceItem>(`
                SELECT ri.id, latest.id_toko, 'RAB'::text AS source_type,
                       ri.kategori_pekerjaan, ri.jenis_pekerjaan, ri.satuan,
                       ri.volume::text AS volume,
                       ri.harga_material::text AS harga_material,
                       ri.harga_upah::text AS harga_upah,
                       ri.total_harga::text AS total_harga
                FROM unnest($1::int[]) AS requested(id_toko)
                JOIN LATERAL (
                    SELECT r.id, r.id_toko
                    FROM rab r
                    WHERE r.id_toko = requested.id_toko
                    ORDER BY r.id DESC
                    LIMIT 1
                ) latest ON TRUE
                JOIN rab_item ri ON ri.id_rab = latest.id
            `, [tokoIds]);
        ilSourceResult = await pool.query<DbSourceItem>(`
                SELECT ili.id, il.id_toko, 'IL'::text AS source_type,
                       ili.kategori_pekerjaan, ili.jenis_pekerjaan, ili.satuan,
                       ili.volume::text AS volume,
                       ili.harga_material::text AS harga_material,
                       ili.harga_upah::text AS harga_upah,
                       ili.total_harga::text AS total_harga
                FROM instruksi_lapangan il
                JOIN instruksi_lapangan_item ili ON ili.id_instruksi_lapangan = il.id
                WHERE il.id_toko = ANY($1::int[])
                  AND UPPER(COALESCE(il.status, '')) IN ('DISETUJUI', 'APPROVED')
            `, [tokoIds]);
    }
    const sourceResult = { rows: [...rabSourceResult.rows, ...ilSourceResult.rows] };
    const sourcesByToko = new Map<number, DbSourceItem[]>();
    sourceResult.rows.forEach((row) => sourcesByToko.set(row.id_toko, [...(sourcesByToko.get(row.id_toko) ?? []), row]));

    return candidates.map((candidate) => {
        const target = targetByKey.get(`${candidate.nomor_ulok}|${key(candidate.lingkup_pekerjaan)}`);
        const issues = [...candidate.issues];
        const warnings = [...candidate.warnings];
        if (!target) issues.push("Toko ULOK + lingkup tidak ditemukan di database");
        if (!candidate.created_at && candidate.items.length > 0) issues.push("Tanggal submit opname tidak valid");
        const sources = target ? sourcesByToko.get(target.toko_id) ?? [] : [];
        const resolvedItems = candidate.items.map((item) => {
            const matchesByName = sources.filter((source) =>
                source.source_type === (item.is_il ? "IL" : "RAB")
                && workKey(source.jenis_pekerjaan) === workKey(item.jenis_pekerjaan)
            );
            const match = chooseSourceMatch(item, sources);
            if (!match) {
                return {
                    ...item,
                    match_issue: matchesByName.length > 1
                        ? `Item ambigu (${matchesByName.length} kandidat DB)`
                        : `${item.is_il ? "Item IL" : "Item RAB"} tidak ditemukan`
                };
            }
            const dbUnitPrice = numberValue(match.harga_material) + numberValue(match.harga_upah);
            const sourceUnitPrice = item.harga_material + item.harga_upah;
            
            // Re-calculate volume_akhir using DB volume + Excel selisih
            const dbVolume = numberValue(match.volume);
            const fixedVolumeAkhir = dbVolume + item.selisih_volume;
            
            // Re-validate volume
            const matchIssue = validateVolume(fixedVolumeAkhir, item.satuan, item.jenis_pekerjaan);

            return {
                ...item,
                volume_rab: dbVolume,
                volume_akhir: fixedVolumeAkhir,
                source_id: match.id,
                source_type: match.source_type,
                matched_unit_price: dbUnitPrice,
                match_warning: matchesByName.length > 1
                    ? `Terdapat ${matchesByName.length} item DB bernama sama; dipilih berdasarkan kategori, satuan, harga, dan volume`
                    : Math.abs(dbUnitPrice - sourceUnitPrice) > 0.01
                        ? `Harga sumber ${sourceUnitPrice} berbeda dari DB ${dbUnitPrice}; perhitungan memakai harga DB`
                        : null,
                match_issue: matchIssue
            };
        });
        const unresolved = resolvedItems.filter((item) => item.match_issue);
        if (unresolved.length > 0) issues.push(`${unresolved.length} item tidak dapat dipetakan`);
        if (candidate.migration_type === "PARTIAL") {
            warnings.push(`Masuk sebagai Opname Parsial: ${candidate.approved_count} disetujui, ${candidate.pending_count} pending, ${candidate.rejected_count} ditolak`);
        }
        const sourceHistoryCount = candidate.approved_count + candidate.pending_count + candidate.rejected_count;
        const repeatedHistory = sourceHistoryCount - candidate.items.length;
        if (repeatedHistory > 0) warnings.push(`${repeatedHistory} riwayat item lama digantikan snapshot terbaru`);
        if (candidate.migration_type === "PARTIAL" && target?.existing_type === "OPNAME_FINAL") {
            issues.push("Database sudah berisi Opname Final; tidak boleh diturunkan menjadi Opname Parsial");
        }
        if (sources.length !== resolvedItems.length) {
            warnings.push(`Snapshot memuat ${resolvedItems.length} item; sumber DB aktif memuat ${sources.length} item`);
        }
        const grandTotalRab = sources.reduce((sum, source) => sum + numberValue(source.total_harga), 0);
        const grandTotalOpname = resolvedItems.reduce((sum, item) => {
            const match = sources.find((source) => source.id === item.source_id && source.source_type === item.source_type);
            return sum + item.volume_akhir * (numberValue(match?.harga_material) + numberValue(match?.harga_upah));
        }, 0);
        return {
            ...candidate,
            items: resolvedItems,
            toko_id: target?.toko_id ?? null,
            nama_toko: target?.nama_toko ?? null,
            cabang: target?.cabang ?? null,
            existing_id: target?.existing_id ?? null,
            existing_type: target?.existing_type ?? null,
            existing_status: target?.existing_status ?? null,
            expected_item_count: sources.length,
            grand_total_rab: Math.round(grandTotalRab),
            grand_total_opname: Math.round(grandTotalOpname),
            issues,
            warnings: [...warnings, ...resolvedItems.map((item) => item.match_warning).filter((value): value is string => Boolean(value))]
        };
    });
};

const insertItems = async (
    client: PoolClient,
    candidate: Candidate,
    opnameFinalId: number,
    googleProvider: GoogleProvider
) => {
    console.log(`[MIGRATION] Processing ${candidate.items.length} items for ${candidate.nomor_ulok}...`);
    
    const processedItems = candidate.items.filter(item => item.source_id && item.source_type);


    const values: unknown[] = [];
    const placeholders = processedItems.map((item, index) => {
        if (!item.source_id || !item.source_type) throw new AppError(`Item baris ${item.source_row} belum terpetakan`, 422);
        const totalSelisih = Math.round(item.selisih_volume * item.matched_unit_price);
        const totalHargaOpname = Math.round(item.volume_akhir * item.matched_unit_price);
        values.push(
            candidate.toko_id,
            opnameFinalId,
            item.source_type === "RAB" ? item.source_id : null,
            item.source_type === "IL" ? item.source_id : null,
            item.approval_status === "APPROVED"
                ? "disetujui"
                : item.approval_status === "REJECTED"
                    ? "ditolak"
                    : "pending",
            item.volume_akhir,
            item.selisih_volume,
            totalSelisih,
            totalHargaOpname,
            item.desain,
            item.kualitas,
            item.spesifikasi,
            item.foto,  // Now contains Drive file ID or NULL
            item.catatan,
            item.created_at ?? candidate.created_at
        );
        const offset = index * 15;
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},COALESCE($${offset + 15}::timestamp,timezone('Asia/Jakarta',now())))`;
    });
    
    await client.query(`
        INSERT INTO opname_item (
            id_toko, id_opname_final, id_rab_item, id_instruksi_lapangan_item,
            status, volume_akhir, selisih_volume, total_selisih, total_harga_opname,
            desain, kualitas, spesifikasi, foto, catatan, created_at
        ) VALUES ${placeholders.join(",")}
    `, values);
    
    const fotoCount = processedItems.filter(item => item.foto).length;
    console.log(`[MIGRATION] Inserted ${processedItems.length} items (${fotoCount} with foto) for ${candidate.nomor_ulok}`);
};

const writeCandidate = async (
    client: PoolClient,
    candidate: Candidate,
    action: OpnameFinalMigrationAction,
    googleProvider: GoogleProvider
) => {
    if (action === "skip") return { status: "skipped", source_candidate_id: candidate.source_candidate_id, target_id: candidate.existing_id };
    if (candidate.issues.length > 0 || !candidate.toko_id || !candidate.created_at) {
        throw new AppError(`Opname ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak valid: ${candidate.issues.join(", ")}`, 422);
    }
    if (action === "insert" && candidate.existing_id) throw new AppError(`Opname ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} sudah ada`, 409);
    if (action === "replace" && !candidate.existing_id) throw new AppError(`Opname existing ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak ditemukan`, 404);

    let targetId = candidate.existing_id;
    const isFinal = candidate.migration_type === "FINAL";
    const tipeOpname = isFinal ? "OPNAME_FINAL" : "OPNAME";
    const aksi = isFinal ? "terkunci" : "active";
    const headerStatus = isFinal ? "Disetujui" : "Proses KTK/Approval Kontraktor";
    
    // Fallback data approval untuk PDF (schema DB tidak punya nama_*, hanya pemberi_* dan waktu_*)
    const approverEmail = isFinal ? candidate.email_pembuat : null;
    const approvalDate = isFinal ? candidate.created_at : null;

    if (action === "replace" && targetId) {
        await client.query(`DELETE FROM opname_item WHERE id_opname_final = $1`, [targetId]);
        await client.query(`
            UPDATE opname_final
            SET tipe_opname=$1, aksi=$2, status_opname_final=$3,
                email_pembuat=$4, grand_total_opname=$5, grand_total_rab=$6,
                link_pdf_opname=NULL, alasan_penolakan=NULL, catatan_penolakan=NULL,
                created_at=$7::timestamp,
                pemberi_persetujuan_koordinator=$8, waktu_persetujuan_koordinator=$9::timestamp,
                pemberi_persetujuan_manager=$8, waktu_persetujuan_manager=$9::timestamp,
                pemberi_persetujuan_direktur=$8, waktu_persetujuan_direktur=$9::timestamp
            WHERE id=$10
        `, [
            tipeOpname, aksi, headerStatus,
            candidate.email_pembuat, candidate.grand_total_opname, candidate.grand_total_rab,
            candidate.created_at,
            approverEmail, approvalDate,
            targetId
        ]);
    } else {
        const inserted = await client.query<{ id: number }>(`
            INSERT INTO opname_final (
                id_toko, tipe_opname, aksi, status_opname_final, email_pembuat,
                grand_total_opname, grand_total_rab, created_at,
                pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager, waktu_persetujuan_manager,
                pemberi_persetujuan_direktur, waktu_persetujuan_direktur
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamp, $9,$10::timestamp, $9,$10::timestamp, $9,$10::timestamp)
            RETURNING id
        `, [
            candidate.toko_id, tipeOpname, aksi, headerStatus,
            candidate.email_pembuat, candidate.grand_total_opname, candidate.grand_total_rab,
            candidate.created_at,
            approverEmail, approvalDate
        ]);
        targetId = inserted.rows[0].id;
    }
    await insertItems(client, candidate, targetId!, googleProvider);
    if (isFinal) {
        const denda = await calculateDendaByTokoId(candidate.toko_id);
        await client.query(`
            UPDATE opname_final
            SET hari_denda=$1, nilai_denda=$2, tanggal_akhir_spk_denda=$3, tanggal_serah_terima_denda=$4
            WHERE id=$5
        `, [denda.hari_denda, denda.nilai_denda, denda.tanggal_akhir_spk, denda.tanggal_serah_terima, targetId]);
    }
    return {
        status: action === "replace" ? "replaced" : "inserted",
        source_candidate_id: candidate.source_candidate_id,
        target_id: targetId,
        migration_type: candidate.migration_type
    };
};

const queuePdfGeneration = (ids: number[]) => {
    if (ids.length === 0) return;
    setImmediate(async () => {
        for (const id of ids) {
            try {
                await opnameFinalService.refreshDendaAndPdfById(String(id));
                console.log(`[OPNAME_FINAL][MIGRATION_PDF] Berhasil generate id=${id}`);
            } catch (error) {
                console.error("[OPNAME_FINAL][MIGRATION_PDF] Gagal generate", {
                    id,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    });
};

export const opnameFinalMigrationService = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) throw new AppError("Hanya Super Human yang dapat melakukan migrasi Opname Final", 403);
        const candidates = await resolveCandidates(buffer);
        const details = candidates.map((candidate) => ({
            source_candidate_id: candidate.source_candidate_id,
            nomor_ulok: candidate.nomor_ulok,
            lingkup_pekerjaan: candidate.lingkup_pekerjaan,
            nama_toko: candidate.nama_toko,
            cabang: candidate.cabang,
            email_pembuat: candidate.email_pembuat,
            created_at: candidate.created_at,
            migration_type: candidate.migration_type,
            item_count: candidate.items.length,
            mapped_item_count: candidate.items.filter((item) => item.source_id).length,
            expected_item_count: candidate.expected_item_count,
            approved_count: candidate.approved_count,
            pending_count: candidate.pending_count,
            rejected_count: candidate.rejected_count,
            // Photo migration info
            photo_count: candidate.items.filter((item) => item.foto).length,
            photo_url_count: candidate.items.filter((item) => item.foto && item.foto.startsWith("http")).length,
            grand_total_rab: candidate.grand_total_rab,
            grand_total_opname: candidate.grand_total_opname,
            kerja_tambah: candidate.items.filter((item) => item.selisih_volume > 0).reduce((sum, item) => sum + Math.max(0, item.selisih_volume * (item.harga_material + item.harga_upah)), 0),
            kerja_kurang: candidate.items.filter((item) => item.selisih_volume < 0).reduce((sum, item) => sum + Math.abs(item.selisih_volume * (item.harga_material + item.harga_upah)), 0),
            existing_id: candidate.existing_id,
            existing_type: candidate.existing_type,
            existing_status: candidate.existing_status,
            db_state: candidate.issues.length > 0 ? "invalid" : candidate.existing_id ? "conflict" : "ready",
            issues: candidate.issues,
            warnings: candidate.warnings,
            unmapped_items: candidate.items.filter((item) => item.match_issue).slice(0, 8).map((item) => ({
                source_row: item.source_row,
                jenis_pekerjaan: item.jenis_pekerjaan,
                issue: item.match_issue
            }))
        }));
        return {
            total_candidates: details.length,
            partial_count: details.filter((row) => row.migration_type === "PARTIAL").length,
            final_count: details.filter((row) => row.migration_type === "FINAL").length,
            total_items: details.reduce((sum, row) => sum + row.item_count, 0),
            mapped_items: details.reduce((sum, row) => sum + row.mapped_item_count, 0),
            // Photo migration stats
            total_photos: details.reduce((sum, row) => sum + row.photo_count, 0),
            photos_to_migrate: details.reduce((sum, row) => sum + row.photo_url_count, 0),
            ready_count: details.filter((row) => row.db_state === "ready").length,
            conflict_count: details.filter((row) => row.db_state === "conflict").length,
            invalid_count: details.filter((row) => row.db_state === "invalid").length,
            details
        };
    },

    async commit(buffer: Buffer, input: OpnameFinalMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) throw new AppError("Hanya Super Human yang dapat melakukan migrasi Opname Final", 403);
        
        console.log("[MIGRATION] Starting opname final migration with photo re-upload...");
        const googleProvider = GoogleProvider.instance;
        
        const candidates = await resolveCandidates(buffer);
        const byId = new Map(candidates.map((candidate) => [candidate.source_candidate_id, candidate]));
        
        // Count total photos to migrate
        const selectedCandidates = input.selections
            .filter(sel => sel.action !== "skip")
            .map(sel => byId.get(sel.source_candidate_id))
            .filter((c): c is Candidate => Boolean(c));
        
        const totalPhotos = selectedCandidates.reduce((sum, c) => 
            sum + c.items.filter(item => item.foto && item.foto.startsWith("http")).length, 0
        );
        
        console.log(`[MIGRATION] Will process ${input.selections.length} opname with ${totalPhotos} photos to re-upload`);
        
        // ============================================================================
        // PRE-PROCESS PHOTOS: Lakukan di LUAR transaction untuk mencegah DB Connection Timeout
        // Chunk processing 10 foto sekaligus untuk mencegah Rate Limit & OOM
        // ============================================================================
        let photoProcessed = 0;
        for (const candidate of selectedCandidates) {
            for (let i = 0; i < candidate.items.length; i += 10) {
                const chunk = candidate.items.slice(i, i + 10);
                await Promise.all(chunk.map(async (item, chunkIndex) => {
                    if (!item.foto) return;
                    // Skip jika sudah format ID Drive
                    if (item.foto.length < 100 && !item.foto.startsWith("http")) return;
                    
                    const driveIdMatch = /\/d\/([^/]+)/.exec(item.foto) || /[?&]id=([^&]+)/.exec(item.foto);
                    if (driveIdMatch && driveIdMatch[1]) {
                        item.foto = driveIdMatch[1];
                        return;
                    }
                    
                    photoProcessed++;
                    console.log(`[MIGRATION] Photo ${photoProcessed}/${totalPhotos}: Re-uploading for ${candidate.nomor_ulok}...`);
                    
                    const imageBuffer = await downloadImageFromUrl(item.foto);
                    if (!imageBuffer) {
                        item.foto = null;
                        return;
                    }
                    
                    const driveFileId = await uploadImageToDrive(
                        googleProvider,
                        imageBuffer,
                        candidate.nomor_ulok,
                        i + chunkIndex + 1,
                        item.jenis_pekerjaan
                    );
                    
                    item.foto = driveFileId || null;
                }));
            }
        }
        console.log(`[MIGRATION] All ${photoProcessed} photos processed. Starting DB Transaction...`);
        
        const results = await withTransaction(async (client) => {
            const rows = [];
            let processedCount = 0;
            
            for (const selection of input.selections) {
                const candidate = byId.get(selection.source_candidate_id);
                if (!candidate) throw new AppError(`Kandidat ${selection.source_candidate_id} tidak ditemukan`, 404);
                
                processedCount++;
                console.log(`[MIGRATION] Processing ${processedCount}/${input.selections.length}: ${candidate.nomor_ulok}...`);
                
                rows.push(await writeCandidate(client, candidate, selection.action, googleProvider));
            }
            
            await activityLogRepository.insert({
                entity_type: "OPNAME_FINAL",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi Opname Final/KTK dari OPNAME_v1 (with photo re-upload)",
                metadata: { 
                    total_selected: input.selections.length,
                    total_photos_migrated: totalPhotos
                }
            }, client);
            
            return rows;
        });
        
        const pdfIds = results
            .filter((row) => row.status !== "skipped" && row.target_id && row.migration_type === "FINAL")
            .map((row) => Number(row.target_id));
        
        console.log(`[MIGRATION] Migration completed. Queueing ${pdfIds.length} PDF generations...`);
        queuePdfGeneration(pdfIds);
        
        return {
            total_selected: input.selections.length,
            inserted: results.filter((row) => row.status === "inserted").length,
            replaced: results.filter((row) => row.status === "replaced").length,
            skipped: results.filter((row) => row.status === "skipped").length,
            partial_processed: results.filter((row) => row.status !== "skipped" && row.migration_type === "PARTIAL").length,
            final_processed: results.filter((row) => row.status !== "skipped" && row.migration_type === "FINAL").length,
            pdf_queued: pdfIds.length,
            photos_migrated: totalPhotos,
            details: results
        };
    }
};
