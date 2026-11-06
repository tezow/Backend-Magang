import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import { activityLogRepository } from "../activity-log/activity-log.repository";
import * as XLSX from "xlsx";
import {
    penyimpananDokumenRepository,
    type PenyimpananDokumenMigrationItem,
    type PenyimpananDokumenMigrationStoreItem,
    type PenyimpananDokumenRow,
    type TokoRow
} from "./document.repository";
import type {
    PenyimpananDokumenArchiveStoreCreateInput,
    PenyimpananDokumenCreateInput,
    PenyimpananDokumenListQueryInput,
    PenyimpananDokumenUpdateInput
} from "./document.schema";

export type UploadedDokumenFile = Express.Multer.File;

type DokumenItemFile = {
    file: UploadedDokumenFile;
    itemIndex: number;
};

type MigrationParseResult = {
    totalRows: number;
    rowsWithFiles: number;
    emptyFileRows: number;
    parsedDocuments: number;
    unparsedRows: Array<{ rowNumber: number; kode_toko: string | null; reason: string }>;
    categoryCounts: Record<string, number>;
    sourceCategoryCounts: Record<string, number>;
    sample: PenyimpananDokumenMigrationItem[];
    storeSample: PenyimpananDokumenMigrationStoreItem[];
    items: PenyimpananDokumenMigrationItem[];
    stores: PenyimpananDokumenMigrationStoreItem[];
};

const MAX_UPLOAD_CONCURRENCY = 3;
const RESUMABLE_THRESHOLD_BYTES = 10 * 1024 * 1024;

const runWithConcurrency = async <T, R>(
    items: T[],
    limit: number,
    handler: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(limit, 1), items.length);

    const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
            const current = nextIndex;
            nextIndex += 1;
            if (current >= items.length) return;
            results[current] = await handler(items[current], current);
        }
    });

    await Promise.all(workers);
    return results;
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedDokumenFile): string => {
    const rawName = file.originalname ?? "";
    const lastDot = rawName.lastIndexOf(".");
    if (lastDot > 0 && lastDot < rawName.length - 1) {
        const ext = rawName.slice(lastDot).toLowerCase();
        if (/^\.[a-z0-9]{1,10}$/.test(ext)) return ext;
    }

    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "application/msword") return ".doc";
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
    if (file.mimetype === "application/vnd.ms-excel") return ".xls";
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    if (file.mimetype === "image/webp") return ".webp";
    return ".bin";
};

const resolveDriveLink = (fileId?: string | null, webViewLink?: string | null): string => {
    if (webViewLink) return webViewLink;
    if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
    return "";
};

const extractDriveFileId = (link?: string | null): string | null => {
    if (!link) return null;

    const idFromFile = /\/file\/d\/([^/]+)/.exec(link)?.[1];
    if (idFromFile) return idFromFile;

    const idFromUc = /[?&]id=([^&]+)/.exec(link)?.[1];
    if (idFromUc) return idFromUc;

    return null;
};

const extractDriveFolderId = (link?: string | null): string | null => {
    if (!link) return null;
    const folderId = /\/folders\/([^/?#]+)/.exec(link)?.[1];
    if (folderId) return folderId;
    return /[?&]id=([^&]+)/.exec(link)?.[1] ?? null;
};

const normalizeCell = (value: unknown): string => String(value ?? "").trim();

const parseExcelDate = (value: unknown): Date | null => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return null;
        return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)));
    }

    const text = normalizeCell(value);
    if (!text) return null;
    const normalized = text.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
};

const CATEGORY_ALIASES: Record<string, string> = {
    fotoAsal: "fotoExisting",
    fotoExisting: "fotoExisting",
    fotoRenovasi: "fotoRenovasi",
    me: "me",
    sipil: "sipil",
    sketsaAwal: "sketsaAwal",
    spk: "spk",
    rab: "rab",
    pendukung: "pendukung",
    instruksiLapangan: "instruksiLapangan",
    pengawasan: "pengawasan",
    aanwijzing: "aanwijzing",
    kerjaTambahKurang: "kerjaTambahKurang"
};

const parseFileLinks = (fileLinks: string) => {
    const categories = Object.keys(CATEGORY_ALIASES).sort((a, b) => b.length - a.length);
    const escaped = categories.map((category) => category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${escaped})\\|([\\s\\S]*?)\\|(https?:\\/\\/[\\s\\S]*?)(?=,\\s*(?:${escaped})\\||$)`, "g");
    const items: Array<{ sourceCategory: string; kategori: string; nama: string; link: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fileLinks)) !== null) {
        const sourceCategory = match[1];
        const nama = normalizeCell(match[2]).replace(/\s+/g, " ");
        const link = normalizeCell(match[3]).replace(/,$/, "");
        if (!nama || !link) continue;
        items.push({
            sourceCategory,
            kategori: CATEGORY_ALIASES[sourceCategory] ?? sourceCategory,
            nama,
            link
        });
    }

    return items;
};

const parseMigrationWorkbook = (file: UploadedDokumenFile): MigrationParseResult => {
    if (!file?.buffer?.length) {
        throw new AppError("File Excel wajib diupload", 400);
    }

    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "penyimpanan_dokumen") ?? workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        throw new AppError("Sheet Excel tidak ditemukan", 400);
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true });
    const headers = (rows[0] ?? []).map((header) => normalizeCell(header).toLowerCase());
    const indexOf = (name: string) => headers.indexOf(name);
    const requiredColumns = ["kode_toko", "nama_toko", "cabang", "folder_link", "file_links"];
    const missingColumns = requiredColumns.filter((column) => indexOf(column) === -1);
    if (missingColumns.length > 0) {
        throw new AppError(`Kolom Excel tidak lengkap: ${missingColumns.join(", ")}`, 400);
    }

    const indexes = {
        kodeToko: indexOf("kode_toko"),
        namaToko: indexOf("nama_toko"),
        cabang: indexOf("cabang"),
        folderLink: indexOf("folder_link"),
        fileLinks: indexOf("file_links"),
        timestamp: indexOf("timestamp"),
        lastEdit: indexOf("last_edit")
    };

    const result: MigrationParseResult = {
        totalRows: Math.max(rows.length - 1, 0),
        rowsWithFiles: 0,
        emptyFileRows: 0,
        parsedDocuments: 0,
        unparsedRows: [],
        categoryCounts: {},
        sourceCategoryCounts: {},
        sample: [],
        storeSample: [],
        items: [],
        stores: []
    };

    for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i] ?? [];
        const fileLinks = normalizeCell(row[indexes.fileLinks]);
        const kodeToko = normalizeCell(row[indexes.kodeToko]) || null;
        const namaToko = normalizeCell(row[indexes.namaToko]) || null;
        const cabang = normalizeCell(row[indexes.cabang]) || null;
        const folderLink = normalizeCell(row[indexes.folderLink]) || null;
        const sourceTimestamp = indexes.timestamp >= 0 ? parseExcelDate(row[indexes.timestamp]) : null;
        const sourceLastEdit = indexes.lastEdit >= 0 ? parseExcelDate(row[indexes.lastEdit]) : null;

        if (kodeToko || namaToko || cabang) {
            result.stores.push({
                kode_toko: kodeToko,
                nama_toko: namaToko,
                cabang,
                folder_link: folderLink,
                source_timestamp: sourceTimestamp,
                source_last_edit: sourceLastEdit
            });
        }

        if (!fileLinks) {
            result.emptyFileRows += 1;
            continue;
        }

        result.rowsWithFiles += 1;
        const parsedLinks = parseFileLinks(fileLinks);
        if (parsedLinks.length === 0) {
            result.unparsedRows.push({ rowNumber: i + 1, kode_toko: kodeToko, reason: "file_links tidak cocok format kategori|nama|link" });
            continue;
        }

        for (const parsed of parsedLinks) {
            const item: PenyimpananDokumenMigrationItem = {
                kode_toko: kodeToko,
                nama_toko: namaToko,
                cabang,
                kategori_dokumen: parsed.kategori,
                nama_dokumen: parsed.nama,
                drive_file_id: extractDriveFileId(parsed.link),
                drive_folder_id: extractDriveFolderId(folderLink),
                link_dokumen: parsed.link,
                link_folder: folderLink,
                source_timestamp: sourceTimestamp,
                source_last_edit: sourceLastEdit
            };
            result.items.push(item);
            result.parsedDocuments += 1;
            result.categoryCounts[item.kategori_dokumen] = (result.categoryCounts[item.kategori_dokumen] ?? 0) + 1;
            result.sourceCategoryCounts[parsed.sourceCategory] = (result.sourceCategoryCounts[parsed.sourceCategory] ?? 0) + 1;
        }
    }

    result.sample = result.items.slice(0, 20);
    result.storeSample = result.stores.slice(0, 20);
    return result;
};

const ensureSuperHuman = (role: string) => {
    if (!role.toUpperCase().includes("BUILDING & MAINTENANCE SUPER HUMAN")) {
        throw new AppError("Hanya Super Human yang dapat melakukan migrasi dokumen", 403);
    }
};

const splitDokumenFiles = (files: UploadedDokumenFile[]) => {
    const itemFiles: DokumenItemFile[] = [];
    const bulkFiles: UploadedDokumenFile[] = [];
    const seenIndexes = new Set<number>();
    const itemRegex = /^dokumen_(\d+)$/i;

    for (const file of files) {
        const field = file.fieldname ?? "";
        const match = itemRegex.exec(field);
        if (match) {
            const index = Number(match[1]);
            if (Number.isFinite(index) && index > 0 && !seenIndexes.has(index)) {
                itemFiles.push({ file, itemIndex: index });
                seenIndexes.add(index);
            }
            continue;
        }

        if (field === "dokumen") {
            bulkFiles.push(file);
        }
    }

    return { itemFiles, bulkFiles };
};

const resolveFolderName = (
    toko: TokoRow | null,
    input: Pick<PenyimpananDokumenCreateInput, "id_toko" | "kode_toko" | "nama_toko" | "cabang" | "folder_name">,
    override?: string
): string => {
    if (override && override.trim()) {
        return sanitizeFilenamePart(override, `TOKO_${input.id_toko ?? input.kode_toko ?? "DOKUMEN"}`);
    }

    const namaToko = sanitizeFilenamePart(input.nama_toko ?? toko?.nama_toko ?? undefined, "TOKO");
    const cabang = sanitizeFilenamePart(input.cabang ?? toko?.cabang ?? undefined, "CABANG");
    const kode = sanitizeFilenamePart(input.kode_toko ?? toko?.kode_toko ?? input.id_toko?.toString(), "DOKUMEN");
    return `${namaToko}_${cabang}_${kode}`;
};

const ensureDocDriveReady = () => {
    const root = env.DOC_DRIVE_ROOT_ID;
    if (!root) {
        throw new AppError("DOC_DRIVE_ROOT_ID belum diset", 500);
    }

    return { gp: GoogleProvider.instance, root };
};

const resolveFolderId = async (
    toko: TokoRow | null,
    input: Pick<PenyimpananDokumenCreateInput, "id_toko" | "kode_toko" | "nama_toko" | "cabang" | "folder_name">,
    folderName?: string
): Promise<string> => {
    const gp = GoogleProvider.instance;
    let nomorUlok = null;
    let kodeToko = input.kode_toko ?? toko?.kode_toko ?? null;
    let namaToko = input.nama_toko ?? toko?.nama_toko ?? null;
    let cabang = input.cabang ?? toko?.cabang ?? null;

    const { pool } = await import("../../db/pool");

    if (kodeToko) {
        const ulokQuery = await pool.query(
            `SELECT nomor_ulok, nama_toko, cabang FROM toko WHERE kode_toko = $1 LIMIT 1`,
            [kodeToko]
        );
        if (ulokQuery.rows.length > 0) {
            nomorUlok = ulokQuery.rows[0].nomor_ulok;
            if (!namaToko) namaToko = ulokQuery.rows[0].nama_toko;
            if (!cabang) cabang = ulokQuery.rows[0].cabang;
        }
    } else if (input.id_toko || toko?.id) {
        const id = input.id_toko || toko?.id;
        const tokoQuery = await pool.query(
            `SELECT nomor_ulok, nama_toko, kode_toko, cabang FROM toko WHERE id = $1 LIMIT 1`,
            [id]
        );
        if (tokoQuery.rows.length > 0) {
            nomorUlok = tokoQuery.rows[0].nomor_ulok;
            namaToko = tokoQuery.rows[0].nama_toko;
            kodeToko = tokoQuery.rows[0].kode_toko;
            cabang = tokoQuery.rows[0].cabang;
        }
    }

    const processName = folderName || input.folder_name || "Penyimpanan Dokumen Toko";
    return gp.getOrCreateProcessFolder(processName, nomorUlok, namaToko, kodeToko, cabang);
};

const buildFolderLink = (folderId: string) => `https://drive.google.com/drive/folders/${folderId}`;

const uploadDokumenFiles = async (
    input: PenyimpananDokumenCreateInput,
    files: UploadedDokumenFile[],
    folderId: string
): Promise<Array<{ link: string; driveFileId?: string }>> => {
    if (files.length === 0) return [];

    const { gp } = ensureDocDriveReady();
    const items: Array<{ link: string; driveFileId?: string }> = [];
    const safeNama = sanitizeFilenamePart(input.nama_dokumen, "DOKUMEN");
    const safeOwner = sanitizeFilenamePart(input.kode_toko ?? input.id_toko?.toString(), "TOKO");
    const batchTimestamp = Date.now();

    const results = await runWithConcurrency(files, MAX_UPLOAD_CONCURRENCY, async (file, index) => {
        const ext = resolveFileExtension(file);
        const filename = `${safeNama}_${safeOwner}_${batchTimestamp}_${index + 1}${ext}`;
        const mimeType = file.mimetype || "application/octet-stream";
        const useResumable = (file.size ?? 0) >= RESUMABLE_THRESHOLD_BYTES;
        const uploaded = useResumable
            ? await gp.uploadFileResumable(folderId, filename, mimeType, file.buffer)
            : await gp.uploadFile(folderId, filename, mimeType, file.buffer);

        const link = resolveDriveLink(uploaded.id ?? null, uploaded.webViewLink ?? null);
        return link ? { link, driveFileId: uploaded.id ?? undefined } : null;
    });

    for (const result of results) {
        if (result) items.push(result);
    }

    return items;
};

const resolveUploadFiles = (files: UploadedDokumenFile[]) => {
    const { itemFiles, bulkFiles } = splitDokumenFiles(files);
    if (itemFiles.length > 0) {
        return itemFiles.sort((a, b) => a.itemIndex - b.itemIndex).map((item) => item.file);
    }

    if (bulkFiles.length > 0) {
        return bulkFiles;
    }

    return files;
};

const resolveFolderIdForUpdate = async (row: PenyimpananDokumenRow, folderName?: string): Promise<{ id: string; link: string }> => {
    const existingFolderId = row.drive_folder_id;
    if (existingFolderId) {
        return { id: existingFolderId, link: row.link_folder ?? buildFolderLink(existingFolderId) };
    }

    const toko = row.id_toko ? await penyimpananDokumenRepository.findTokoById(row.id_toko) : null;
    const folderId = await resolveFolderId(toko, {
        id_toko: row.id_toko ?? undefined,
        kode_toko: row.kode_toko ?? undefined,
        nama_toko: row.nama_toko ?? undefined,
        cabang: row.cabang ?? undefined
    }, folderName);
    return { id: folderId, link: buildFolderLink(folderId) };
};

export const penyimpananDokumenService = {
    async create(input: PenyimpananDokumenCreateInput, files: UploadedDokumenFile[]) {
        let toko: TokoRow | null = null;
        let payload: PenyimpananDokumenCreateInput = { ...input };

        if (input.id_toko) {
            toko = await penyimpananDokumenRepository.findTokoById(input.id_toko);
            if (!toko) {
                throw new AppError("Toko tidak ditemukan", 404);
            }

            payload = {
                ...payload,
                kode_toko: payload.kode_toko ?? toko.kode_toko ?? undefined,
                nama_toko: payload.nama_toko ?? toko.nama_toko ?? undefined,
                cabang: payload.cabang ?? toko.cabang ?? undefined
            };
        } else {
            if (!input.kode_toko || !input.nama_toko || !input.cabang) {
                throw new AppError("kode_toko, nama_toko, dan cabang wajib diisi", 400);
            }
            await penyimpananDokumenRepository.upsertArchiveStore({
                kode_toko: input.kode_toko,
                nama_toko: input.nama_toko,
                cabang: input.cabang
            });
        }

        const uploadFiles = resolveUploadFiles(files);
        if (uploadFiles.length === 0) {
            throw new AppError("Dokumen wajib diupload", 400);
        }

        const folderId = await resolveFolderId(toko, payload, payload.folder_name);
        const folderLink = buildFolderLink(folderId);

        const items = await uploadDokumenFiles(payload, uploadFiles, folderId);
        const rows = await penyimpananDokumenRepository.createBulk(
            payload,
            folderLink,
            folderId,
            items
        );

        return {
            folder: {
                id: folderId,
                link: folderLink
            },
            items: rows
        };
    },

    async list(query: PenyimpananDokumenListQueryInput) {
        return penyimpananDokumenRepository.list(query);
    },

    async listArchiveStores(search?: string) {
        return penyimpananDokumenRepository.listArchiveStores(search);
    },

    async createArchiveStore(input: PenyimpananDokumenArchiveStoreCreateInput) {
        return penyimpananDokumenRepository.upsertArchiveStore(input);
    },

    async previewMigration(actorRole: string, files: UploadedDokumenFile[]) {
        ensureSuperHuman(actorRole);
        const parsed = parseMigrationWorkbook(files[0]);
        const { items: _items, stores: _stores, ...summary } = parsed;
        return {
            ...summary,
            parsedStores: parsed.stores.length
        };
    },

    async commitMigration(actorRole: string, files: UploadedDokumenFile[], actorEmail?: string) {
        ensureSuperHuman(actorRole);
        const parsed = parseMigrationWorkbook(files[0]);
        const storeResult = await penyimpananDokumenRepository.insertMigratedStores(parsed.stores);
        const result = await penyimpananDokumenRepository.insertMigratedDocuments(parsed.items);
        await activityLogRepository.insert({
            entity_type: "PENYIMPANAN_DOKUMEN",
            entity_id: 0,
            actor_email: actorEmail ?? null,
            actor_role: actorRole,
            action: "SUPER_HUMAN_MIGRATION",
            status_before: null,
            status_after: "MIGRATION_COMMITTED",
            reason: "Migrasi penyimpanan dokumen dari file Excel",
            metadata: {
                total_rows: parsed.totalRows,
                rows_with_files: parsed.rowsWithFiles,
                parsed_stores: parsed.stores.length,
                parsed_documents: parsed.parsedDocuments,
                inserted_stores: storeResult.inserted,
                skipped_store_duplicates: parsed.stores.length - storeResult.inserted,
                inserted_documents: result.inserted,
                skipped_document_duplicates: parsed.parsedDocuments - result.inserted
            }
        });

        return {
            totalRows: parsed.totalRows,
            rowsWithFiles: parsed.rowsWithFiles,
            emptyFileRows: parsed.emptyFileRows,
            parsedStores: parsed.stores.length,
            parsedDocuments: parsed.parsedDocuments,
            insertedStores: storeResult.inserted,
            skippedStoreDuplicates: parsed.stores.length - storeResult.inserted,
            inserted: result.inserted,
            skippedDuplicates: parsed.parsedDocuments - result.inserted,
            unparsedRows: parsed.unparsedRows,
            categoryCounts: parsed.categoryCounts,
            sourceCategoryCounts: parsed.sourceCategoryCounts,
            sample: parsed.sample,
            storeSample: parsed.storeSample
        };
    },

    async getDetail(id: number): Promise<PenyimpananDokumenRow> {
        const row = await penyimpananDokumenRepository.findById(id);
        if (!row) {
            throw new AppError("Dokumen tidak ditemukan", 404);
        }

        return row;
    },

    async update(id: number, input: PenyimpananDokumenUpdateInput, files: UploadedDokumenFile[]) {
        const existing = await penyimpananDokumenRepository.findById(id);
        if (!existing) {
            throw new AppError("Dokumen tidak ditemukan", 404);
        }

        let linkDokumen: string | undefined;
        let linkFolder: string | null | undefined;
        let driveFileId: string | null | undefined;
        let driveFolderId: string | null | undefined;

        if (files.length > 0) {
            const uploadFile = resolveUploadFiles(files)[0];
            const folderInfo = await resolveFolderIdForUpdate(existing, undefined);
            const safeNama = sanitizeFilenamePart(input.nama_dokumen ?? existing.nama_dokumen, "DOKUMEN");
            const safeOwner = sanitizeFilenamePart(existing.kode_toko ?? existing.id_toko?.toString(), "TOKO");
            const ext = resolveFileExtension(uploadFile);
            const filename = `${safeNama}_${safeOwner}_${Date.now()}${ext}`;

            const { gp } = ensureDocDriveReady();
            const mimeType = uploadFile.mimetype || "application/octet-stream";
            const useResumable = (uploadFile.size ?? 0) >= RESUMABLE_THRESHOLD_BYTES;
            const uploaded = useResumable
                ? await gp.uploadFileResumable(folderInfo.id, filename, mimeType, uploadFile.buffer)
                : await gp.uploadFile(folderInfo.id, filename, mimeType, uploadFile.buffer);

            linkDokumen = resolveDriveLink(uploaded.id ?? null, uploaded.webViewLink ?? null);
            linkFolder = folderInfo.link;
            driveFileId = uploaded.id ?? null;
            driveFolderId = folderInfo.id;
        }

        const updated = await penyimpananDokumenRepository.update(id, {
            ...input,
            link_dokumen: linkDokumen,
            link_folder: linkFolder,
            drive_file_id: driveFileId,
            drive_folder_id: driveFolderId
        });

        if (!updated) {
            throw new AppError("Dokumen tidak ditemukan", 404);
        }

        return updated;
    },

    async delete(id: number) {
        const existing = await penyimpananDokumenRepository.delete(id);
        if (!existing) {
            throw new AppError("Dokumen tidak ditemukan", 404);
        }

        const fileId = existing.drive_file_id ?? extractDriveFileId(existing.link_dokumen);
        if (fileId) {
            try {
                const { gp } = ensureDocDriveReady();
                await gp.deleteDriveFile(fileId);
            } catch (_) {
                // ignore delete errors
            }
        }

        return existing;
    }
};
