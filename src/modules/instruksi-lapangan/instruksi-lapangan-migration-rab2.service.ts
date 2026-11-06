/**
 * Migrasi Instruksi Lapangan dari rab_kedua.xlsx
 *
 * Format file rab_kedua: WIDE — satu baris = satu submission toko.
 * Item ada di kolom Jenis_Pekerjaan_1..100, Satuan_Item_1..100, dst.
 * Sheet yang dibaca:
 *   - Form3 : IL generasi baru (punya kolom Luas Bangunan dll)
 *   - Form2 : IL generasi lama (tidak punya kolom Luas)
 *
 * Strategi merge:
 *   1. Form3 diproses lebih dulu — lebih lengkap strukturnya.
 *   2. Form2 ditambahkan hanya jika ULOK+Lingkup belum ada di Form3.
 *   3. Untuk ULOK yang punya multiple submissions di Form2,
 *      ambil yang paling baru berdasarkan Timestamp.
 *   4. Status mapping:
 *      "Disetujui"                         → "Disetujui"
 *      "Menunggu Persetujuan Koordinator"   → "Menunggu Persetujuan Koordinator"
 *      "Menunggu Persetujuan Manajer"       → "Menunggu Persetujuan Koordinator" (fallback)
 *      lainnya (Ditolak, TERISI, BATASAN)  → skip (invalid)
 */

import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import type {
    InstruksiLapanganMigrationAction,
    InstruksiLapanganMigrationCommitInput
} from "./instruksi-lapangan-migration.schema";

// ─── Types ───────────────────────────────────────────────────────────────────

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

/**
 * Kategori conflict untuk membantu user memutuskan action yang tepat.
 *
 * - "from_v1_migration"  : data DB berasal dari migrasi OPNAME_v1
 *                          → AMAN di-replace, rab_kedua adalah sumber yang benar
 * - "status_only"        : data DB identik (item & total sama), hanya status beda
 *                          → SKIP direkomendasikan, status di DB lebih maju
 * - "db_more_complete"   : DB punya lebih banyak item atau total lebih besar
 *                          → SKIP direkomendasikan, data DB lebih lengkap / lebih baru
 * - "data_differs"       : item & total berbeda, keduanya valid
 *                          → perlu review manual sebelum memutuskan
 */
export type ConflictReason =
    | "from_v1_migration"
    | "status_only"
    | "db_more_complete"
    | "data_differs"
    | null;

type Candidate = {
    source_candidate_id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string;
    email_pembuat: string;
    status: string;
    tanggal_mulai: string | null;
    tanggal_selesai: string | null;
    created_at: string | null;
    grand_total_raw: number;          // dari Excel — untuk referensi saja
    grand_total_non_sbo_raw: number;  // dari Excel
    // Approval data
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    items: Item[];
    source_sheet: "Form2" | "Form3";
    source_item_count: number;
    warnings: string[];
    // resolved setelah DB lookup:
    toko_id?: number | null;
    nama_toko?: string | null;
    cabang?: string | null;
    existing_id?: number | null;
    existing_email?: string | null;   // email pembuat di DB — untuk deteksi asal data
    existing_status?: string | null;  // status di DB
    existing_item_count?: number;     // jumlah item di DB
    existing_grand_total?: number;    // grand_total di DB
    conflict_reason?: ConflictReason; // alasan conflict — untuk panduan UI
    safe_to_replace?: boolean;        // rekomendasi apakah replace aman
    issues?: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");
const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, " ");

const numberValue = (value: unknown): number => {
    const raw = text(value).replace(/\s/g, "");
    if (!raw) return 0;
    const normalized = raw.includes(",")
        ? raw.replace(/\./g, "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(raw)
            ? raw.replace(/\./g, "")
            : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

// Volume limits per satuan untuk deteksi corruption
const VOLUME_LIMITS: Record<string, number> = {
    M2: 1000,    // Max 1000 M2 area untuk 1 toko
    M3: 500,     // Max 500 M3 volume
    M1: 500,     // Max 500 M length
    M: 500,      // Alias untuk M1
    KG: 10000,   // Max 10 ton
    TTK: 200,    // Max 200 points
    BH: 500,     // Max 500 units
    LS: 20,      // Max 20 lump sum items
    BTG: 1000,   // Max 1000 pieces
    UNIT: 500,   // Max 500 units
    SET: 100,    // Max 100 sets
    MODULE: 50,
    MODUL: 50,
};

/**
 * Auto-correct volume yang kehilangan decimal point menggunakan total_harga sebagai reference
 */
const autoCorrectVolumeFromTotal = (
    volume: number,
    satuan: string,
    hargaMaterial: number,
    hargaUpah: number,
    totalHarga: number,
    jenisPekerjaan: string
): { corrected: number; warning: string | null } => {
    const unitPrice = hargaMaterial + hargaUpah;
    
    // Jika unit price 0, tidak bisa validasi
    if (unitPrice === 0) {
        return { corrected: volume, warning: null };
    }
    
    // Calculate expected volume from total_harga
    const expectedVolume = totalHarga / unitPrice;
    
    // If volume matches expected (within 1%), no correction needed
    if (Math.abs(volume - expectedVolume) < Math.abs(expectedVolume * 0.01)) {
        return { corrected: volume, warning: null };
    }
    
    // Check if volume is way off (lost decimal point)
    const ratio = Math.abs(volume / expectedVolume);
    
    // If ratio is very large (>100x), likely lost decimal point
    if (ratio > 100) {
        // Try different divisors to find the correct decimal placement
        const divisors = [1000000, 100000, 10000, 1000, 100];
        
        for (const divisor of divisors) {
            const candidate = volume / divisor;
            const candidateTotal = candidate * unitPrice;
            const diff = Math.abs(candidateTotal - totalHarga);
            
            // If candidate total matches actual total within 1%
            if (diff < Math.abs(totalHarga * 0.01)) {
                return {
                    corrected: candidate,
                    warning: `Volume auto-corrected dari ${volume.toLocaleString()} ke ${candidate.toFixed(2)} (Excel kehilangan decimal point, dikoreksi dari total_harga ÷ harga_satuan)`
                };
            }
        }
    }
    
    // If expected volume is reasonable, use it
    if (ratio > 10 && expectedVolume < 10000 && expectedVolume > 0) {
        return {
            corrected: expectedVolume,
            warning: `Volume dikoreksi dari ${volume.toLocaleString()} ke ${expectedVolume.toFixed(2)} (dihitung dari total_harga ÷ harga_satuan karena nilai Excel tidak valid)`
        };
    }
    
    return { corrected: volume, warning: null };
};

/**
 * Validasi volume terhadap batas wajar per satuan
 */
const validateVolume = (volume: number, satuan: string, jenisPekerjaan: string): string | null => {
    const normalizedSatuan = satuan.toUpperCase().trim();
    const limit = VOLUME_LIMITS[normalizedSatuan] || 10000; // Default 10k if satuan not in list
    
    // Check for extreme values (likely data corruption)
    if (volume > limit) {
        return `Volume ${volume.toLocaleString()} ${satuan} melebihi batas wajar (max ${limit.toLocaleString()}). Kemungkinan data corrupt: "${jenisPekerjaan.slice(0, 50)}"`;
    }
    
    // Check for impossible negative volumes
    if (volume < -100) {
        return `Volume negatif ekstrem (${volume}) tidak wajar untuk ${satuan}`;
    }
    
    return null; // Valid
};

const scopeValue = (value: unknown): string => {
    const k = key(value);
    if (k === "SIPIL") return "Sipil";
    if (k === "ME") return "ME";
    return text(value) || "Sipil";
};

const parseTimestamp = (value: unknown): string | null => {
    const raw = text(value);
    if (!raw) return null;
    // ISO format: 2026-02-02T16:19:08.028132+07:00
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}:\d{2}))?/);
    if (iso) return `${iso[1]} ${iso[2] ?? "00:00:00"}`;
    // DD/MM/YYYY
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")} 00:00:00`;
    return null;
};

/**
 * Map status dari Excel ke status internal SPARTA.
 * Return null berarti row harus di-skip (status tidak valid untuk import).
 */
const mapStatus = (rawStatus: unknown): string | null => {
    const s = key(rawStatus);
    console.log(`[DEBUG] Mapping status: "${text(rawStatus)}" -> normalized: "${s}"`);
    if (s === "DISETUJUI") return "Disetujui";
    if (s === "MENUNGGU PERSETUJUAN KOORDINATOR") return "Menunggu Persetujuan Koordinator";
    if (s === "MENUNGGU PERSETUJUAN MANAJER") return "Menunggu Persetujuan Koordinator";
    // Ditolak, TERISI, BATASAN, kosong → skip
    console.log(`[DEBUG] Status "${s}" is invalid for import, will skip this row`);
    return null;
};

// ─── Wide-row → Items pivot ───────────────────────────────────────────────────

/**
 * Ekstrak item dari baris wide-format.
 * Kolom: Jenis_Pekerjaan_N, Satuan_Item_N, Volume_Item_N, Harga_Material_Item_N,
 *        Harga_Upah_Item_N, Total_Material_Item_N, Total_Upah_Item_N, Total_Harga_Item_N
 * Kategori ada di Kategori_Pekerjaan_N (bisa null — pakai carry-forward dari kategori sebelumnya).
 */
const extractItems = (row: CellRow): { items: Item[]; warnings: string[] } => {
    const items: Item[] = [];
    const warnings: string[] = [];
    let lastKategori = "LAINNYA";

    for (let i = 1; i <= 100; i++) {
        const jenis = text(row[`Jenis_Pekerjaan_${i}`]);
        if (!jenis) continue; // slot kosong

        const kategoriRaw = text(row[`Kategori_Pekerjaan_${i}`]);
        if (kategoriRaw) lastKategori = kategoriRaw;

        const volumeRaw = numberValue(row[`Volume_Item_${i}`]);
        const satuan = text(row[`Satuan_Item_${i}`]) || "-";
        const hargaMaterial = numberValue(row[`Harga_Material_Item_${i}`]);
        const hargaUpah = numberValue(row[`Harga_Upah_Item_${i}`]);

        // Prefer kolom Total_* dari Excel; fallback ke hasil kalkulasi
        const totalMaterial = numberValue(row[`Total_Material_Item_${i}`]) || volumeRaw * hargaMaterial;
        const totalUpah = numberValue(row[`Total_Upah_Item_${i}`]) || volumeRaw * hargaUpah;
        const totalHarga = numberValue(row[`Total_Harga_Item_${i}`]) || totalMaterial + totalUpah;

        // Auto-correct volume jika Excel kehilangan decimal point
        const { corrected: volume, warning: correctionWarning } = autoCorrectVolumeFromTotal(
            volumeRaw,
            satuan,
            hargaMaterial,
            hargaUpah,
            totalHarga,
            jenis
        );
        
        // Validate volume setelah koreksi
        const volumeIssue = validateVolume(volume, satuan, jenis);
        
        // Collect warnings
        if (correctionWarning) {
            warnings.push(`Item ${i}: ${correctionWarning}`);
        }
        if (volumeIssue) {
            warnings.push(`Item ${i}: ${volumeIssue}`);
        }
        if (volume === 0 && totalHarga === 0) {
            warnings.push(`Item ${i} (${jenis.slice(0, 40)}): volume dan total 0, tetap diimport`);
        }

        items.push({
            kategori_pekerjaan: lastKategori,
            jenis_pekerjaan: jenis,
            satuan,
            volume,  // Gunakan volume yang sudah dikoreksi
            harga_material: hargaMaterial,
            harga_upah: hargaUpah,
            total_material: volume * hargaMaterial,  // Recalculate dengan volume yang benar
            total_upah: volume * hargaUpah,
            total_harga: volume * (hargaMaterial + hargaUpah),
        });
    }

    return { items, warnings };
};

// ─── Parse workbook ───────────────────────────────────────────────────────────

const parseWorkbook = (buffer: Buffer): Candidate[] => {
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });

    const availableSheets = Object.keys(workbook.Sheets);
    console.log("[DEBUG] Available sheets in workbook:", availableSheets);

    const hasForm2 = Boolean(workbook.Sheets["Form2"]);
    const hasForm3 = Boolean(workbook.Sheets["Form3"]);

    console.log("[DEBUG] Has Form2:", hasForm2, "Has Form3:", hasForm3);

    if (!hasForm2 && !hasForm3) {
        // Cek apakah user upload OPNAME_v1 by mistake
        const hasOpnameV1Sheets = availableSheets.includes("data_rab") && availableSheets.includes("opname_final");
        if (hasOpnameV1Sheets) {
            throw new AppError(
                "File yang diupload adalah OPNAME_v1.xlsx. Untuk migrasi dari OPNAME_v1, gunakan halaman 'Migrasi OPNAME_v1' (bukan rab_kedua).",
                400
            );
        }

        throw new AppError(
            `File tidak valid: sheet Form2 atau Form3 harus tersedia di rab_kedua.xlsx. Sheet yang ditemukan: ${availableSheets.join(", ") || "(kosong)"}`,
            400
        );
    }

    // Baca kedua sheet
    const form3Rows: CellRow[] = hasForm3
        ? xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets["Form3"], { defval: null, raw: false })
        : [];
    const form2Rows: CellRow[] = hasForm2
        ? xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets["Form2"], { defval: null, raw: false })
        : [];

    console.log("[DEBUG] Form3 rows:", form3Rows.length, "Form2 rows:", form2Rows.length);

    // Validasi kolom minimal yang dibutuhkan
    const requiredColumns = ["Nomor Ulok", "Lingkup_Pekerjaan", "Status"];
    
    const validateColumns = (rows: CellRow[], sheetName: string) => {
        if (rows.length === 0) {
            console.log(`[WARNING] Sheet ${sheetName} kosong (0 baris data)`);
            return;
        }
        const firstRow = rows[0];
        const availableColumns = Object.keys(firstRow);
        const missing = requiredColumns.filter((col) => !availableColumns.includes(col));
        
        console.log(`[DEBUG] ${sheetName} columns (first 15):`, availableColumns.slice(0, 15));
        
        if (missing.length > 0) {
            throw new AppError(
                `Sheet ${sheetName} tidak memiliki kolom yang diperlukan: ${missing.join(", ")}. ` +
                `Kolom yang tersedia: ${availableColumns.slice(0, 10).join(", ")}${availableColumns.length > 10 ? ` (dan ${availableColumns.length - 10} kolom lainnya)` : ""}`,
                400
            );
        }
    };
    
    // Validasi kedua sheet
    if (hasForm3) validateColumns(form3Rows, "Form3");
    if (hasForm2) validateColumns(form2Rows, "Form2");

    // Cek sample kolom dari baris pertama untuk debugging
    if (form3Rows.length > 0) {
        console.log("[DEBUG] Form3 first row columns:", Object.keys(form3Rows[0]).slice(0, 10));
    }
    if (form2Rows.length > 0) {
        console.log("[DEBUG] Form2 first row columns:", Object.keys(form2Rows[0]).slice(0, 10));
    }

    // Map: ULOK+lingkup → Candidate terbaik
    const candidateMap = new Map<string, Candidate>();
    let candidateId = 800000;

    const processRow = (row: CellRow, sheet: "Form2" | "Form3") => {
        const nomorUlok = text(row["Nomor Ulok"]).toUpperCase();
        const lingkup = scopeValue(row["Lingkup_Pekerjaan"]);
        if (!nomorUlok || !lingkup) {
            console.log(`[DEBUG] ${sheet} skipped row - Nomor Ulok: "${text(row["Nomor Ulok"])}", Lingkup: "${text(row["Lingkup_Pekerjaan"])}"`);
            return;
        }

        const mappedStatus = mapStatus(row["Status"]);
        if (!mappedStatus) {
            console.log(`[DEBUG] ${sheet} skipped row ${nomorUlok} - Invalid status: "${text(row["Status"])}"`);
            return; // skip Ditolak, TERISI, BATASAN, dll.
        }

        const groupKey = `${nomorUlok}|${lingkup}`;
        const timestamp = parseTimestamp(row["Timestamp"]);

        // Jika ULOK sudah ada di map (dari Form3), hanya replace jika ini lebih baru
        const existing = candidateMap.get(groupKey);
        if (existing) {
            const existingTs = existing.created_at ?? "";
            const newTs = timestamp ?? "";
            // Jangan replace jika existing sudah dari Form3 dan baru ini dari Form2
            if (existing.source_sheet === "Form3" && sheet === "Form2") return;
            // Replace jika timestamp lebih baru
            if (newTs <= existingTs) return;
        }

        const { items, warnings } = extractItems(row);

        if (items.length === 0) {
            // Tetap buat kandidat tapi tandai issue nanti
        }

        candidateId += 1;
        const candidate: Candidate = {
            source_candidate_id: candidateId,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: lingkup,
            email_pembuat: text(row["Email_Pembuat"]) || "migration@sparta.local",
            status: mappedStatus,
            tanggal_mulai: timestamp ? timestamp.substring(0, 10) : null,
            tanggal_selesai: timestamp ? timestamp.substring(0, 10) : null,
            created_at: timestamp,
            grand_total_raw: numberValue(row["Grand Total"]),
            grand_total_non_sbo_raw: numberValue(row["Grand Total Non-SBO"]),
            // Approval data dari Excel
            pemberi_persetujuan_koordinator: text(row["Pemberi Persetujuan Koordinator"]) || null,
            waktu_persetujuan_koordinator: parseTimestamp(row["Waktu Persetujuan Koordinator"]),
            pemberi_persetujuan_manager: text(row["Pemberi Persetujuan Manager"]) || null,
            waktu_persetujuan_manager: parseTimestamp(row["Waktu Persetujuan Manager"]),
            items,
            source_sheet: sheet,
            source_item_count: items.length,
            warnings,
        };

        candidateMap.set(groupKey, candidate);
    };

    // Proses Form3 dulu (prioritas lebih tinggi)
    let form3Processed = 0;
    for (const row of form3Rows) { 
        const beforeSize = candidateMap.size;
        processRow(row, "Form3");
        if (candidateMap.size > beforeSize) form3Processed++;
    }
    // Lalu Form2 — hanya masuk jika ULOK belum ada
    let form2Processed = 0;
    for (const row of form2Rows) {
        const beforeSize = candidateMap.size;
        processRow(row, "Form2");
        if (candidateMap.size > beforeSize) form2Processed++;
    }

    const result = [...candidateMap.values()].sort((a, b) =>
        `${a.nomor_ulok}|${a.lingkup_pekerjaan}`.localeCompare(`${b.nomor_ulok}|${b.lingkup_pekerjaan}`)
    );

    console.log(`[INFO] Parse summary: Form3 → ${form3Processed} candidates, Form2 → ${form2Processed} candidates, Total → ${result.length}`);
    
    if (result.length === 0) {
        console.error("[ERROR] No valid candidates found! Check:");
        console.error("  - Kolom 'Nomor Ulok' harus terisi");
        console.error("  - Kolom 'Lingkup_Pekerjaan' harus terisi (Sipil/ME)");
        console.error("  - Kolom 'Status' harus valid (Disetujui/Menunggu Persetujuan)");
        throw new AppError(
            "Tidak ada data IL yang valid di file. Pastikan kolom 'Nomor Ulok', 'Lingkup_Pekerjaan', dan 'Status' terisi dengan benar.",
            400
        );
    }

    return result;
};

// ─── Resolve against DB ───────────────────────────────────────────────────────

const resolveCandidates = async (candidates: Candidate[]): Promise<Candidate[]> => {
    if (candidates.length === 0) return [];

    const uloks = [...new Set(candidates.map((c) => c.nomor_ulok))];

    // Query toko + IL terakhir beserta detail untuk analisis conflict_reason
    const result = await pool.query<{
        toko_id: number;
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        nama_toko: string | null;
        cabang: string | null;
        existing_id: number | null;
        existing_email: string | null;
        existing_status: string | null;
        existing_item_count: number;
        existing_grand_total: string | null;
    }>(`
        SELECT
            t.id AS toko_id,
            t.nomor_ulok,
            t.lingkup_pekerjaan,
            t.nama_toko,
            t.cabang,
            il.id               AS existing_id,
            il.email_pembuat    AS existing_email,
            il.status           AS existing_status,
            COALESCE(ic.item_count, 0)::int AS existing_item_count,
            il.grand_total      AS existing_grand_total
        FROM toko t
        LEFT JOIN LATERAL (
            SELECT id, email_pembuat, status, grand_total
            FROM instruksi_lapangan
            WHERE id_toko = t.id
            ORDER BY id DESC
            LIMIT 1
        ) il ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS item_count
            FROM instruksi_lapangan_item
            WHERE id_instruksi_lapangan = il.id
        ) ic ON TRUE
        WHERE UPPER(t.nomor_ulok) = ANY($1::text[])
    `, [uloks]);

    const targets = new Map(
        result.rows.map((row) => [
            `${key(row.nomor_ulok)}|${key(row.lingkup_pekerjaan)}`,
            row
        ])
    );

    return candidates.map((candidate) => {
        const target = targets.get(`${candidate.nomor_ulok}|${key(candidate.lingkup_pekerjaan)}`);
        const issues: string[] = [];

        if (!target) issues.push("Toko ULOK + lingkup tidak ditemukan di database");
        if (candidate.items.length === 0) issues.push("Tidak memiliki item IL (semua slot kosong)");
        if (candidate.items.some((item) => !item.jenis_pekerjaan)) issues.push("Terdapat item tanpa jenis pekerjaan");

        // Hitung conflict_reason jika ada existing data
        let conflict_reason: ConflictReason = null;
        let safe_to_replace = false;

        if (target?.existing_id) {
            const dbEmail = (target.existing_email ?? "").toLowerCase();
            const dbTotal = Number(target.existing_grand_total ?? 0);
            const dbItems = target.existing_item_count;
            const rab2Total = candidate.grand_total_raw;
            const rab2Items = candidate.items.length;
            const totalDiff = Math.abs(dbTotal - rab2Total);
            const itemDiff = Math.abs(dbItems - rab2Items);

            // Deteksi lebih strict: hanya jika EXACTLY "migration@sparta.local"
            const isFromV1 = dbEmail === "migration@sparta.local" || dbEmail === "migration@sparta";

            if (isFromV1) {
                // Data dari migrasi v1 — rab_kedua adalah sumber yang lebih benar
                conflict_reason = "from_v1_migration";
                safe_to_replace = true;
            } else if (itemDiff === 0 && totalDiff < 1000) {
                // Data identik — hanya status yang beda
                conflict_reason = "status_only";
                safe_to_replace = false; // jangan replace, status DB lebih up-to-date
            } else if (dbItems > rab2Items || (totalDiff > 1000 && dbTotal > rab2Total)) {
                // DB lebih lengkap / lebih besar — jangan replace
                conflict_reason = "db_more_complete";
                safe_to_replace = false;
            } else {
                // Data beda tapi tidak jelas mana yang benar
                conflict_reason = "data_differs";
                safe_to_replace = false;
            }
        }

        return {
            ...candidate,
            toko_id: target?.toko_id ?? null,
            nama_toko: target?.nama_toko ?? null,
            cabang: target?.cabang ?? null,
            existing_id: target?.existing_id ?? null,
            existing_email: target?.existing_email ?? null,
            existing_status: target?.existing_status ?? null,
            existing_item_count: target?.existing_item_count ?? 0,
            existing_grand_total: Number(target?.existing_grand_total ?? 0),
            conflict_reason,
            safe_to_replace,
            issues,
        };
    });
};

// ─── Insert helpers ───────────────────────────────────────────────────────────

const insertItems = async (client: PoolClient, idInstruksi: number, items: Item[]) => {
    const values: unknown[] = [];
    const placeholders = items.map((item, index) => {
        const offset = index * 10;
        values.push(
            idInstruksi,
            item.kategori_pekerjaan,
            item.jenis_pekerjaan,
            item.satuan,
            item.volume,
            item.harga_material,
            item.harga_upah,
            item.total_material,
            item.total_upah,
            item.total_harga,
        );
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
    if (action === "skip") {
        return { status: "skipped", source_candidate_id: candidate.source_candidate_id, target_id: null };
    }

    if ((candidate.issues?.length ?? 0) > 0 || !candidate.toko_id) {
        throw new AppError(
            `IL ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak valid: ${candidate.issues?.join(", ")}`,
            422
        );
    }
    if (action === "insert" && candidate.existing_id) {
        throw new AppError(`IL ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} sudah ada di DB`, 409);
    }
    if (action === "replace" && !candidate.existing_id) {
        throw new AppError(`IL existing ${candidate.nomor_ulok}/${candidate.lingkup_pekerjaan} tidak ditemukan`, 404);
    }

    // Hitung grand total dari items (lebih akurat daripada pakai nilai Excel mentah)
    const grandTotal = candidate.items.reduce((sum, item) => sum + item.total_harga, 0);
    const grandTotalNonSbo = candidate.items
        .filter((item) => key(item.kategori_pekerjaan) !== "PEKERJAAN SBO")
        .reduce((sum, item) => sum + item.total_harga, 0);
    const noPpn = [candidate.cabang, candidate.nama_toko]
        .some((value) => /\b(BATAM|BINTAN)\b/.test(key(value ?? "")));
    const grandTotalFinal = (noPpn ? grandTotalNonSbo : grandTotalNonSbo * 1.11).toFixed(2);

    let targetId = candidate.existing_id ?? null;

    if (action === "replace" && targetId) {
        await client.query(`DELETE FROM instruksi_lapangan_item WHERE id_instruksi_lapangan = $1`, [targetId]);
        await client.query(`
            UPDATE instruksi_lapangan
            SET status=$1, email_pembuat=$2, tanggal_mulai=$3, tanggal_selesai=$4,
                grand_total=$5, grand_total_non_sbo=$6, grand_total_final=$7,
                pemberi_persetujuan_koordinator=$8, waktu_persetujuan_koordinator=$9::timestamp,
                pemberi_persetujuan_manager=$10, waktu_persetujuan_manager=$11::timestamp,
                created_at=COALESCE($12::timestamp, created_at)
            WHERE id=$13
        `, [
            candidate.status, candidate.email_pembuat,
            candidate.tanggal_mulai, candidate.tanggal_selesai,
            grandTotal.toString(), grandTotalNonSbo.toString(), grandTotalFinal,
            candidate.pemberi_persetujuan_koordinator, candidate.waktu_persetujuan_koordinator,
            candidate.pemberi_persetujuan_manager, candidate.waktu_persetujuan_manager,
            candidate.created_at, targetId,
        ]);
    } else {
        const inserted = await client.query<{ id: number }>(`
            INSERT INTO instruksi_lapangan (
                id_toko, status, email_pembuat, tanggal_mulai, tanggal_selesai,
                grand_total, grand_total_non_sbo, grand_total_final,
                pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager, waktu_persetujuan_manager,
                created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamp,$11,$12::timestamp,COALESCE($13::timestamp,timezone('Asia/Jakarta',now())))
            RETURNING id
        `, [
            candidate.toko_id, candidate.status, candidate.email_pembuat,
            candidate.tanggal_mulai, candidate.tanggal_selesai,
            grandTotal.toString(), grandTotalNonSbo.toString(), grandTotalFinal,
            candidate.pemberi_persetujuan_koordinator, candidate.waktu_persetujuan_koordinator,
            candidate.pemberi_persetujuan_manager, candidate.waktu_persetujuan_manager,
            candidate.created_at,
        ]);
        targetId = inserted.rows[0].id;
    }

    await insertItems(client, targetId!, candidate.items);

    return {
        status: action === "replace" ? "replaced" : "inserted",
        source_candidate_id: candidate.source_candidate_id,
        target_id: targetId,
    };
};

// ─── Public service ───────────────────────────────────────────────────────────

export const instruksiLapanganMigrationRab2Service = {
    async preview(buffer: Buffer, actorRole: string) {
        if (!hasSuperHumanRole(actorRole)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Instruksi Lapangan", 403);
        }

        console.log("[INFO] Starting parseWorkbook...");
        let candidates: Candidate[];
        try {
            candidates = parseWorkbook(buffer);
            console.log(`[INFO] parseWorkbook completed successfully. Found ${candidates.length} candidates.`);
        } catch (error) {
            console.error("[ERROR] parseWorkbook failed:", error);
            throw error;
        }

        console.log("[INFO] Starting resolveCandidates...");
        const resolvedCandidates = await resolveCandidates(candidates);
        console.log(`[INFO] resolveCandidates completed. ${resolvedCandidates.length} candidates resolved.`);

        const details = resolvedCandidates.map((candidate) => ({
            source_candidate_id: candidate.source_candidate_id,
            nomor_ulok: candidate.nomor_ulok,
            lingkup_pekerjaan: candidate.lingkup_pekerjaan,
            nama_toko: candidate.nama_toko ?? null,
            cabang: candidate.cabang ?? null,
            email_pembuat: candidate.email_pembuat,
            status: candidate.status,
            source_sheet: candidate.source_sheet,
            tanggal_mulai: candidate.tanggal_mulai,
            tanggal_selesai: candidate.tanggal_selesai,
            // Approval info
            pemberi_persetujuan_koordinator: candidate.pemberi_persetujuan_koordinator,
            waktu_persetujuan_koordinator: candidate.waktu_persetujuan_koordinator,
            pemberi_persetujuan_manager: candidate.pemberi_persetujuan_manager,
            waktu_persetujuan_manager: candidate.waktu_persetujuan_manager,
            item_count: candidate.items.length,
            source_item_count: candidate.source_item_count,
            grand_total: candidate.items.reduce((sum, item) => sum + item.total_harga, 0),
            grand_total_excel: candidate.grand_total_raw,       // untuk perbandingan
            grand_total_non_sbo_excel: candidate.grand_total_non_sbo_raw,
            existing_id: candidate.existing_id ?? null,
            // Detail conflict
            conflict_reason: candidate.conflict_reason ?? null,
            safe_to_replace: candidate.safe_to_replace ?? false,
            existing_status: candidate.existing_status ?? null,
            existing_email: candidate.existing_email ?? null,
            existing_item_count: candidate.existing_item_count ?? 0,
            existing_grand_total: candidate.existing_grand_total ?? 0,
            db_state: (candidate.issues?.length ?? 0) > 0
                ? "invalid"
                : candidate.existing_id
                    ? "conflict"
                    : "ready",
            issues: candidate.issues ?? [],
            warnings: candidate.warnings,
        }));

        return {
            total_candidates: details.length,
            total_items: details.reduce((sum, row) => sum + row.item_count, 0),
            ready_count: details.filter((row) => row.db_state === "ready").length,
            conflict_count: details.filter((row) => row.db_state === "conflict").length,
            invalid_count: details.filter((row) => row.db_state === "invalid").length,
            disetujui_count: details.filter((row) => row.status === "Disetujui").length,
            pending_count: details.filter((row) => row.status !== "Disetujui").length,
            // Breakdown sumber data
            source_breakdown: {
                from_form3: details.filter((row) => row.source_sheet === "Form3").length,
                from_form2: details.filter((row) => row.source_sheet === "Form2").length,
            },
            // Breakdown conflict supaya user tahu mana yang aman
            conflict_summary: {
                from_v1_migration: details.filter((row) => row.conflict_reason === "from_v1_migration").length,
                status_only:       details.filter((row) => row.conflict_reason === "status_only").length,
                db_more_complete:  details.filter((row) => row.conflict_reason === "db_more_complete").length,
                data_differs:      details.filter((row) => row.conflict_reason === "data_differs").length,
                safe_to_replace:   details.filter((row) => row.safe_to_replace).length,
            },
            details,
        };
    },

    async commit(buffer: Buffer, input: InstruksiLapanganMigrationCommitInput) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi Instruksi Lapangan", 403);
        }

        const candidates = await resolveCandidates(parseWorkbook(buffer));
        const byId = new Map(candidates.map((c) => [c.source_candidate_id, c]));

        const results = await withTransaction(async (client) => {
            const rows = [];
            for (const selection of input.selections) {
                const candidate = byId.get(selection.source_candidate_id);
                if (!candidate) {
                    throw new AppError(`Kandidat ${selection.source_candidate_id} tidak ditemukan`, 404);
                }
                rows.push(await writeCandidate(client, candidate, selection.action));
            }

            await activityLogRepository.insert({
                entity_type: "INSTRUKSI_LAPANGAN",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi Instruksi Lapangan dari rab_kedua.xlsx (Form2/Form3)",
                metadata: { total_selected: input.selections.length },
            }, client);

            return rows;
        });

        return {
            total_selected: input.selections.length,
            inserted: results.filter((r) => r.status === "inserted").length,
            replaced: results.filter((r) => r.status === "replaced").length,
            skipped: results.filter((r) => r.status === "skipped").length,
            details: results,
        };
    },
};
