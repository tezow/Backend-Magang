import * as xlsx from "xlsx";
import type { PoolClient } from "pg";
import { AppError } from "../../common/app-error";
import { normalizeProjectByUlok } from "../../common/project-type";
import { pool, withTransaction } from "../../db/pool";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import type { RabMigrationAction, RabMigrationCommitInput } from "./rab-migration.schema";

type CellRecord = Record<string, unknown>;

type SourceToko = {
    source_toko_id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

type SourceRab = {
    source_rab_id: number;
    source_toko_id: number;
    status: string | null;
    nama_pt: string | null;
    link_pdf_gabungan: string | null;
    link_pdf_non_sbo: string | null;
    link_pdf_rekapitulasi: string | null;
    link_pdf_sph: string | null;
    link_pdf_materai: string | null;
    logo: string | null;
    email_pembuat: string | null;
    pemberi_persetujuan_direktur: string | null;
    waktu_persetujuan_direktur: string | null;
    pemberi_persetujuan_koordinator: string | null;
    waktu_persetujuan_koordinator: string | null;
    pemberi_persetujuan_manager: string | null;
    waktu_persetujuan_manager: string | null;
    alasan_penolakan: string | null;
    waktu_penolakan: string | null;
    ditolak_oleh: string | null;
    durasi_pekerjaan: string | null;
    kategori_lokasi: string | null;
    no_polis: string | null;
    berlaku_polis: string | null;
    file_asuransi: string | null;
    luas_bangunan: string | null;
    luas_terbangun: string | null;
    luas_area_terbuka: string | null;
    luas_area_parkir: string | null;
    luas_area_sales: string | null;
    luas_gudang: string | null;
    grand_total: string | null;
    grand_total_non_sbo: string | null;
    grand_total_final: string | null;
    created_at: string | null;
};

type SourceRabItem = {
    source_item_id: number | null;
    source_rab_id: number;
    kategori_pekerjaan: string;
    jenis_pekerjaan: string;
    satuan: string;
    volume: string;
    harga_material: string;
    harga_upah: string;
    total_material: string;
    total_upah: string;
    total_harga: string;
    catatan: string | null;
};

type Candidate = {
    source_rab_id: number;
    source_toko_id: number;
    toko: SourceToko | null;
    rab: SourceRab;
    items: SourceRabItem[];
    issues: string[];
    warnings: string[];
    duplicate_group_key: string | null;
    duplicate_count: number;
    duplicate_recommended: boolean;
};

type ExistingRab = {
    existing_toko_id: number | null;
    existing_rab_id: number | null;
    existing_created_at: string | null;
    existing_item_count: number;
    existing_match_count: number;
};

type ParsedWorkbook = {
    candidates: Candidate[];
    source_format: "legacy_tables" | "data_form_form2";
    ignored_sheets: string[];
    materai_count: number;
    materai_ambiguous_count: number;
};

let rabCreatedAtColumnCache: boolean | null = null;

const ensureRabCreatedAtColumnKnown = async (db: PoolClient | typeof pool): Promise<boolean> => {
    if (rabCreatedAtColumnCache !== null) return rabCreatedAtColumnCache;

    const columnCheck = await db.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM pg_attribute
            WHERE attrelid = 'rab'::regclass
              AND attname = 'created_at'
              AND NOT attisdropped
        ) AS exists
        `
    );
    rabCreatedAtColumnCache = columnCheck.rows[0]?.exists ?? false;
    return rabCreatedAtColumnCache;
};

const REQUIRED_SHEETS = ["toko", "rab", "rab_item"];

const hasSuperHumanRole = (role: string) => role.toUpperCase().includes("SUPER HUMAN");

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const nullableText = (value: unknown): string | null => {
    const text = normalizeCell(value);
    return text ? text : null;
};

const toSourceId = (value: unknown): number | null => {
    const parsed = Number(normalizeCell(value));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const excelDateToIso = (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 19).replace("T", " ");
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 19).replace("T", " ");
    }
    const raw = normalizeCell(value);
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 19).replace("T", " ");
    if (raw.includes("/")) {
        const parts = raw.split("/");
        if (parts.length === 3) {
            const monthFirst = Number(parts[0]) > 12 ? false : Number(parts[1]) > 12 ? true : true;
            const day = monthFirst ? parts[1] : parts[0];
            const month = monthFirst ? parts[0] : parts[1];
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")} 00:00:00`;
        }
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && /\d/.test(raw)) {
        return parsed.toISOString().slice(0, 19).replace("T", " ");
    }
    return null;
};

const numberText = (value: unknown): string => {
    const text = normalizeCell(value);
    if (!text) return "0";
    const numeric = Number(text.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(numeric) ? String(numeric) : text;
};

const integerMoneyText = (value: unknown): string => {
    const numeric = Number(numberText(value));
    return Number.isFinite(numeric) ? String(Math.round(numeric)) : "0";
};

const sourceNaturalKey = (toko: SourceToko | null): string | null => {
    if (!toko?.nomor_ulok) return null;
    return `${toko.nomor_ulok.trim().toUpperCase()}\u0000${String(toko.lingkup_pekerjaan ?? "").trim().toUpperCase()}`;
};

const readRows = (workbook: xlsx.WorkBook, sheetName: string): CellRecord[] => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json<CellRecord>(sheet, { defval: "", raw: true });
};

const appendDuplicateIssues = (candidates: Candidate[]): void => {
    const duplicatesByKey = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
        const key = sourceNaturalKey(candidate.toko);
        if (!key) continue;
        duplicatesByKey.set(key, [...(duplicatesByKey.get(key) ?? []), candidate]);
    }

    const statusRank = (status: string | null): number => {
        const normalized = normalizeCell(status).toUpperCase();
        if (normalized.includes("DISETUJUI") || normalized.includes("APPROVED")) return 3;
        if (normalized.includes("MENUNGGU") || normalized.includes("WAITING")) return 2;
        return 1;
    };
    const timeRank = (candidate: Candidate): number => {
        if (!candidate.rab.created_at) return 0;
        const parsed = new Date(candidate.rab.created_at).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    };

    for (const [key, duplicateRows] of duplicatesByKey) {
        if (duplicateRows.length <= 1) continue;
        const ranked = [...duplicateRows].sort((left, right) =>
            statusRank(right.rab.status) - statusRank(left.rab.status)
            || right.items.length - left.items.length
            || Number(right.rab.grand_total ?? 0) - Number(left.rab.grand_total ?? 0)
            || timeRank(right) - timeRank(left)
            || right.source_rab_id - left.source_rab_id
        );
        const winner = ranked[0];
        for (const candidate of duplicateRows) {
            candidate.duplicate_group_key = key;
            candidate.duplicate_count = duplicateRows.length;
            candidate.duplicate_recommended = candidate.source_rab_id === winner.source_rab_id;
            candidate.warnings.push(
                candidate.duplicate_recommended
                    ? `Duplicate ${duplicateRows.length} baris: kandidat ini direkomendasikan berdasarkan status, jumlah item, nilai, dan tanggal`
                    : `Duplicate ${duplicateRows.length} baris: kandidat rekomendasi adalah source RAB #${winner.source_rab_id}`
            );
        }
    }
};

const appendItemTotalConsistencyIssue = (
    warnings: string[],
    rab: SourceRab,
    items: SourceRabItem[]
): void => {
    const itemTotal = items.reduce((sum, item) => sum + Number(item.total_harga || 0), 0);
    const headerTotal = Number(rab.grand_total || 0);

    if (!Number.isFinite(itemTotal) || !Number.isFinite(headerTotal)) return;
    if (Math.abs(itemTotal - headerTotal) <= 1) return;

    warnings.push(
        `Jumlah total_harga item (${Math.round(itemTotal)}) tidak sama dengan grand_total RAB (${Math.round(headerTotal)})`
    );
};

const naturalKey = (nomorUlok: unknown, lingkup: unknown): string =>
    `${normalizeCell(nomorUlok).toUpperCase()}\u0000${normalizeCell(lingkup).toUpperCase()}`;

type MateraiMapping = {
    byNaturalKey: Map<string, string>;
    byUlokUnique: Map<string, string>;
    ambiguousUloks: Set<string>;
};

const parseMateraiWorkbook = (buffer?: Buffer): MateraiMapping | null => {
    if (!buffer?.length) return null;

    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
    const rows = readRows(workbook, "dokumen");
    if (rows.length === 0) {
        throw new AppError("File MATERAI harus memiliki sheet dokumen dengan kolom ulok dan dokumen.", 400);
    }

    const byNaturalKey = new Map<string, string>();
    const linksByUlok = new Map<string, Set<string>>();

    for (const row of rows) {
        const nomorUlok = nullableText(row.ulok);
        const link = nullableText(row.dokumen);
        if (!nomorUlok || !link) continue;

        const lingkup = nullableText(row.lingkup_kerja) ?? nullableText(row.lingkup_pekerjaan) ?? "";
        const key = naturalKey(nomorUlok, lingkup);
        if (!byNaturalKey.has(key)) byNaturalKey.set(key, link);

        const ulokKey = nomorUlok.trim().toUpperCase();
        const links = linksByUlok.get(ulokKey) ?? new Set<string>();
        links.add(link);
        linksByUlok.set(ulokKey, links);
    }

    const byUlokUnique = new Map<string, string>();
    const ambiguousUloks = new Set<string>();
    for (const [ulok, links] of linksByUlok.entries()) {
        if (links.size === 1) {
            byUlokUnique.set(ulok, Array.from(links)[0]);
        } else {
            ambiguousUloks.add(ulok);
        }
    }

    return { byNaturalKey, byUlokUnique, ambiguousUloks };
};

const attachMateraiLinks = (parsed: ParsedWorkbook, materai: MateraiMapping | null): ParsedWorkbook => {
    if (!materai) return parsed;

    let materaiCount = 0;
    let ambiguousCount = 0;
    for (const candidate of parsed.candidates) {
        if (!candidate.toko) continue;

        const ulokKey = candidate.toko.nomor_ulok.trim().toUpperCase();
        const key = naturalKey(candidate.toko.nomor_ulok, candidate.toko.lingkup_pekerjaan ?? "");
        const exactLink = materai.byNaturalKey.get(key);
        const fallbackLink = materai.byUlokUnique.get(ulokKey);
        const link = exactLink ?? fallbackLink ?? null;

        if (link) {
            candidate.rab.link_pdf_materai = link;
            materaiCount += 1;
            if (exactLink) {
                candidate.warnings.push("PDF materai ditemukan dari file MATERAI");
            } else {
                candidate.warnings.push("PDF materai ditemukan dari fallback ULOK unik");
            }
        } else if (materai.ambiguousUloks.has(ulokKey)) {
            ambiguousCount += 1;
            candidate.warnings.push("PDF materai tidak dipasang karena ULOK punya beberapa link dan lingkup tidak cocok");
        }
    }

    return {
        ...parsed,
        materai_count: materaiCount,
        materai_ambiguous_count: ambiguousCount
    };
};

const buildCompanyByEmail = async (emails: string[]): Promise<Map<string, string>> => {
    const uniqueEmails = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
    const companyByEmail = new Map<string, string>();
    if (uniqueEmails.length === 0) return companyByEmail;

    const result = await pool.query<{ email: string; nama_pt: string | null }>(
        `
        SELECT LOWER(email_sat) AS email, nama_pt
        FROM user_cabang
        WHERE LOWER(email_sat) = ANY($1::text[])
          AND NULLIF(TRIM(COALESCE(nama_pt, '')), '') IS NOT NULL
        `,
        [uniqueEmails]
    );

    const companiesByEmail = new Map<string, Set<string>>();
    for (const row of result.rows) {
        const email = row.email;
        const company = normalizeCell(row.nama_pt);
        if (!email || !company) continue;
        const companies = companiesByEmail.get(email) ?? new Set<string>();
        companies.add(company);
        companiesByEmail.set(email, companies);
    }

    for (const [email, companies] of companiesByEmail.entries()) {
        if (companies.size === 1) {
            companyByEmail.set(email, Array.from(companies)[0]);
        }
    }

    return companyByEmail;
};

const buildExistingKodeTokoByKey = async (rows: CellRecord[]): Promise<{ byNaturalKey: Map<string, string>; byUlok: Map<string, string> }> => {
    const uniqueKeys = new Set<string>();
    const uniqueUloks = new Set<string>();
    const values: string[] = [];
    const placeholders: string[] = [];

    for (const row of rows) {
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        const lingkup = nullableText(row["Lingkup_Pekerjaan"]);
        if (!nomorUlok || !lingkup) continue;
        uniqueUloks.add(nomorUlok.trim().toUpperCase());
        const key = naturalKey(nomorUlok, lingkup);
        if (uniqueKeys.has(key)) continue;
        uniqueKeys.add(key);
        const base = values.length;
        placeholders.push(`($${base + 1}, $${base + 2})`);
        values.push(nomorUlok.trim().toUpperCase(), lingkup.trim().toUpperCase());
    }

    const kodeByKey = new Map<string, string>();
    const kodeByUlok = new Map<string, string>();
    if (placeholders.length === 0) return { byNaturalKey: kodeByKey, byUlok: kodeByUlok };

    const [keyResult, ulokResult] = await Promise.all([
        pool.query<{ nomor_ulok: string; lingkup_pekerjaan: string; kode_toko: string | null }>(
        `
        WITH wanted(nomor_ulok, lingkup_pekerjaan) AS (
            VALUES ${placeholders.join(", ")}
        )
        SELECT w.nomor_ulok, w.lingkup_pekerjaan, t.kode_toko
        FROM wanted w
        LEFT JOIN LATERAL (
            SELECT kode_toko
            FROM toko
            WHERE UPPER(TRIM(nomor_ulok)) = w.nomor_ulok
              AND UPPER(TRIM(COALESCE(lingkup_pekerjaan, ''))) = w.lingkup_pekerjaan
              AND NULLIF(TRIM(COALESCE(kode_toko, '')), '') IS NOT NULL
            ORDER BY id DESC
            LIMIT 1
        ) t ON TRUE
        `,
        values
        ),
        pool.query<{ nomor_ulok: string; kode_toko: string | null; kode_count: string | number }>(
        `
        SELECT UPPER(TRIM(nomor_ulok)) AS nomor_ulok,
               MIN(TRIM(kode_toko)) AS kode_toko,
               COUNT(DISTINCT UPPER(TRIM(kode_toko))) AS kode_count
        FROM toko
        WHERE UPPER(TRIM(nomor_ulok)) = ANY($1::text[])
          AND NULLIF(TRIM(COALESCE(kode_toko, '')), '') IS NOT NULL
        GROUP BY UPPER(TRIM(nomor_ulok))
        HAVING COUNT(DISTINCT UPPER(TRIM(kode_toko))) = 1
        `,
        [Array.from(uniqueUloks)]
        )
    ]);

    for (const row of keyResult.rows) {
        const kode = nullableText(row.kode_toko);
        if (!kode) continue;
        kodeByKey.set(naturalKey(row.nomor_ulok, row.lingkup_pekerjaan), kode);
    }

    for (const row of ulokResult.rows) {
        const kode = nullableText(row.kode_toko);
        if (!kode) continue;
        kodeByUlok.set(normalizeCell(row.nomor_ulok).toUpperCase(), kode);
    }

    return { byNaturalKey: kodeByKey, byUlok: kodeByUlok };
};

const buildDataFormEnrichment = async (workbook: xlsx.WorkBook, formRows: CellRecord[]): Promise<Map<string, { kode_toko: string | null; nama_kontraktor: string | null; nama_toko: string | null }>> => {
    const enrichment = new Map<string, { kode_toko: string | null; nama_kontraktor: string | null; nama_toko: string | null }>();
    const companyByEmail = await buildCompanyByEmail(formRows.map((row) => normalizeCell(row.Email_Pembuat)));
    const existingKodeToko = await buildExistingKodeTokoByKey(formRows);

    for (const row of readRows(workbook, "SPK_Data")) {
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        const lingkup = nullableText(row["Lingkup Pekerjaan"]);
        if (!nomorUlok || !lingkup) continue;

        const key = naturalKey(nomorUlok, lingkup);
        if (enrichment.has(key)) continue;
        enrichment.set(key, {
            kode_toko: nullableText(row["Kode Toko"]),
            nama_kontraktor: nullableText(row["Nama Kontraktor"]),
            nama_toko: nullableText(row["Nama_Toko"])
        });
    }

    for (const row of readRows(workbook, "dokumentasi_bangunan")) {
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        if (!nomorUlok) continue;

        const matchingKeys = Array.from(enrichment.keys()).filter((key) => key.startsWith(`${nomorUlok.trim().toUpperCase()}\u0000`));
        for (const key of matchingKeys) {
            const current = enrichment.get(key);
            if (!current) continue;
            enrichment.set(key, {
                kode_toko: current.kode_toko ?? nullableText(row["Kode Toko"]),
                nama_kontraktor: current.nama_kontraktor ?? nullableText(row["Kontraktor Sipil"]) ?? nullableText(row["Kontraktor ME"]),
                nama_toko: current.nama_toko ?? nullableText(row["Nama Toko"])
            });
        }
    }

    for (const row of formRows) {
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        const lingkup = nullableText(row["Lingkup_Pekerjaan"]);
        if (!nomorUlok || !lingkup) continue;

        const key = naturalKey(nomorUlok, lingkup);
        const current = enrichment.get(key);
        const company = companyByEmail.get(normalizeCell(row.Email_Pembuat).toLowerCase()) ?? null;
        const existingKodeTokoForRow = existingKodeToko.byNaturalKey.get(key) ?? existingKodeToko.byUlok.get(nomorUlok.trim().toUpperCase()) ?? null;
        if (!current) {
            enrichment.set(key, {
                kode_toko: existingKodeTokoForRow,
                nama_kontraktor: company,
                nama_toko: null
            });
            continue;
        }

        enrichment.set(key, {
            ...current,
            kode_toko: current.kode_toko ?? existingKodeTokoForRow,
            nama_kontraktor: current.nama_kontraktor ?? company
        });
    }

    return enrichment;
};

const parseLegacyWorkbook = (workbook: xlsx.WorkBook): ParsedWorkbook => {
    const tokoRows = readRows(workbook, "toko");
    const rabRows = readRows(workbook, "rab");
    const itemRows = readRows(workbook, "rab_item");

    const tokoById = new Map<number, SourceToko>();
    for (const row of tokoRows) {
        const id = toSourceId(row.id);
        const nomorUlok = nullableText(row.nomor_ulok);
        if (!id || !nomorUlok) continue;

        tokoById.set(id, {
            source_toko_id: id,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: nullableText(row.lingkup_pekerjaan),
            nama_toko: nullableText(row.nama_toko),
            kode_toko: nullableText(row.kode_toko),
            proyek: normalizeProjectByUlok(nomorUlok, nullableText(row.proyek)),
            cabang: nullableText(row.cabang),
            alamat: nullableText(row.alamat),
            nama_kontraktor: nullableText(row.nama_kontraktor)
        });
    }

    const itemsByRabId = new Map<number, SourceRabItem[]>();
    const skippedItemsByRabId = new Map<number, number>();
    const fallbackItemsByRabId = new Map<number, number>();
    for (const row of itemRows) {
        const sourceRabId = toSourceId(row.id_rab);
        const jenis = nullableText(row.jenis_pekerjaan);
        if (!sourceRabId) continue;
        if (!jenis) {
            skippedItemsByRabId.set(sourceRabId, (skippedItemsByRabId.get(sourceRabId) ?? 0) + 1);
            continue;
        }

        const kategori = nullableText(row.kategori_pekerjaan);
        const satuan = nullableText(row.satuan);
        if (!kategori || !satuan) {
            fallbackItemsByRabId.set(sourceRabId, (fallbackItemsByRabId.get(sourceRabId) ?? 0) + 1);
        }

        const item: SourceRabItem = {
            source_item_id: toSourceId(row.id),
            source_rab_id: sourceRabId,
            kategori_pekerjaan: kategori ?? "LAINNYA",
            jenis_pekerjaan: jenis,
            satuan: satuan ?? "-",
            volume: numberText(row.volume),
            harga_material: integerMoneyText(row.harga_material),
            harga_upah: integerMoneyText(row.harga_upah),
            total_material: integerMoneyText(row.total_material),
            total_upah: integerMoneyText(row.total_upah),
            total_harga: integerMoneyText(row.total_harga),
            catatan: nullableText(row.catatan)
        };

        const items = itemsByRabId.get(sourceRabId) ?? [];
        items.push(item);
        itemsByRabId.set(sourceRabId, items);
    }

    const candidates: Candidate[] = [];
    for (const row of rabRows) {
        const sourceRabId = toSourceId(row.id);
        const sourceTokoId = toSourceId(row.id_toko);
        if (!sourceRabId || !sourceTokoId) continue;

        const rab: SourceRab = {
            source_rab_id: sourceRabId,
            source_toko_id: sourceTokoId,
            status: nullableText(row.status),
            nama_pt: nullableText(row.nama_pt),
            link_pdf_gabungan: nullableText(row.link_pdf_gabungan),
            link_pdf_non_sbo: nullableText(row.link_pdf_non_sbo),
            link_pdf_rekapitulasi: nullableText(row.link_pdf_rekapitulasi),
            link_pdf_sph: nullableText(row.link_pdf_sph),
            link_pdf_materai: null,
            logo: nullableText(row.logo),
            email_pembuat: nullableText(row.email_pembuat),
            pemberi_persetujuan_direktur: nullableText(row.pemberi_persetujuan_direktur),
            waktu_persetujuan_direktur: excelDateToIso(row.waktu_persetujuan_direktur),
            pemberi_persetujuan_koordinator: nullableText(row.pemberi_persetujuan_koordinator),
            waktu_persetujuan_koordinator: excelDateToIso(row.waktu_persetujuan_koordinator),
            pemberi_persetujuan_manager: nullableText(row.pemberi_persetujuan_manager),
            waktu_persetujuan_manager: excelDateToIso(row.waktu_persetujuan_manager),
            alasan_penolakan: nullableText(row.alasan_penolakan),
            waktu_penolakan: excelDateToIso(row.waktu_penolakan),
            ditolak_oleh: nullableText(row.ditolak_oleh),
            durasi_pekerjaan: nullableText(row.durasi_pekerjaan),
            kategori_lokasi: nullableText(row.kategori_lokasi),
            no_polis: nullableText(row.no_polis),
            berlaku_polis: nullableText(row.berlaku_polis),
            file_asuransi: nullableText(row.file_asuransi),
            luas_bangunan: nullableText(row.luas_bangunan),
            luas_terbangun: nullableText(row.luas_terbangun),
            luas_area_terbuka: nullableText(row.luas_area_terbuka),
            luas_area_parkir: nullableText(row.luas_area_parkir),
            luas_area_sales: nullableText(row.luas_area_sales),
            luas_gudang: nullableText(row.luas_gudang),
            grand_total: integerMoneyText(row.grand_total),
            grand_total_non_sbo: integerMoneyText(row.grand_total_non_sbo),
            grand_total_final: integerMoneyText(row.grand_total_final),
            created_at: excelDateToIso(row.created_at)
        };

        const toko = tokoById.get(sourceTokoId) ?? null;
        const items = itemsByRabId.get(sourceRabId) ?? [];
        const issues: string[] = [];
        const warnings: string[] = [];
        if (!toko) issues.push(`Toko source id ${sourceTokoId} tidak ditemukan`);
        if (items.length === 0) issues.push("RAB tidak memiliki item");
        if (toko && !toko.nomor_ulok) issues.push("Nomor ULOK kosong");
        const skippedItemCount = skippedItemsByRabId.get(sourceRabId) ?? 0;
        const fallbackItemCount = fallbackItemsByRabId.get(sourceRabId) ?? 0;
        if (skippedItemCount > 0) issues.push(`${skippedItemCount} baris item tidak ikut masuk karena jenis_pekerjaan kosong`);
        if (fallbackItemCount > 0) warnings.push(`${fallbackItemCount} item memakai fallback kategori/satuan`);
        appendItemTotalConsistencyIssue(warnings, rab, items);

        candidates.push({
            source_rab_id: sourceRabId,
            source_toko_id: sourceTokoId,
            toko,
            rab,
            items,
            issues,
            warnings,
            duplicate_group_key: null,
            duplicate_count: 1,
            duplicate_recommended: true
        });
    }

    appendDuplicateIssues(candidates);

    return {
        candidates,
        source_format: "legacy_tables",
        ignored_sheets: ["RAB import ", "RAB ITEM Import"],
        materai_count: 0,
        materai_ambiguous_count: 0
    };
};

const parseDataFormWorkbook = async (workbook: xlsx.WorkBook): Promise<ParsedWorkbook> => {
    const form2Rows = readRows(workbook, "Form2");
    const form2Keys = new Set(
        form2Rows
            .filter((row) => nullableText(row["Nomor Ulok"]))
            .map((row) => naturalKey(row["Nomor Ulok"], row.Lingkup_Pekerjaan))
    );
    const supplementalForm3Rows = readRows(workbook, "Form3")
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
            const nomorUlok = nullableText(row["Nomor Ulok"]);
            return Boolean(nomorUlok) && !form2Keys.has(naturalKey(nomorUlok, row.Lingkup_Pekerjaan));
        });
    const rowEntries = [
        ...form2Rows.map((row, index) => ({
            row,
            sourceId: 200000 + index + 2,
            sourceSheet: "Form2"
        })),
        ...supplementalForm3Rows.map(({ row, index }) => ({
            row,
            sourceId: 210000 + index + 2,
            sourceSheet: "Form3"
        }))
    ];
    const rows = rowEntries.map((entry) => entry.row);
    const enrichmentByKey = await buildDataFormEnrichment(workbook, rows);
    const itemMetadataByName = new Map<string, { kategori: string | null; satuan: string | null }>();
    for (const row of rows) {
        for (let itemNumber = 1; itemNumber <= 200; itemNumber += 1) {
            const jenis = nullableText(row[`Jenis_Pekerjaan_${itemNumber}`]);
            if (!jenis) continue;
            const key = normalizeCell(jenis).replace(/\s+/g, " ").toUpperCase();
            const current = itemMetadataByName.get(key) ?? { kategori: null, satuan: null };
            itemMetadataByName.set(key, {
                kategori: current.kategori ?? nullableText(row[`Kategori_Pekerjaan_${itemNumber}`]),
                satuan: current.satuan ?? nullableText(row[`Satuan_Item_${itemNumber}`])
            });
        }
    }
    const candidates: Candidate[] = [];

    for (const entry of rowEntries) {
        const row = entry.row;
        const nomorUlok = nullableText(row["Nomor Ulok"]);
        if (!nomorUlok) continue;

        const sourceId = entry.sourceId;
        const lingkup = nullableText(row["Lingkup_Pekerjaan"]);
        const enriched = enrichmentByKey.get(naturalKey(nomorUlok, lingkup ?? ""));

        const toko: SourceToko = {
            source_toko_id: sourceId,
            nomor_ulok: nomorUlok,
            lingkup_pekerjaan: lingkup,
            nama_toko: nullableText(row.nama_toko) ?? enriched?.nama_toko ?? null,
            kode_toko: enriched?.kode_toko ?? null,
            proyek: normalizeProjectByUlok(nomorUlok, nullableText(row.Proyek)),
            cabang: nullableText(row.Cabang),
            alamat: nullableText(row.Alamat),
            nama_kontraktor: nullableText(row.Nama_PT) ?? enriched?.nama_kontraktor ?? null
        };

        const items: SourceRabItem[] = [];
        let fallbackItemCount = 0;
        let inferredItemCount = 0;
        for (let itemNumber = 1; itemNumber <= 200; itemNumber += 1) {
            const jenis = nullableText(row[`Jenis_Pekerjaan_${itemNumber}`]);
            if (!jenis) continue;

            const metadata = itemMetadataByName.get(
                normalizeCell(jenis).replace(/\s+/g, " ").toUpperCase()
            );
            const rawKategori = nullableText(row[`Kategori_Pekerjaan_${itemNumber}`]);
            const rawSatuan = nullableText(row[`Satuan_Item_${itemNumber}`]);
            const kategori = rawKategori ?? metadata?.kategori ?? null;
            const satuan = rawSatuan ?? metadata?.satuan ?? null;
            if ((!rawKategori && kategori) || (!rawSatuan && satuan)) inferredItemCount += 1;
            if (!kategori || !satuan) fallbackItemCount += 1;

            items.push({
                source_item_id: toSourceId(row[`No_Item_${itemNumber}`]) ?? itemNumber,
                source_rab_id: sourceId,
                kategori_pekerjaan: kategori ?? "LAINNYA",
                jenis_pekerjaan: jenis,
                satuan: satuan ?? "-",
                volume: numberText(row[`Volume_Item_${itemNumber}`]),
                harga_material: integerMoneyText(row[`Harga_Material_Item_${itemNumber}`]),
                harga_upah: integerMoneyText(row[`Harga_Upah_Item_${itemNumber}`]),
                total_material: integerMoneyText(row[`Total_Material_Item_${itemNumber}`]),
                total_upah: integerMoneyText(row[`Total_Upah_Item_${itemNumber}`]),
                total_harga: integerMoneyText(row[`Total_Harga_Item_${itemNumber}`]),
                catatan: null
            });
        }

        const issues: string[] = [];
        const warnings: string[] = [];
        if (entry.sourceSheet === "Form3") {
            warnings.push("Sumber Form3 digunakan karena ULOK + lingkup ini tidak tersedia di Form2");
        }
        if (items.length === 0) issues.push("RAB tidak memiliki item");
        if (!toko.nomor_ulok) issues.push("Nomor ULOK kosong");
        if (inferredItemCount > 0) warnings.push(`${inferredItemCount} item dilengkapi kategori/satuan dari pekerjaan identik di DATA FORM`);
        if (fallbackItemCount > 0) warnings.push(`${fallbackItemCount} item memakai fallback kategori/satuan`);
        if (!toko.nama_kontraktor) warnings.push("Nama kontraktor tidak ditemukan di Form2.Nama_PT/SPK_Data/user_cabang");
        if (!enriched?.kode_toko) warnings.push("Kode toko tidak ditemukan di SPK_Data/dokumentasi_bangunan/DB existing");

        const rab: SourceRab = {
            source_rab_id: sourceId,
            source_toko_id: sourceId,
            status: nullableText(row.Status),
            nama_pt: nullableText(row.Nama_PT),
            link_pdf_gabungan: nullableText(row["Link PDF"]),
            link_pdf_non_sbo: nullableText(row["Link PDF Non-SBO"]),
            link_pdf_rekapitulasi: nullableText(row["Link PDF Rekapitulasi"]),
            link_pdf_sph: nullableText(row["Link Surat Penawaran"]),
            link_pdf_materai: null,
            logo: nullableText(row.Logo),
            email_pembuat: nullableText(row.Email_Pembuat),
            pemberi_persetujuan_direktur: nullableText(row["Pemberi Persetujuan Direktur"]),
            waktu_persetujuan_direktur: excelDateToIso(row["Waktu Persetujuan Direktur"]),
            pemberi_persetujuan_koordinator: nullableText(row["Pemberi Persetujuan Koordinator"]),
            waktu_persetujuan_koordinator: excelDateToIso(row["Waktu Persetujuan Koordinator"]),
            pemberi_persetujuan_manager: nullableText(row["Pemberi Persetujuan Manager"]),
            waktu_persetujuan_manager: excelDateToIso(row["Waktu Persetujuan Manager"]),
            alasan_penolakan: nullableText(row["Alasan Penolakan"]),
            waktu_penolakan: null,
            ditolak_oleh: null,
            durasi_pekerjaan: nullableText(row.Durasi_Pekerjaan),
            kategori_lokasi: nullableText(row.Kategori_Lokasi),
            no_polis: null,
            berlaku_polis: null,
            file_asuransi: null,
            luas_bangunan: nullableText(row["Luas Bangunan"]),
            luas_terbangun: nullableText(row["Luas Terbangunan"]),
            luas_area_terbuka: nullableText(row["Luas Area Terbuka"]),
            luas_area_parkir: nullableText(row["Luas Area Parkir"]),
            luas_area_sales: nullableText(row["Luas Area Sales"]),
            luas_gudang: nullableText(row["Luas Gudang"]),
            grand_total: integerMoneyText(row["Grand Total"]),
            grand_total_non_sbo: integerMoneyText(row["Grand Total Non-SBO"]),
            grand_total_final: integerMoneyText(row["Grand Total Final"]),
            created_at: excelDateToIso(row.Timestamp)
        };
        appendItemTotalConsistencyIssue(warnings, rab, items);

        candidates.push({
            source_rab_id: sourceId,
            source_toko_id: sourceId,
            toko,
            rab,
            items,
            issues,
            warnings,
            duplicate_group_key: null,
            duplicate_count: 1,
            duplicate_recommended: true
        });
    }

    appendDuplicateIssues(candidates);

    return {
        candidates,
        source_format: "data_form_form2",
        ignored_sheets: workbook.SheetNames.filter(
            (sheet) => !["Form2", "Form3", "SPK_Data", "dokumentasi_bangunan"].includes(sheet)
        ),
        materai_count: 0,
        materai_ambiguous_count: 0
    };
};

const parseWorkbook = async (buffer: Buffer, materaiBuffer?: Buffer): Promise<ParsedWorkbook> => {
    if (!buffer.length) throw new AppError("File Excel wajib diupload", 400);

    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
    const materai = parseMateraiWorkbook(materaiBuffer);
    const hasLegacySheets = REQUIRED_SHEETS.every((sheet) => workbook.Sheets[sheet]);
    if (hasLegacySheets) return attachMateraiLinks(parseLegacyWorkbook(workbook), materai);
    if (workbook.Sheets.Form2) return attachMateraiLinks(await parseDataFormWorkbook(workbook), materai);

    const missingSheets = REQUIRED_SHEETS.filter((sheet) => !workbook.Sheets[sheet]);
    throw new AppError(`Format file tidak dikenali. Upload file dengan sheet ${REQUIRED_SHEETS.join(", ")} atau DATA FORM sheet Form2. Sheet legacy yang kurang: ${missingSheets.join(", ")}`, 400);
};

const findExistingRab = async (candidate: Candidate, client?: PoolClient): Promise<ExistingRab> => {
    if (!candidate.toko) {
        return { existing_toko_id: null, existing_rab_id: null, existing_created_at: null, existing_item_count: 0, existing_match_count: 0 };
    }

    const db = client ?? pool;
    await ensureRabCreatedAtColumnKnown(db);

    const createdAtSelect = rabCreatedAtColumnCache ? "r.created_at AS rab_created_at," : "NULL::timestamp AS rab_created_at,";
    const createdAtInnerSelect = rabCreatedAtColumnCache ? "id, created_at" : "id";
    const createdAtOrder = rabCreatedAtColumnCache ? "created_at DESC," : "";
    const result = await db.query<{
        toko_id: number;
        rab_id: number | null;
        rab_created_at: string | null;
        item_count: string | number | null;
        toko_match_count: string | number | null;
    }>(
        `
        SELECT
            t.id AS toko_id,
            t.match_count AS toko_match_count,
            r.id AS rab_id,
            ${createdAtSelect}
            COUNT(ri.id) AS item_count
        FROM (
            SELECT id, COUNT(*) OVER () AS match_count
            FROM toko
            WHERE nomor_ulok = $1
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE($2, ''))
            ORDER BY id DESC
            LIMIT 1
        ) t
        LEFT JOIN LATERAL (
            SELECT ${createdAtInnerSelect}
            FROM rab
            WHERE id_toko = t.id
            ORDER BY ${createdAtOrder} id DESC
            LIMIT 1
        ) r ON TRUE
        LEFT JOIN rab_item ri ON ri.id_rab = r.id
        GROUP BY 1, 2, 3, 4
        `,
        [candidate.toko.nomor_ulok, candidate.toko.lingkup_pekerjaan]
    );

    const row = result.rows[0];
    if (!row) return { existing_toko_id: null, existing_rab_id: null, existing_created_at: null, existing_item_count: 0, existing_match_count: 0 };

    return {
        existing_toko_id: row.toko_id,
        existing_rab_id: row.rab_id,
        existing_created_at: row.rab_created_at ?? null,
        existing_item_count: Number(row.item_count ?? 0),
        existing_match_count: Number(row.toko_match_count ?? 0)
    };
};

const existingKey = (nomorUlok: string, lingkup?: string | null) =>
    `${nomorUlok.trim()}\u0000${String(lingkup ?? "").trim().toLowerCase()}`;

const findExistingRabs = async (candidates: Candidate[]): Promise<Map<string, ExistingRab>> => {
    const validCandidates = candidates.filter((candidate): candidate is Candidate & { toko: SourceToko } => Boolean(candidate.toko));
    const resultMap = new Map<string, ExistingRab>();
    if (validCandidates.length === 0) return resultMap;

    await ensureRabCreatedAtColumnKnown(pool);
    const createdAtSelect = rabCreatedAtColumnCache ? "r.created_at AS rab_created_at," : "NULL::timestamp AS rab_created_at,";
    const createdAtInnerSelect = rabCreatedAtColumnCache ? "id, created_at" : "id";
    const createdAtOrder = rabCreatedAtColumnCache ? "created_at DESC," : "";

    const uniqueKeys = new Set<string>();
    const values: string[] = [];
    const placeholders: string[] = [];
    for (const candidate of validCandidates) {
        const key = existingKey(candidate.toko.nomor_ulok, candidate.toko.lingkup_pekerjaan);
        if (uniqueKeys.has(key)) continue;
        uniqueKeys.add(key);
        const base = values.length;
        placeholders.push(`($${base + 1}, $${base + 2})`);
        values.push(candidate.toko.nomor_ulok, candidate.toko.lingkup_pekerjaan ?? "");
    }

    const existingRows = await pool.query<{
        nomor_ulok: string;
        lingkup_pekerjaan: string;
        toko_id: number | null;
        rab_id: number | null;
        rab_created_at: string | null;
        item_count: string | number | null;
        toko_match_count: string | number | null;
    }>(
        `
        WITH wanted(nomor_ulok, lingkup_pekerjaan) AS (
            VALUES ${placeholders.join(", ")}
        )
        SELECT
            w.nomor_ulok,
            w.lingkup_pekerjaan,
            t.id AS toko_id,
            t.match_count AS toko_match_count,
            r.id AS rab_id,
            ${createdAtSelect}
            COUNT(ri.id) AS item_count
        FROM wanted w
        LEFT JOIN LATERAL (
            SELECT id, COUNT(*) OVER () AS match_count
            FROM toko
            WHERE nomor_ulok = w.nomor_ulok
              AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE(w.lingkup_pekerjaan, ''))
            ORDER BY id DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT ${createdAtInnerSelect}
            FROM rab
            WHERE id_toko = t.id
            ORDER BY ${createdAtOrder} id DESC
            LIMIT 1
        ) r ON TRUE
        LEFT JOIN rab_item ri ON ri.id_rab = r.id
        GROUP BY 1, 2, 3, 4, 5, 6
        `,
        values
    );

    for (const row of existingRows.rows) {
        resultMap.set(existingKey(row.nomor_ulok, row.lingkup_pekerjaan), {
            existing_toko_id: row.toko_id,
            existing_rab_id: row.rab_id,
            existing_created_at: row.rab_created_at ?? null,
            existing_item_count: Number(row.item_count ?? 0),
            existing_match_count: Number(row.toko_match_count ?? 0)
        });
    }

    return resultMap;
};

const insertOrUpdateToko = async (
    client: PoolClient,
    toko: SourceToko,
    existingTokoId: number | null,
    replaceToko: boolean
): Promise<number> => {
    if (existingTokoId) {
        if (replaceToko) {
            await client.query(
                `
                UPDATE toko
                SET lingkup_pekerjaan = COALESCE($1, lingkup_pekerjaan),
                    nama_toko = COALESCE($2, nama_toko),
                    kode_toko = COALESCE($3, kode_toko),
                    proyek = COALESCE($4, proyek),
                    cabang = COALESCE($5, cabang),
                    alamat = COALESCE($6, alamat),
                    nama_kontraktor = COALESCE($7, nama_kontraktor)
                WHERE id = $8
                `,
                [
                    toko.lingkup_pekerjaan,
                    toko.nama_toko,
                    toko.kode_toko,
                    toko.proyek,
                    toko.cabang,
                    toko.alamat,
                    toko.nama_kontraktor,
                    existingTokoId
                ]
            );
        }
        return existingTokoId;
    }

    const inserted = await client.query<{ id: number }>(
        `
        INSERT INTO toko (
            nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko,
            proyek, cabang, alamat, nama_kontraktor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        `,
        [
            toko.nomor_ulok,
            toko.lingkup_pekerjaan,
            toko.nama_toko,
            toko.kode_toko,
            toko.proyek,
            toko.cabang,
            toko.alamat,
            toko.nama_kontraktor
        ]
    );

    return inserted.rows[0].id;
};

const insertRab = async (client: PoolClient, tokoId: number, rab: SourceRab): Promise<number> => {
    if (!rabCreatedAtColumnCache) {
        const result = await client.query<{ id: number }>(
            `
            INSERT INTO rab (
                id_toko, status, nama_pt, link_pdf_gabungan, link_pdf_non_sbo,
                link_pdf_rekapitulasi, link_pdf_sph, logo, email_pembuat,
                pemberi_persetujuan_direktur, waktu_persetujuan_direktur,
                pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
                pemberi_persetujuan_manager, waktu_persetujuan_manager,
                alasan_penolakan, waktu_penolakan, ditolak_oleh, durasi_pekerjaan,
                kategori_lokasi, no_polis, berlaku_polis, file_asuransi,
                luas_bangunan, luas_terbangun, luas_area_terbuka, luas_area_parkir,
                luas_area_sales, luas_gudang, grand_total, grand_total_non_sbo,
                grand_total_final, link_pdf_materai
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11::timestamp, $12, $13::timestamp, $14, $15::timestamp,
                $16, $17::timestamp, $18, $19, $20, $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
            )
            RETURNING id
            `,
            [
                tokoId,
                rab.status,
                rab.nama_pt,
                rab.link_pdf_gabungan,
                rab.link_pdf_non_sbo,
                rab.link_pdf_rekapitulasi,
                rab.link_pdf_sph,
                rab.logo,
                rab.email_pembuat,
                rab.pemberi_persetujuan_direktur,
                rab.waktu_persetujuan_direktur,
                rab.pemberi_persetujuan_koordinator,
                rab.waktu_persetujuan_koordinator,
                rab.pemberi_persetujuan_manager,
                rab.waktu_persetujuan_manager,
                rab.alasan_penolakan,
                rab.waktu_penolakan,
                rab.ditolak_oleh,
                rab.durasi_pekerjaan,
                rab.kategori_lokasi,
                rab.no_polis,
                rab.berlaku_polis,
                rab.file_asuransi,
                rab.luas_bangunan,
                rab.luas_terbangun,
                rab.luas_area_terbuka,
                rab.luas_area_parkir,
                rab.luas_area_sales,
                rab.luas_gudang,
                rab.grand_total,
                rab.grand_total_non_sbo,
                rab.grand_total_final,
                rab.link_pdf_materai
            ]
        );

        return result.rows[0].id;
    }

    const result = await client.query<{ id: number }>(
        `
        INSERT INTO rab (
            id_toko, status, nama_pt, link_pdf_gabungan, link_pdf_non_sbo,
            link_pdf_rekapitulasi, link_pdf_sph, logo, email_pembuat,
            pemberi_persetujuan_direktur, waktu_persetujuan_direktur,
            pemberi_persetujuan_koordinator, waktu_persetujuan_koordinator,
            pemberi_persetujuan_manager, waktu_persetujuan_manager,
            alasan_penolakan, waktu_penolakan, ditolak_oleh, durasi_pekerjaan,
            kategori_lokasi, no_polis, berlaku_polis, file_asuransi,
            luas_bangunan, luas_terbangun, luas_area_terbuka, luas_area_parkir,
            luas_area_sales, luas_gudang, grand_total, grand_total_non_sbo,
            grand_total_final, created_at, link_pdf_materai
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11::timestamp, $12, $13::timestamp, $14, $15::timestamp,
            $16, $17::timestamp, $18, $19, $20, $21, $22, $23,
            $24, $25, $26, $27, $28, $29, $30, $31, $32,
            COALESCE($33::timestamp, timezone('Asia/Jakarta', now())), $34
        )
        RETURNING id
        `,
        [
            tokoId,
            rab.status,
            rab.nama_pt,
            rab.link_pdf_gabungan,
            rab.link_pdf_non_sbo,
            rab.link_pdf_rekapitulasi,
            rab.link_pdf_sph,
            rab.logo,
            rab.email_pembuat,
            rab.pemberi_persetujuan_direktur,
            rab.waktu_persetujuan_direktur,
            rab.pemberi_persetujuan_koordinator,
            rab.waktu_persetujuan_koordinator,
            rab.pemberi_persetujuan_manager,
            rab.waktu_persetujuan_manager,
            rab.alasan_penolakan,
            rab.waktu_penolakan,
            rab.ditolak_oleh,
            rab.durasi_pekerjaan,
            rab.kategori_lokasi,
            rab.no_polis,
            rab.berlaku_polis,
            rab.file_asuransi,
            rab.luas_bangunan,
            rab.luas_terbangun,
            rab.luas_area_terbuka,
            rab.luas_area_parkir,
            rab.luas_area_sales,
            rab.luas_gudang,
            rab.grand_total,
            rab.grand_total_non_sbo,
            rab.grand_total_final,
            rab.created_at,
            rab.link_pdf_materai
        ]
    );

    return result.rows[0].id;
};

const updateRab = async (client: PoolClient, rabId: number, rab: SourceRab): Promise<void> => {
    const createdAtSet = rabCreatedAtColumnCache
        ? `,
            created_at = COALESCE($33::timestamp, created_at)`
        : "";

    const values: Array<string | number | null> = [
        rab.status,
        rab.nama_pt,
        rab.link_pdf_gabungan,
        rab.link_pdf_non_sbo,
        rab.link_pdf_rekapitulasi,
        rab.link_pdf_sph,
        rab.logo,
        rab.email_pembuat,
        rab.pemberi_persetujuan_direktur,
        rab.waktu_persetujuan_direktur,
        rab.pemberi_persetujuan_koordinator,
        rab.waktu_persetujuan_koordinator,
        rab.pemberi_persetujuan_manager,
        rab.waktu_persetujuan_manager,
        rab.alasan_penolakan,
        rab.waktu_penolakan,
        rab.ditolak_oleh,
        rab.durasi_pekerjaan,
        rab.kategori_lokasi,
        rab.no_polis,
        rab.berlaku_polis,
        rab.file_asuransi,
        rab.luas_bangunan,
        rab.luas_terbangun,
        rab.luas_area_terbuka,
        rab.luas_area_parkir,
        rab.luas_area_sales,
        rab.luas_gudang,
        rab.grand_total,
        rab.grand_total_non_sbo,
        rab.grand_total_final,
        rab.link_pdf_materai
    ];

    if (rabCreatedAtColumnCache) values.push(rab.created_at);
    values.push(rabId);

    await client.query(
        `
        UPDATE rab
        SET status = COALESCE($1, status),
            nama_pt = COALESCE($2, nama_pt),
            link_pdf_gabungan = COALESCE($3, link_pdf_gabungan),
            link_pdf_non_sbo = COALESCE($4, link_pdf_non_sbo),
            link_pdf_rekapitulasi = COALESCE($5, link_pdf_rekapitulasi),
            link_pdf_sph = COALESCE($6, link_pdf_sph),
            logo = COALESCE($7, logo),
            email_pembuat = COALESCE($8, email_pembuat),
            pemberi_persetujuan_direktur = COALESCE($9, pemberi_persetujuan_direktur),
            waktu_persetujuan_direktur = COALESCE($10::timestamp, waktu_persetujuan_direktur),
            pemberi_persetujuan_koordinator = COALESCE($11, pemberi_persetujuan_koordinator),
            waktu_persetujuan_koordinator = COALESCE($12::timestamp, waktu_persetujuan_koordinator),
            pemberi_persetujuan_manager = COALESCE($13, pemberi_persetujuan_manager),
            waktu_persetujuan_manager = COALESCE($14::timestamp, waktu_persetujuan_manager),
            alasan_penolakan = COALESCE($15, alasan_penolakan),
            waktu_penolakan = COALESCE($16::timestamp, waktu_penolakan),
            ditolak_oleh = COALESCE($17, ditolak_oleh),
            durasi_pekerjaan = COALESCE($18, durasi_pekerjaan),
            kategori_lokasi = COALESCE($19, kategori_lokasi),
            no_polis = COALESCE($20, no_polis),
            berlaku_polis = COALESCE($21, berlaku_polis),
            file_asuransi = COALESCE($22, file_asuransi),
            luas_bangunan = COALESCE($23, luas_bangunan),
            luas_terbangun = COALESCE($24, luas_terbangun),
            luas_area_terbuka = COALESCE($25, luas_area_terbuka),
            luas_area_parkir = COALESCE($26, luas_area_parkir),
            luas_area_sales = COALESCE($27, luas_area_sales),
            luas_gudang = COALESCE($28, luas_gudang),
            grand_total = $29,
            grand_total_non_sbo = $30,
            grand_total_final = $31,
            link_pdf_materai = COALESCE($32, link_pdf_materai)
            ${createdAtSet}
        WHERE id = $${values.length}
        `,
        values
    );
};

const replaceItems = async (client: PoolClient, rabId: number, items: SourceRabItem[]): Promise<void> => {
    await client.query(`DELETE FROM rab_item WHERE id_rab = $1`, [rabId]);

    const chunkSize = 300;
    for (let start = 0; start < items.length; start += chunkSize) {
        const chunk = items.slice(start, start + chunkSize);
        const values: Array<string | number | null> = [];
        const placeholders: string[] = [];

        for (const item of chunk) {
            const base = values.length;
            placeholders.push(
                `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
            );
            values.push(
                rabId,
                item.kategori_pekerjaan,
                item.jenis_pekerjaan,
                item.satuan,
                item.volume,
                item.harga_material,
                item.harga_upah,
                item.total_material,
                item.total_upah,
                item.total_harga,
                item.catatan
            );
        }

        await client.query(
            `
            INSERT INTO rab_item (
                id_rab, kategori_pekerjaan, jenis_pekerjaan, satuan,
                volume, harga_material, harga_upah, total_material,
                total_upah, total_harga, catatan
            ) VALUES ${placeholders.join(", ")}
            `,
            values
        );
    }
};

const applyCandidate = async (
    client: PoolClient,
    candidate: Candidate,
    action: RabMigrationAction
): Promise<{ action: RabMigrationAction; source_rab_id: number; target_rab_id: number | null; item_count: number; status: string }> => {
    if (action === "skip") {
        return {
            action,
            source_rab_id: candidate.source_rab_id,
            target_rab_id: null,
            item_count: candidate.items.length,
            status: "skipped"
        };
    }

    if (candidate.issues.length > 0 || !candidate.toko) {
        throw new AppError(`RAB source ${candidate.source_rab_id} tidak valid: ${candidate.issues.join(", ")}`, 422);
    }

    const existing = await findExistingRab(candidate, client);
    if (existing.existing_match_count > 1) {
        throw new AppError(
            `RAB ${candidate.toko.nomor_ulok} ${candidate.toko.lingkup_pekerjaan ?? ""} ambigu: ada ${existing.existing_match_count} toko cocok di database.`,
            409
        );
    }

    if (action === "insert" && existing.existing_rab_id) {
        throw new AppError(`RAB ${candidate.toko.nomor_ulok} ${candidate.toko.lingkup_pekerjaan ?? ""} sudah ada. Pilih replace atau skip.`, 409);
    }

    if (action !== "insert" && !existing.existing_rab_id) {
        throw new AppError(`RAB existing untuk source ${candidate.source_rab_id} tidak ditemukan. Gunakan insert.`, 404);
    }

    if (action === "update_created_at") {
        if (!rabCreatedAtColumnCache) {
            throw new AppError("Kolom rab.created_at belum tersedia. Jalankan migration add-rab-created-at terlebih dahulu.", 409);
        }
        if (!candidate.rab.created_at) {
            throw new AppError(`RAB source ${candidate.source_rab_id} tidak memiliki created_at di Excel`, 422);
        }

        const rabId = existing.existing_rab_id!;
        await client.query(
            `UPDATE rab SET created_at = $1::timestamp WHERE id = $2`,
            [candidate.rab.created_at, rabId]
        );

        return {
            action,
            source_rab_id: candidate.source_rab_id,
            target_rab_id: rabId,
            item_count: 0,
            status: "updated_created_at"
        };
    }

    if (action === "insert") {
        const tokoId = await insertOrUpdateToko(client, candidate.toko, existing.existing_toko_id, false);
        const rabId = await insertRab(client, tokoId, candidate.rab);
        await replaceItems(client, rabId, candidate.items);
        return {
            action,
            source_rab_id: candidate.source_rab_id,
            target_rab_id: rabId,
            item_count: candidate.items.length,
            status: "inserted"
        };
    }

    const rabId = existing.existing_rab_id!;
    if (action === "replace_toko_rab_items") {
        await insertOrUpdateToko(client, candidate.toko, existing.existing_toko_id, true);
        await updateRab(client, rabId, candidate.rab);
    } else if (action === "replace_rab_items") {
        await updateRab(client, rabId, candidate.rab);
    }

    await replaceItems(client, rabId, candidate.items);
    return {
        action,
        source_rab_id: candidate.source_rab_id,
        target_rab_id: rabId,
        item_count: candidate.items.length,
        status: "replaced"
    };
};

export const rabMigrationService = {
    async preview(buffer: Buffer, actorRole: string, materaiBuffer?: Buffer) {
        if (!hasSuperHumanRole(actorRole)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi RAB", 403);
        }

        const parsed = await parseWorkbook(buffer, materaiBuffer);
        const candidates = parsed.candidates;
        const existingByKey = await findExistingRabs(candidates);
        const details = [];
        let readyCount = 0;
        let conflictCount = 0;
        let missingCreatedAtCount = 0;
        let invalidCount = 0;
        let totalItems = 0;

        for (const candidate of candidates) {
            totalItems += candidate.items.length;
            const existing = candidate.toko
                ? existingByKey.get(existingKey(candidate.toko.nomor_ulok, candidate.toko.lingkup_pekerjaan))
                    ?? { existing_toko_id: null, existing_rab_id: null, existing_created_at: null, existing_item_count: 0, existing_match_count: 0 }
                : { existing_toko_id: null, existing_rab_id: null, existing_created_at: null, existing_item_count: 0, existing_match_count: 0 };
            const rowIssues = [...candidate.issues];
            if (existing.existing_match_count > 1) {
                rowIssues.push(`Ambigu di DB: ada ${existing.existing_match_count} toko dengan ULOK dan lingkup yang sama`);
            }
            const state = rowIssues.length > 0
                ? "invalid"
                : existing.existing_rab_id
                    ? existing.existing_created_at
                        ? "conflict"
                        : "missing_created_at"
                    : "ready";

            if (state === "ready") readyCount += 1;
            if (state === "conflict") conflictCount += 1;
            if (state === "missing_created_at") missingCreatedAtCount += 1;
            if (state === "invalid") invalidCount += 1;

            details.push({
                source_rab_id: candidate.source_rab_id,
                source_toko_id: candidate.source_toko_id,
                nomor_ulok: candidate.toko?.nomor_ulok ?? "",
                lingkup_pekerjaan: candidate.toko?.lingkup_pekerjaan ?? "",
                nama_toko: candidate.toko?.nama_toko ?? "",
                cabang: candidate.toko?.cabang ?? "",
                status_rab: candidate.rab.status ?? "",
                item_count: candidate.items.length,
                grand_total: candidate.rab.grand_total ?? "0",
                db_state: state,
                existing_toko_id: existing.existing_toko_id,
                existing_rab_id: existing.existing_rab_id,
                existing_created_at: existing.existing_created_at,
                existing_item_count: existing.existing_item_count,
                existing_match_count: existing.existing_match_count,
                has_materai_pdf: Boolean(candidate.rab.link_pdf_materai),
                duplicate_group_key: candidate.duplicate_group_key,
                duplicate_count: candidate.duplicate_count,
                duplicate_recommended: candidate.duplicate_recommended,
                issues: rowIssues,
                warnings: candidate.warnings
            });
        }

        return {
            total_rab: candidates.length,
            total_items: totalItems,
            ready_count: readyCount,
            conflict_count: conflictCount,
            missing_created_at_count: missingCreatedAtCount,
            invalid_count: invalidCount,
            materai_count: parsed.materai_count,
            materai_ambiguous_count: parsed.materai_ambiguous_count,
            source_format: parsed.source_format,
            ignored_sheets: parsed.ignored_sheets,
            details
        };
    },

    async commit(buffer: Buffer, input: RabMigrationCommitInput, materaiBuffer?: Buffer) {
        if (!hasSuperHumanRole(input.actor_role)) {
            throw new AppError("Hanya Super Human yang dapat melakukan migrasi RAB", 403);
        }

        const parsed = await parseWorkbook(buffer, materaiBuffer);
        const candidates = parsed.candidates;
        const candidateBySourceId = new Map(candidates.map((candidate) => [candidate.source_rab_id, candidate]));
        const selectedDuplicateGroups = new Map<string, number[]>();
        for (const selection of input.selections) {
            if (selection.action === "skip") continue;
            const candidate = candidateBySourceId.get(selection.source_rab_id);
            if (!candidate?.duplicate_group_key) continue;
            selectedDuplicateGroups.set(candidate.duplicate_group_key, [
                ...(selectedDuplicateGroups.get(candidate.duplicate_group_key) ?? []),
                candidate.source_rab_id
            ]);
        }
        for (const sourceIds of selectedDuplicateGroups.values()) {
            if (sourceIds.length > 1) {
                throw new AppError(
                    `Pilih hanya satu RAB dari grup duplicate. Source terpilih bersamaan: ${sourceIds.join(", ")}`,
                    409
                );
            }
        }
        const selected = input.selections.filter((selection) => selection.action !== "skip");

        const results = await withTransaction(async (client) => {
            const rowResults = [];
            for (const selection of input.selections) {
                const candidate = candidateBySourceId.get(selection.source_rab_id);
                if (!candidate) {
                    throw new AppError(`source_rab_id ${selection.source_rab_id} tidak ditemukan di file`, 404);
                }
                rowResults.push(await applyCandidate(client, candidate, selection.action));
            }

            await activityLogRepository.insert({
                entity_type: "RAB",
                entity_id: 0,
                actor_email: input.actor_email ?? null,
                actor_role: input.actor_role,
                action: "SUPER_HUMAN_MIGRATION",
                status_before: null,
                status_after: "MIGRATION_COMMITTED",
                reason: "Migrasi RAB dari file Excel",
                metadata: {
                    source_format: parsed.source_format,
                    materai_count: parsed.materai_count,
                    materai_ambiguous_count: parsed.materai_ambiguous_count,
                    total_selected: input.selections.length,
                    total_executed: selected.length,
                    source_rab_ids: input.selections.map((selection) => selection.source_rab_id)
                }
            }, client);

            return rowResults;
        });

        const inserted = results.filter((row) => row.status === "inserted").length;
        const replaced = results.filter((row) => row.status === "replaced").length;
        const updatedCreatedAt = results.filter((row) => row.status === "updated_created_at").length;
        const skipped = results.filter((row) => row.status === "skipped").length;
        const itemCount = results.reduce((sum, row) => sum + row.item_count, 0);

        return {
            total_selected: input.selections.length,
            inserted,
            replaced,
            updated_created_at: updatedCreatedAt,
            skipped,
            migrated_items: itemCount,
            details: results
        };
    }
};
