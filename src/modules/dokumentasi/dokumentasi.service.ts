import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import { buildDokumentasiBangunanPdfBuffer } from "./dokumentasi.pdf";
import {
    dokumentasiBangunanRepository,
    type DokumentasiBangunanDetail,
    type DokumentasiBangunanItemRow,
    type DokumentasiBangunanRow
} from "./dokumentasi.repository";
import type {
    DokumentasiBangunanCreateInput,
    DokumentasiBangunanListQueryInput,
    DokumentasiBangunanPrefillQueryInput,
    DokumentasiBangunanUpdateInput
} from "./dokumentasi.schema";

export type UploadedDokumentasiFile = Express.Multer.File;
type DokumentasiItemFile = {
    file: UploadedDokumentasiFile;
    itemIndex: number;
};

type SudutFotoItemInput = string | { item_index?: number; sudut_foto: string };

type DokumentasiBangunanPrefillOption = {
    nomor_ulok: string;
    cabang: string;
    kode_toko: string;
    nama_toko: string;
    kontraktor: string;
    kontraktor_sipil: string;
    kontraktor_me: string;
    spk_awal: string;
    spk_akhir: string;
    tanggal_serah_terima: string;
    tanggal_serah_terima_source: "SERAH_TERIMA" | "NEEDS_ST";
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedDokumentasiFile): string => {
    const rawName = file.originalname ?? "";
    const lastDot = rawName.lastIndexOf(".");
    if (lastDot > 0 && lastDot < rawName.length - 1) {
        const ext = rawName.slice(lastDot).toLowerCase();
        if (/^\.[a-z0-9]{1,10}$/.test(ext)) return ext;
    }

    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    if (file.mimetype === "image/webp") return ".webp";
    return ".bin";
};

const resolveDriveLink = (fileId?: string, webViewLink?: string | null): string => {
    if (webViewLink) {
        const fid = webViewLink.split("/d/")[1]?.split("/")[0] ?? "";
        if (fid) {
            return `https://drive.google.com/uc?export=view&id=${fid}`;
        }
        return webViewLink;
    }

    if (fileId) {
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }

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

const firstText = (...values: Array<string | null | undefined>): string => {
    for (const value of values) {
        const trimmed = (value ?? "").trim();
        if (trimmed) return trimmed;
    }
    return "";
};

const dateOnly = (value?: string | null): string => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return "";

    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)?.[1];
    if (iso) return iso;

    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmy) {
        const day = dmy[1].padStart(2, "0");
        const month = dmy[2].padStart(2, "0");
        return `${dmy[3]}-${month}-${day}`;
    }

    return "";
};

const minDate = (current: string, candidate: string): string => {
    if (!candidate) return current;
    if (!current) return candidate;
    return candidate < current ? candidate : current;
};

const maxDate = (current: string, candidate: string): string => {
    if (!candidate) return current;
    if (!current) return candidate;
    return candidate > current ? candidate : current;
};

const isMeScope = (value?: string | null): boolean => {
    const normalized = (value ?? "").toUpperCase();
    return normalized.includes("ME") || normalized.includes("MEKANIKAL") || normalized.includes("ELEKTRIKAL");
};

const resolveDokumentasiFolderId = async (row: DokumentasiBangunanRow): Promise<string> => {
    const gp = GoogleProvider.instance;
    return gp.getOrCreateProcessFolder("Dokumentasi Bangunan Toko Baru", row.nomor_ulok ?? null, row.nama_toko ?? null, row.kode_toko ?? null);
};

const uploadFotoItemsBulk = async (
    dokumentasi: DokumentasiBangunanRow,
    files: UploadedDokumentasiFile[],
    sudutFotoItems: string[]
): Promise<DokumentasiBangunanItemRow[]> => {
    if (files.length === 0) return [];

    const gp = GoogleProvider.instance;
    const folderId = await resolveDokumentasiFolderId(dokumentasi);
    const items: { link_foto: string; sudut_foto?: string | null; item_index?: number | null }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeKode = sanitizeFilenamePart(dokumentasi.kode_toko ?? undefined, "TOKO");
        const ext = resolveFileExtension(file);
        const filename = `FOTO_${safeKode}_${dokumentasi.id}_${Date.now()}_${i + 1}${ext}`;

        const uploaded = await gp.uploadFile(
            folderId,
            filename,
            file.mimetype || "application/octet-stream",
            file.buffer
        );

        const link = resolveDriveLink(uploaded.id, uploaded.webViewLink ?? null);
        if (link) {
            items.push({
                link_foto: link,
                sudut_foto: sudutFotoItems[i] ?? null,
                item_index: i + 1
            });
        }
    }

    return dokumentasiBangunanRepository.createItemsBulk(dokumentasi.id, items);
};

const uploadFotoItemsByIndex = async (
    dokumentasi: DokumentasiBangunanRow,
    itemFiles: DokumentasiItemFile[],
    sudutFotoByIndex: Map<number, string>,
    sudutFotoFallback: string[]
): Promise<DokumentasiBangunanItemRow[]> => {
    if (itemFiles.length === 0) return [];

    const gp = GoogleProvider.instance;
    const folderId = await resolveDokumentasiFolderId(dokumentasi);
    const items: { link_foto: string; sudut_foto?: string | null; item_index?: number | null }[] = [];
    const safeKode = sanitizeFilenamePart(dokumentasi.kode_toko ?? undefined, "TOKO");

    const ordered = [...itemFiles].sort((a, b) => a.itemIndex - b.itemIndex);
    for (let index = 0; index < ordered.length; index += 1) {
        const entry = ordered[index];
        const ext = resolveFileExtension(entry.file);
        const filename = `FOTO_ITEM_${safeKode}_${dokumentasi.id}_${entry.itemIndex}${ext}`;

        const uploaded = await gp.uploadFile(
            folderId,
            filename,
            entry.file.mimetype || "application/octet-stream",
            entry.file.buffer
        );

        const link = resolveDriveLink(uploaded.id, uploaded.webViewLink ?? null);
        if (link) {
            const sudutFoto = sudutFotoByIndex.get(entry.itemIndex) ?? sudutFotoFallback[index] ?? null;
            items.push({
                link_foto: link,
                sudut_foto: sudutFoto,
                item_index: entry.itemIndex
            });
        }
    }

    return dokumentasiBangunanRepository.createItemsBulk(dokumentasi.id, items);
};

const splitSudutFotoItems = (items?: SudutFotoItemInput[]) => {
    const sudutFotoByIndex = new Map<number, string>();
    const sudutFotoFallback: string[] = [];

    if (!items) return { sudutFotoByIndex, sudutFotoFallback };

    for (const entry of items) {
        if (typeof entry === "string") {
            sudutFotoFallback.push(entry);
            continue;
        }

        if (entry?.sudut_foto) {
            if (entry.item_index) {
                sudutFotoByIndex.set(entry.item_index, entry.sudut_foto);
            } else {
                sudutFotoFallback.push(entry.sudut_foto);
            }
        }
    }

    return { sudutFotoByIndex, sudutFotoFallback };
};

const splitItemFiles = (files: UploadedDokumentasiFile[]) => {
    const itemFiles: DokumentasiItemFile[] = [];
    const bulkFiles: UploadedDokumentasiFile[] = [];
    const seenIndexes = new Set<number>();
    const itemRegex = /^foto_items_(\d+)$/i;

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

        if (field === "foto") {
            bulkFiles.push(file);
        }
    }

    return { itemFiles, bulkFiles };
};

const uploadPdfToDrive = async (folderId: string, buffer: Buffer, filename: string): Promise<string> => {
    const gp = GoogleProvider.instance;
    const uploaded = await gp.uploadFile(folderId, filename, "application/pdf", buffer);
    return uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`;
};

export const dokumentasiBangunanService = {
    async create(input: DokumentasiBangunanCreateInput, files: UploadedDokumentasiFile[]) {
        const { sudut_foto_items, ...payload } = input as DokumentasiBangunanCreateInput;

        if (payload.nomor_ulok) {
            const existing = await dokumentasiBangunanRepository.findByUlok(payload.nomor_ulok);
            if (existing) {
                throw new AppError("Dokumentasi bangunan untuk ULOK ini sudah diinput sebelumnya", 400);
            }
        }

        // Initially set status to processing
        payload.status_validasi = "processing";
        const dokumentasi = await dokumentasiBangunanRepository.create(payload);

        // Process file uploads and PDF generation in the background to avoid proxy timeout
        setImmediate(async () => {
            try {
                const { sudutFotoByIndex, sudutFotoFallback } = splitSudutFotoItems(sudut_foto_items);
                const { itemFiles, bulkFiles } = splitItemFiles(files);
                await (itemFiles.length > 0
                    ? uploadFotoItemsByIndex(dokumentasi, itemFiles, sudutFotoByIndex, sudutFotoFallback)
                    : uploadFotoItemsBulk(
                        dokumentasi,
                        bulkFiles.length > 0 ? bulkFiles : files,
                        sudutFotoFallback
                    ));

                const detail = await dokumentasiBangunanRepository.getDetail(dokumentasi.id);
                if (!detail) return;

                const folderId = await resolveDokumentasiFolderId(detail.dokumentasi);
                const pdfBuffer = await buildDokumentasiBangunanPdfBuffer(detail);
                const kodeToko = sanitizeFilenamePart(detail.dokumentasi.kode_toko ?? undefined, "TOKO");
                const nomorUlok = sanitizeFilenamePart(detail.dokumentasi.nomor_ulok ?? undefined, "ULOK");
                const filename = `DOKUMENTASI_BANGUNAN_${kodeToko}_${nomorUlok}_${detail.dokumentasi.id}.pdf`;

                const linkPdf = await uploadPdfToDrive(folderId, pdfBuffer, filename);
                await dokumentasiBangunanRepository.updatePdfLink(detail.dokumentasi.id, linkPdf);
                
                await dokumentasiBangunanRepository.update(dokumentasi.id, { status_validasi: "submitted" });
            } catch (error) {
                console.error(`[BACKGROUND DOKUMENTASI] Failed to process dokumentasi ${dokumentasi.id}`, error);
                await dokumentasiBangunanRepository.update(dokumentasi.id, { status_validasi: "failed" });
            }
        });

        return {
            dokumentasi,
            items: [],
            pdf: null,
            message: "Dokumentasi sedang diproses di background"
        };
    },

    async list(query: DokumentasiBangunanListQueryInput) {
        return dokumentasiBangunanRepository.list(query);
    },

    async listPrefillOptions(query: DokumentasiBangunanPrefillQueryInput): Promise<DokumentasiBangunanPrefillOption[]> {
        const rows = await dokumentasiBangunanRepository.listPrefillSources(query);
        const grouped = new Map<string, DokumentasiBangunanPrefillOption>();

        for (const row of rows) {
            const nomorUlok = firstText(row.nomor_ulok);
            if (!nomorUlok) continue;

            const key = nomorUlok.toUpperCase();
            const option = grouped.get(key) ?? {
                nomor_ulok: nomorUlok,
                cabang: "",
                kode_toko: "",
                nama_toko: "",
                kontraktor: "",
                kontraktor_sipil: "",
                kontraktor_me: "",
                spk_awal: "",
                spk_akhir: "",
                tanggal_serah_terima: "",
                tanggal_serah_terima_source: "NEEDS_ST"
            };

            option.cabang ||= firstText(row.cabang);
            option.kode_toko ||= firstText(row.kode_toko);
            option.nama_toko ||= firstText(row.nama_toko);

            const contractor = firstText(row.spk_nama_kontraktor, row.rab_nama_pt, row.toko_nama_kontraktor);
            const scope = firstText(row.lingkup_pekerjaan, row.proyek);
            if (contractor) {
                if (isMeScope(scope)) {
                    option.kontraktor_me ||= contractor;
                } else {
                    option.kontraktor_sipil ||= contractor;
                }
            }

            option.spk_awal = minDate(option.spk_awal, dateOnly(row.spk_waktu_mulai));
            option.spk_akhir = maxDate(
                option.spk_akhir,
                dateOnly(row.spk_effective_waktu_selesai) || dateOnly(row.spk_waktu_selesai)
            );

            const officialStDate = dateOnly(row.st_created_at) || dateOnly(row.tanggal_serah_terima_denda);
            if (officialStDate) {
                option.tanggal_serah_terima = maxDate(option.tanggal_serah_terima, officialStDate);
                option.tanggal_serah_terima_source = "SERAH_TERIMA";
            }

            grouped.set(key, option);
        }

        for (const option of grouped.values()) {
            const contractor = firstText(option.kontraktor_sipil, option.kontraktor_me);
            option.kontraktor = contractor;
            option.kontraktor_sipil = contractor;
            option.kontraktor_me = contractor;

            if (!option.tanggal_serah_terima) option.tanggal_serah_terima_source = "NEEDS_ST";
        }

        return [...grouped.values()].sort((left, right) => left.nomor_ulok.localeCompare(right.nomor_ulok));
    },

    async getDetail(id: number): Promise<DokumentasiBangunanDetail> {
        const detail = await dokumentasiBangunanRepository.getDetail(id);
        if (!detail) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        return detail;
    },

    async update(id: number, input: DokumentasiBangunanUpdateInput, files: UploadedDokumentasiFile[]) {
        const updated = await dokumentasiBangunanRepository.update(id, input);
        if (!updated) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        const newItems = await uploadFotoItemsBulk(updated, files, []);

        return {
            dokumentasi: updated,
            items: newItems
        };
    },

    async addItems(id: number, files: UploadedDokumentasiFile[]) {
        const dokumentasi = await dokumentasiBangunanRepository.findById(id);
        if (!dokumentasi) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        const items = await uploadFotoItemsBulk(dokumentasi, files, []);
        return { dokumentasi, items };
    },

    async delete(id: number) {
        const detail = await dokumentasiBangunanRepository.getDetail(id);
        if (!detail) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        const gp = GoogleProvider.instance;
        for (const item of detail.items) {
            const fileId = extractDriveFileId(item.link_foto);
            if (fileId) {
                await gp.deleteDriveFile(fileId);
            }
        }

        await dokumentasiBangunanRepository.delete(id);
        return { ok: true };
    },

    async deleteItem(itemId: number) {
        const item = await dokumentasiBangunanRepository.deleteItem(itemId);
        if (!item) {
            throw new AppError("Item dokumentasi tidak ditemukan", 404);
        }

        const gp = GoogleProvider.instance;
        const fileId = extractDriveFileId(item.link_foto);
        if (fileId) {
            await gp.deleteDriveFile(fileId);
        }

        return item;
    },

    async createPdf(id: number) {
        const detail = await dokumentasiBangunanRepository.getDetail(id);
        if (!detail) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        const folderId = await resolveDokumentasiFolderId(detail.dokumentasi);
        const pdfBuffer = await buildDokumentasiBangunanPdfBuffer(detail);
        const kodeToko = sanitizeFilenamePart(detail.dokumentasi.kode_toko ?? undefined, "TOKO");
        const nomorUlok = sanitizeFilenamePart(detail.dokumentasi.nomor_ulok ?? undefined, "ULOK");
        const filename = `DOKUMENTASI_BANGUNAN_${kodeToko}_${nomorUlok}_${detail.dokumentasi.id}.pdf`;

        const linkPdf = await uploadPdfToDrive(folderId, pdfBuffer, filename);
        await dokumentasiBangunanRepository.updatePdfLink(id, linkPdf);

        return {
            id: detail.dokumentasi.id,
            link_pdf: linkPdf,
            filename,
            item_count: detail.items.length
        };
    },

    async downloadPdf(id: number) {
        const detail = await dokumentasiBangunanRepository.getDetail(id);
        if (!detail) {
            throw new AppError("Dokumentasi bangunan tidak ditemukan", 404);
        }

        const pdfBuffer = await buildDokumentasiBangunanPdfBuffer(detail);
        const kodeToko = sanitizeFilenamePart(detail.dokumentasi.kode_toko ?? undefined, "TOKO");
        const nomorUlok = sanitizeFilenamePart(detail.dokumentasi.nomor_ulok ?? undefined, "ULOK");
        const filename = `DOKUMENTASI_BANGUNAN_${kodeToko}_${nomorUlok}_${detail.dokumentasi.id}.pdf`;

        return { buffer: pdfBuffer, filename };
    }
};
