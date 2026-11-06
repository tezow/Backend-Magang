import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import { env } from "../../config/env";
import { pool, withTransaction } from "../../db/pool";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { scheduleAutomaticSerahTerimaIfReady } from "../serah-terima/serah-terima.service";
import { opnameService, uploadFotoOpnameToDrive } from "../opname/opname.service";
import { type PoolClient } from "pg";
import { pengawasanRepository, type PengawasanRow } from "./pengawasan.repository";
import { assertPengawasanItemsBelongToGanttScope } from "./pengawasan-scope-guard";
import type {
    BulkUpdatePengawasanItemInput,
    CreatePengawasanData,
    CreatePengawasanInput,
    ListPengawasanQueryInput,
    UpdatePengawasanInput
} from "./pengawasan.schema";

type UploadedFotoOpnameFile = UploadedDokumentasiFile;

type UploadedDokumentasiFile = {
    originalname: string;
    mimetype: string;
    buffer: Parameters<GoogleProvider["uploadFile"]>[3];
};

type PgError = {
    code?: string;
    constraint?: string;
};

const toPgError = (error: unknown): PgError => {
    if (typeof error === "object" && error !== null) {
        return error as PgError;
    }

    return {};
};

const mapPgError = (error: unknown): never => {
    const pgError = toPgError(error);

    if (pgError.code === "23503" && pgError.constraint === "fk_pengawasan_gantt") {
        throw new AppError("id_gantt tidak ditemukan di tabel gantt_chart", 404);
    }

    if (pgError.code === "23503" && pgError.constraint === "fk_pengawasan_pengawasan_gantt_ref") {
        throw new AppError("id_pengawasan_gantt tidak ditemukan di tabel pengawasan_gantt", 404);
    }

    if (pgError.code === "23514" && pgError.constraint === "chk_pengawasan_status") {
        throw new AppError("status harus bernilai progress, selesai, atau terlambat", 400);
    }

    throw error;
};

const scheduleAutomaticSerahTerimaForRows = async (rows: PengawasanRow[]): Promise<void> => {
    const ganttIds = [...new Set(rows.map((row) => Number(row.id_gantt)).filter(Number.isInteger))];
    if (ganttIds.length === 0) return;

    const tokoResult = await pool.query<{ id_toko: number }>(
        `
        SELECT DISTINCT id_toko
        FROM gantt_chart
        WHERE id = ANY($1::int[])
          AND id_toko IS NOT NULL
        `,
        [ganttIds]
    );

    await Promise.all(
        tokoResult.rows.map((row) => scheduleAutomaticSerahTerimaIfReady(Number(row.id_toko)))
    );
};

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const resolveFileExtension = (file: UploadedDokumentasiFile): string => {
    const fromName = (() => {
        const rawName = file.originalname ?? "";
        const lastDot = rawName.lastIndexOf(".");
        if (lastDot <= 0 || lastDot === rawName.length - 1) return "";
        return rawName.slice(lastDot).toLowerCase();
    })();

    if (/^\.[a-z0-9]{1,10}$/.test(fromName)) {
        return fromName;
    }

    if (file.mimetype === "application/pdf") return ".pdf";
    if (file.mimetype === "image/jpeg") return ".jpg";
    if (file.mimetype === "image/png") return ".png";
    if (file.mimetype === "image/webp") return ".webp";
    return ".bin";
};

export const uploadDokumentasiToDrive = async (
    idGantt: number,
    file: UploadedDokumentasiFile
): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;

    if (!drive) {
        throw new AppError("Google Drive belum terkonfigurasi", 500);
    }

    const safeGantt = sanitizeFilenamePart(String(idGantt), "gantt");
    const ext = resolveFileExtension(file);
    const filename = `PENGAWASAN_DOKUMENTASI_${safeGantt}_${Date.now()}${ext}`;

    const tokoQuery = await pool.query(
        `SELECT t.nomor_ulok, t.proyek FROM gantt_chart g JOIN toko t ON g.id_toko = t.id WHERE g.id = $1`,
        [idGantt]
    );
    const nomorUlok = tokoQuery.rows[0]?.nomor_ulok;
    const proyek = tokoQuery.rows[0]?.proyek;

    const folderId = await gp.getOrCreateProcessFolder("Pengawasan", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        file.mimetype || "application/octet-stream",
        file.buffer,
        2,
        drive,
        { makePublic: false }
    );

    if (result.webViewLink) {
        return result.webViewLink;
    }

    if (result.id) {
        return `https://drive.google.com/file/d/${result.id}/view`;
    }

    throw new AppError("Upload dokumentasi ke Google Drive gagal", 500);
};

const detectImageMime = (buffer: Buffer, fallback?: string | null): string | null => {
    const head = buffer.slice(0, 12);
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
    if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    if (head.toString("ascii", 4, 8) === "ftyp") return "image/heic";
    if (fallback?.startsWith("image/")) return fallback;
    return null;
};

const imageBufferToPdfDataUrl = async (buffer: Buffer, mimeType?: string | null): Promise<string | null> => {
    try {
        const normalized = await sharp(buffer, { failOn: "none" })
            .rotate()
            // Kurangi quality dari 84 → 75 agar base64 lebih kecil di memori
            .jpeg({ quality: 75, mozjpeg: true })
            .resize({ width: 1280, withoutEnlargement: true })
            .toBuffer();

        return `data:image/jpeg;base64,${normalized.toString("base64")}`;
    } catch (error) {
        const detectedMime = detectImageMime(buffer, mimeType);
        if (!detectedMime || detectedMime === "image/heic") {
            console.error("[berkas_pengawasan] File dokumentasi bukan image yang bisa dibaca PDF:", {
                mimeType,
                size: buffer.length,
                error
            });
            return null;
        }

        console.error("[berkas_pengawasan] Gagal konversi foto pengawasan:", error);
        return `data:${detectedMime};base64,${buffer.toString("base64")}`;
    }
};

const extractGdriveFileId = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const byPath = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (byPath) return byPath[1];
    const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (byQuery) return byQuery[1];
    return null;
};

const gdriveImageToBase64 = async (url: string | null | undefined): Promise<string | null> => {
    if (url?.startsWith("data:image/")) return url;

    const fileId = extractGdriveFileId(url);
    if (!fileId) return null;

    const gp = GoogleProvider.instance;
    const drives = [gp.spartaDrive, gp.docDrive].filter(Boolean);

    for (const drive of drives) {
        if (!drive) continue;

        const buffer = await gp.getFileBufferById(drive, fileId);
        if (!buffer) continue;

        let mimeType: string | null | undefined;
        try {
            const meta = await drive.files.get(
                { fileId, fields: "mimeType", supportsAllDrives: true },
                { timeout: 5000 }
            );
            mimeType = meta.data.mimeType;
        } catch {
            mimeType = null;
        }

        const dataUrl = await imageBufferToPdfDataUrl(buffer, mimeType);
        if (dataUrl) return dataUrl;
    }

    console.error("[berkas_pengawasan] Foto lama tidak bisa dibaca via token backend", { fileId });
    return null;
};

const resolvePengawasanPhotoBase64 = async (item: PengawasanRow): Promise<string | null> => {
    return await gdriveImageToBase64(item.dokumentasi);
};

const normalizeTanggalPengawasan = (value: string): string => {
    const trimmed = value.trim();

    const isoLike = /^(\d{4})[-\/](\d{2})[-\/](\d{2})$/.exec(trimmed);
    if (isoLike) {
        const [, year, month, day] = isoLike;
        return `${day}/${month}/${year}`;
    }

    return trimmed.replace(/-/g, "/");
};

const resolvePengawasanGanttId = async (
    idGantt: number,
    tanggalPengawasan: string,
    itemIndex?: number
): Promise<number> => {
    const normalizedTanggalPengawasan = normalizeTanggalPengawasan(tanggalPengawasan);

    const pengawasanGanttId = await pengawasanRepository.findPengawasanGanttIdByDate(
        idGantt,
        normalizedTanggalPengawasan
    );

    if (!pengawasanGanttId) {
        const context = typeof itemIndex === "number"
            ? ` pada items[${itemIndex}]`
            : "";

        throw new AppError(
            `tanggal_pengawasan tidak ditemukan di pengawasan_gantt${context} (id_gantt=${idGantt}, tanggal_pengawasan=${normalizedTanggalPengawasan})`,
            404
        );
    }

    return pengawasanGanttId;
};

const formatJakartaTimestamp = (): string =>
    new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(new Date());

const staticAssetPath = (filenameCandidates: string[]): string => {
    const candidates = filenameCandidates.flatMap((filename) => [
        path.resolve(__dirname, "../../image", filename),
        path.resolve(__dirname, "../../../src/image", filename),
    ]);

    for (const assetPath of candidates) {
        if (fs.existsSync(assetPath)) {
            const ext = path.extname(assetPath).toLowerCase();
            const mimeType = ext === ".png"
                ? "image/png"
                : ext === ".jpg" || ext === ".jpeg"
                    ? "image/jpeg"
                    : "application/octet-stream";

            const base64 = fs.readFileSync(assetPath).toString("base64");
            return `data:${mimeType};base64,${base64}`;
        }
    }

    return "";
};

/**
 * Generate PDF laporan pengawasan untuk suatu id_pengawasan_gantt,
 * upload ke Google Drive, lalu upsert link-nya ke tabel berkas_pengawasan.
 * Dipanggil setiap kali ada create pengawasan baru (akan menimpa PDF lama).
 */
const buildPengawasanPdfBuffer = async (
    idGantt: number,
    idPengawasanGantt: number,
    tanggalPengawasan: string
): Promise<Buffer> => {
    const rawItems = await pengawasanRepository.findAllPengawasanByGanttId(idPengawasanGantt);
    // Sequential (bukan Promise.all) agar tidak semua foto di-decode ke memori sekaligus
    const items: (typeof rawItems[number] & { dokumentasi_base64: string | null })[] = [];
    for (const item of rawItems) {
        items.push({
            ...item,
            dokumentasi_base64: await resolvePengawasanPhotoBase64(item)
        });
    }

    if (items.length === 0) {
        throw new AppError("Data pengawasan belum memiliki item", 404);
    }

    let countProgress = 0;
    let countSelesai = 0;
    let countTerlambat = 0;
    for (const item of items) {
        if (item.status === "progress") countProgress++;
        else if (item.status === "selesai") countSelesai++;
        else if (item.status === "terlambat") countTerlambat++;
    }

    const picPengawasan = await pengawasanRepository.findPicPengawasanByPengawasanGanttId(idPengawasanGantt);
    
    // Cari tanggal terakhir upload foto untuk id_pengawasan_gantt ini
    const latestUploadDate = await pengawasanRepository.findLatestUploadDateByIdPengawasanGantt(idPengawasanGantt);
    
    let baseDateForDibuatPada = new Date();
    if (latestUploadDate) {
        // Jika ada foto, gunakan tanggal upload foto tersebut
        baseDateForDibuatPada = new Date(latestUploadDate);
    } else if (tanggalPengawasan) {
        // Fallback ke tanggal pengawasan (Gantt) jika tidak ada foto (meski seharusnya sudah di-skip jika migrasi)
        const parts = tanggalPengawasan.split("/");
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            baseDateForDibuatPada = new Date(year, month, day);
        } else {
            const parsed = new Date(tanggalPengawasan);
            if (!isNaN(parsed.getTime())) {
                baseDateForDibuatPada = parsed;
            }
        }
    }

    const generatedAtFormatted = new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(baseDateForDibuatPada);

    const templatePath = await resolveTemplatePath("pengawasan_report.njk");
    const html = await renderHtmlTemplate(templatePath, {
        id_gantt: idGantt,
        pic_pengawasan_nama: picPengawasan?.plc_building_support ?? null,
        tanggal_pengawasan: tanggalPengawasan,
        items,
        count_progress: countProgress,
        count_selesai: countSelesai,
        count_terlambat: countTerlambat,
        generated_at: generatedAtFormatted,
        logo_watermark: staticAssetPath(["building-logo.png", "Building-Logo.png"])
    });

    return renderPdfFromHtml(html);
};

const generateAndUploadPengawasanPdf = async (
    idGantt: number,
    idPengawasanGantt: number,
    tanggalPengawasan: string
): Promise<void> => {
    try {
        const isMigrated = await pengawasanRepository.checkIsPengawasanMigrated(idPengawasanGantt);
        if (isMigrated) {
            console.log(`[berkas_pengawasan] Skip generate PDF untuk id_pengawasan_gantt=${idPengawasanGantt} karena merupakan dokumen hasil migrasi V1.`);
            return;
        }

        const pdfBuffer = await buildPengawasanPdfBuffer(idGantt, idPengawasanGantt, tanggalPengawasan);

        // 5. Upload ke Google Drive (timpa berdasarkan nama unik per id_pengawasan_gantt)
        const gp = GoogleProvider.instance;
        const drive = gp.spartaDrive;
        if (!drive) {
            console.error("[berkas_pengawasan] Google Drive belum terkonfigurasi, skip upload PDF.");
            return;
        }

        // Hapus file PDF lama di Drive untuk id_pengawasan_gantt ini (jika ada)
        const existingBerkas = await pengawasanRepository.findBerkasByPengawasanGanttId(idPengawasanGantt);
        if (existingBerkas?.link_pdf_pengawasan) {
            const fileIdMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(existingBerkas.link_pdf_pengawasan);
            if (fileIdMatch?.[1]) {
                try {
                    await drive.files.delete({ fileId: fileIdMatch[1], supportsAllDrives: true });
                } catch {
                    // file mungkin sudah dihapus manual, abaikan
                }
            }
        }

        const tokoQuery = await pool.query(
            `SELECT t.nomor_ulok, t.proyek FROM gantt_chart g JOIN toko t ON g.id_toko = t.id WHERE g.id = $1`,
            [idGantt]
        );
        const nomorUlok = tokoQuery.rows[0]?.nomor_ulok;
        const proyek = tokoQuery.rows[0]?.proyek;

        const folderId = await gp.getOrCreateProcessFolder("Pengawasan", nomorUlok);

        const filename = `PENGAWASAN_REPORT_GANTT${idGantt}_PG${idPengawasanGantt}_${Date.now()}.pdf`;
        const result = await gp.uploadFile(
            folderId,
            filename,
            "application/pdf",
            pdfBuffer,
            2,
            drive,
            { makePublic: false }
        );

        const link = result.webViewLink
            ?? (result.id ? `https://drive.google.com/file/d/${result.id}/view` : null);

        if (!link) {
            console.error("[berkas_pengawasan] Upload PDF berhasil tapi tidak mendapat link.");
            return;
        }

        // 6. Upsert ke tabel berkas_pengawasan
        await pengawasanRepository.upsertBerkasPengawasan(idPengawasanGantt, link);
        console.log(`[berkas_pengawasan] PDF berhasil digenerate & disimpan untuk id_pengawasan_gantt=${idPengawasanGantt}`);
    } catch (error) {
        // Jangan sampai error PDF generation menggagalkan create pengawasan
        console.error("[berkas_pengawasan] Gagal generate/upload PDF:", error);
    }
};

const pdfGenerationDebounceMap = new Map<number, NodeJS.Timeout>();

const regeneratePengawasanPdfForRow = async (row: Pick<PengawasanRow, "id_gantt" | "id_pengawasan_gantt">): Promise<void> => {
    const pgId = row.id_pengawasan_gantt;
    
    if (pdfGenerationDebounceMap.has(pgId)) {
        clearTimeout(pdfGenerationDebounceMap.get(pgId));
    }
    
    pdfGenerationDebounceMap.set(pgId, setTimeout(() => {
        pdfGenerationDebounceMap.delete(pgId);
        
        pengawasanRepository.findPengawasanGanttInfoById(pgId)
            .then(info => {
                if (!info) return;
                generateAndUploadPengawasanPdf(row.id_gantt, pgId, info.tanggal_pengawasan)
                    .catch((err) => console.error("[berkas_pengawasan] background error:", err));
            })
            .catch(err => console.error("[berkas_pengawasan] debounce info fetch error:", err));
    }, 5000));
};

const ensureProgressUsesNearestCheckpoint = async (item: CreatePengawasanData): Promise<void> => {
    if (String(item.status || '').toLowerCase() !== 'progress') return;

    const skipped = await pengawasanRepository.findSkippedPreviousProgress({
        id_gantt: item.id_gantt,
        id_pengawasan_gantt: item.id_pengawasan_gantt,
        kategori_pekerjaan: item.kategori_pekerjaan,
        jenis_pekerjaan: item.jenis_pekerjaan
    });

    if (!skipped) return;

    throw new AppError(
        `Item ${item.kategori_pekerjaan} / ${item.jenis_pekerjaan} masih harus diisi di pengawasan terdekat ${skipped.skipped_tanggal_pengawasan} setelah Progress ${skipped.previous_tanggal_pengawasan}. Tidak bisa lompat ke checkpoint ini.`,
        409
    );
};
const ensureSelesaiBackfillDoesNotLeaveFutureBlocker = async (item: CreatePengawasanData): Promise<void> => {
    if (String(item.status || '').toLowerCase() !== 'selesai') return;

    const futureRows = await pengawasanRepository.findFutureUnfinishedItems({
        id_gantt: item.id_gantt,
        id_pengawasan_gantt: item.id_pengawasan_gantt,
        kategori_pekerjaan: item.kategori_pekerjaan,
        jenis_pekerjaan: item.jenis_pekerjaan
    });

    if (futureRows.length === 0) return;

    const latest = futureRows[0];
    throw new AppError(
        `Item ${item.kategori_pekerjaan} / ${item.jenis_pekerjaan} masih memiliki status ${latest.status} pada pengawasan ${latest.tanggal_pengawasan}. Selesaikan item di checkpoint terbaru tersebut agar tidak membuat blocker stale.`,
        409
    );
};
const ensurePengawasanItemBelongsToScope = async (item: Pick<CreatePengawasanData, "id_gantt" | "kategori_pekerjaan" | "jenis_pekerjaan">, index?: number | string): Promise<void> => {
    await assertPengawasanItemsBelongToGanttScope([{ ...item, index }]);
};

const ensurePengawasanItemsBelongToScope = async (items: Array<Pick<CreatePengawasanData, "id_gantt" | "kategori_pekerjaan" | "jenis_pekerjaan">>): Promise<void> => {
    await assertPengawasanItemsBelongToGanttScope(items.map((item, index) => ({ ...item, index })));
};

const createTerlambatCarryForwardRows = async (
    rows: PengawasanRow[],
    client?: PoolClient
): Promise<PengawasanRow[]> => {
    const carryForwardRows: PengawasanRow[] = [];

    for (const row of rows) {
        if (String(row.status || '').toLowerCase() !== 'terlambat') continue;

        const carryForward = await pengawasanRepository.createNextTerlambatCarryForwardIfMissing({
            id_gantt: row.id_gantt,
            id_pengawasan_gantt: row.id_pengawasan_gantt,
            kategori_pekerjaan: row.kategori_pekerjaan,
            jenis_pekerjaan: row.jenis_pekerjaan,
            catatan: row.catatan
        }, client);

        if (carryForward) {
            carryForwardRows.push(carryForward);
        }
    }

    return carryForwardRows;
};

const hasAnyUpdateField = (input: UpdatePengawasanInput): boolean =>
    typeof input.kategori_pekerjaan !== "undefined"
    || typeof input.jenis_pekerjaan !== "undefined"
    || typeof input.catatan !== "undefined"
    || typeof input.dokumentasi !== "undefined"
    || typeof input.status !== "undefined";

const withPengawasanDocumentFallback = async (
    item: CreatePengawasanData,
    client?: PoolClient
): Promise<CreatePengawasanData> => {
    if (item.dokumentasi?.trim()) return item;
    if (String(item.status || "").toLowerCase() !== "selesai") return item;

    const fallbackDokumentasi = await pengawasanRepository.findLatestNonNullDokumentasiForItem({
        id_gantt: item.id_gantt,
        kategori_pekerjaan: item.kategori_pekerjaan,
        jenis_pekerjaan: item.jenis_pekerjaan,
        excludeIdPengawasanGantt: item.id_pengawasan_gantt
    }, client);

    return fallbackDokumentasi ? { ...item, dokumentasi: fallbackDokumentasi } : item;
};

const withPengawasanDocumentFallbacks = async (
    items: CreatePengawasanData[],
    client: PoolClient
): Promise<CreatePengawasanData[]> => Promise.all(
    items.map((item) => withPengawasanDocumentFallback(item, client))
);

const preUploadOpnameFotos = async (
    originalItems: any[],
    uploadedFotoOpnameFiles: UploadedFotoOpnameFile[],
    uploadedFotoOpnameIndexes: number[] | undefined,
    idTokoFallback: number
) => {
    const opnamePayloads = [];

    for (let i = 0; i < originalItems.length; i++) {
        const item = originalItems[i];
        if (item.opname_data) {
            const payload = {
                ...item.opname_data,
                status: "pending"
            };
            
            let fileToUpload: UploadedFotoOpnameFile | undefined;
            if (uploadedFotoOpnameIndexes && uploadedFotoOpnameIndexes.length > 0) {
                const fotoPos = uploadedFotoOpnameIndexes.indexOf(i);
                if (fotoPos !== -1) {
                    fileToUpload = uploadedFotoOpnameFiles[fotoPos];
                }
            } else {
                if (uploadedFotoOpnameFiles.length === 1) {
                    fileToUpload = uploadedFotoOpnameFiles[0];
                } else if (uploadedFotoOpnameFiles.length === originalItems.length) {
                    fileToUpload = uploadedFotoOpnameFiles[i];
                }
            }

            if (fileToUpload) {
                const targetToko = payload.id_toko || idTokoFallback;
                payload.foto = await uploadFotoOpnameToDrive(targetToko, fileToUpload);
            }
            
            opnamePayloads.push(payload);
        }
    }

    return opnamePayloads;
};

const processOpnameDataForPengawasanBulk = async (
    opnamePayloads: any[],
    emailPembuat: string,
    client: PoolClient
) => {
    if (opnamePayloads.length > 0) {
        if (!emailPembuat) {
             throw new AppError("email_pembuat harus diisi (User tidak terautentikasi) untuk menyimpan data opname.", 400);
        }
        
        try {
            const result = await opnameService.createBulk({
                id_toko: opnamePayloads[0].id_toko,
                tipe_opname: "OPNAME",
                email_pembuat: emailPembuat,
                grand_total_opname: "0",
                grand_total_rab: "0",
                items: opnamePayloads
            }, [], undefined, client);

            if (result && (result as any).statusCode) {
                throw new AppError((result as any).message || "Gagal menyimpan opname karena timeout atau error validasi.", (result as any).statusCode);
            }
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan opname", 500);
        }
    }
};

export const pengawasanService = {
    async listPendingMigrationPdfs(nomorUlok?: string, cabangArray?: string[]) {
        return pengawasanRepository.findPendingMigrationPdfs(nomorUlok, cabangArray);
    },

    async create(
        input: CreatePengawasanInput,
        uploadedDokumentasi?: UploadedDokumentasiFile
    ): Promise<PengawasanRow> {
        try {
            const normalizedTanggal = normalizeTanggalPengawasan(input.tanggal_pengawasan);
            const idPengawasanGantt = await resolvePengawasanGanttId(
                input.id_gantt,
                input.tanggal_pengawasan
            );

            const dokumentasiLink = uploadedDokumentasi
                ? await uploadDokumentasiToDrive(input.id_gantt, uploadedDokumentasi)
                : undefined;

            const { tanggal_pengawasan: _tanggalPengawasan, ...inputWithoutTanggal } = input;

            const payload: CreatePengawasanData = dokumentasiLink
                ? {
                    ...inputWithoutTanggal,
                    id_pengawasan_gantt: idPengawasanGantt,
                    dokumentasi: dokumentasiLink
                }
                : {
                    ...inputWithoutTanggal,
                    id_pengawasan_gantt: idPengawasanGantt
                };
                    await ensurePengawasanItemBelongsToScope(payload);
                    await ensureProgressUsesNearestCheckpoint(payload);
                    await ensureSelesaiBackfillDoesNotLeaveFutureBlocker(payload);

            const payloadWithFallback = await withPengawasanDocumentFallback(payload);
            let carryForwardRows: PengawasanRow[] = [];
            const row = await withTransaction(async (client) => {
                const [createdRow] = await pengawasanRepository.createBulk([payloadWithFallback], client);
                carryForwardRows = await createTerlambatCarryForwardRows([createdRow], client);
                return createdRow;
            });

            // Generate PDF & upsert berkas_pengawasan (fire-and-forget)
            generateAndUploadPengawasanPdf(input.id_gantt, idPengawasanGantt, normalizedTanggal)
                .catch((err) => console.error("[berkas_pengawasan] background error:", err));
            for (const carryRow of carryForwardRows) {
                regeneratePengawasanPdfForRow(carryRow)
                    .catch((err) => console.error("[berkas_pengawasan] carry-forward regenerate error:", err));
            }

            await scheduleAutomaticSerahTerimaForRows([row, ...carryForwardRows]);
            return row;
        } catch (error) {
            return mapPgError(error);
        }
    },

    async createBulk(
        items: CreatePengawasanInput[],
        uploadedDokumentasiFiles: UploadedDokumentasiFile[] = [],
        uploadedDokumentasiIndexes?: number[],
        uploadedFotoOpnameFiles: UploadedFotoOpnameFile[] = [],
        uploadedFotoOpnameIndexes?: number[],
        emailPembuat?: string
    ): Promise<PengawasanRow[]> {
        try {
            const resolvedGanttIds = new Map<number, { idPengawasanGantt: number; tanggal: string }>();

            // Sequential (bukan Promise.all) agar query ke DB tidak meledak paralel
            const basePayloads: CreatePengawasanData[] = [];
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                const idPengawasanGantt = await resolvePengawasanGanttId(
                    item.id_gantt,
                    item.tanggal_pengawasan,
                    index
                );

                resolvedGanttIds.set(idPengawasanGantt, {
                    idPengawasanGantt,
                    tanggal: normalizeTanggalPengawasan(item.tanggal_pengawasan)
                });

                const { tanggal_pengawasan: _tanggalPengawasan, ...itemWithoutTanggal } = item;
                basePayloads.push({
                    ...itemWithoutTanggal,
                    id_pengawasan_gantt: idPengawasanGantt
                });
            }
            let fallbackIdToko = 0;
            const firstOpname = items.find(i => i.opname_data)?.opname_data;
            if (firstOpname && firstOpname.id_toko) fallbackIdToko = firstOpname.id_toko;
            
            const opnamePayloads = await preUploadOpnameFotos(items, uploadedFotoOpnameFiles, uploadedFotoOpnameIndexes, fallbackIdToko);

            let rows: PengawasanRow[];
            const carryForwardRows: PengawasanRow[] = [];

            if (uploadedDokumentasiFiles.length === 0) {
                await ensurePengawasanItemsBelongToScope(basePayloads);
                for (const payload of basePayloads) {
                    await ensureProgressUsesNearestCheckpoint(payload);
                    await ensureSelesaiBackfillDoesNotLeaveFutureBlocker(payload);
                }

                rows = await withTransaction(async (client) => {
                    const payloadsReadyToInsert = await withPengawasanDocumentFallbacks(basePayloads, client);
                    const result = await pengawasanRepository.createBulk(payloadsReadyToInsert, client);
                    carryForwardRows.push(...await createTerlambatCarryForwardRows(result, client));
                    await processOpnameDataForPengawasanBulk(opnamePayloads, emailPembuat || "", client);
                    return result;
                });
            } else if (uploadedDokumentasiIndexes && uploadedDokumentasiIndexes.length > 0) {
                if (uploadedDokumentasiIndexes.length !== uploadedDokumentasiFiles.length) {
                    throw new AppError(
                        "Jumlah file_dokumentasi_indexes harus sama dengan jumlah file_dokumentasi",
                        400
                    );
                }

                const usedIndexes = new Set<number>();
                const payloadWithDokumentasi: CreatePengawasanData[] = basePayloads.map((item) => ({ ...item }));

                for (let filePosition = 0; filePosition < uploadedDokumentasiFiles.length; filePosition++) {
                    const itemIndex = uploadedDokumentasiIndexes[filePosition];
                    if (itemIndex < 0 || itemIndex >= items.length) {
                        throw new AppError(
                            `file_dokumentasi_indexes[${filePosition}] di luar range items (0-${items.length - 1})`,
                            400
                        );
                    }

                    if (usedIndexes.has(itemIndex)) {
                        throw new AppError(
                            `file_dokumentasi_indexes tidak boleh duplikat (duplikat di index item ${itemIndex})`,
                            400
                        );
                    }
                    usedIndexes.add(itemIndex);

                    const item = basePayloads[itemIndex];
                    const dokumentasiLink = await uploadDokumentasiToDrive(item.id_gantt, uploadedDokumentasiFiles[filePosition]);
                    payloadWithDokumentasi[itemIndex] = {
                        ...item,
                        dokumentasi: dokumentasiLink
                    };
                }

                await ensurePengawasanItemsBelongToScope(payloadWithDokumentasi);
                for (const payload of payloadWithDokumentasi) {
                    await ensureProgressUsesNearestCheckpoint(payload);
                    await ensureSelesaiBackfillDoesNotLeaveFutureBlocker(payload);
                }

                rows = await withTransaction(async (client) => {
                    const payloadsReadyToInsert = await withPengawasanDocumentFallbacks(payloadWithDokumentasi, client);
                    const result = await pengawasanRepository.createBulk(payloadsReadyToInsert, client);
                    carryForwardRows.push(...await createTerlambatCarryForwardRows(result, client));
                    await processOpnameDataForPengawasanBulk(opnamePayloads, emailPembuat || "", client);
                    return result;
                });
            } else {
                if (uploadedDokumentasiFiles.length !== 1 && uploadedDokumentasiFiles.length !== items.length) {
                    throw new AppError(
                        "Jumlah file_dokumentasi harus 1 file untuk semua item, sama dengan jumlah items, atau kirim file_dokumentasi_indexes untuk mapping item tertentu",
                        400
                    );
                }

                const payloadWithDokumentasi: CreatePengawasanData[] = [];
                for (let index = 0; index < items.length; index++) {
                    const item = basePayloads[index];
                    const file = uploadedDokumentasiFiles.length === 1
                        ? uploadedDokumentasiFiles[0]
                        : uploadedDokumentasiFiles[index];

                    if (!file) {
                        payloadWithDokumentasi.push(item);
                        continue;
                    }

                    const dokumentasiLink = await uploadDokumentasiToDrive(item.id_gantt, file);
                    payloadWithDokumentasi.push({
                        ...item,
                        dokumentasi: dokumentasiLink
                    });
                }

                await ensurePengawasanItemsBelongToScope(payloadWithDokumentasi);
                for (const payload of payloadWithDokumentasi) {
                    await ensureProgressUsesNearestCheckpoint(payload);
                    await ensureSelesaiBackfillDoesNotLeaveFutureBlocker(payload);
                }

                rows = await withTransaction(async (client) => {
                    const payloadsReadyToInsert = await withPengawasanDocumentFallbacks(payloadWithDokumentasi, client);
                    const result = await pengawasanRepository.createBulk(payloadsReadyToInsert, client);
                    carryForwardRows.push(...await createTerlambatCarryForwardRows(result, client));
                    await processOpnameDataForPengawasanBulk(opnamePayloads, emailPembuat || "", client);
                    return result;
                });
            }

            // Generate PDF & upsert berkas_pengawasan for each unique id_pengawasan_gantt (fire-and-forget)
            const idGantt = items[0].id_gantt;
            for (const { idPengawasanGantt, tanggal } of resolvedGanttIds.values()) {
                generateAndUploadPengawasanPdf(idGantt, idPengawasanGantt, tanggal)
                    .catch((err) => console.error("[berkas_pengawasan] background error:", err));
            }
            for (const carryRow of carryForwardRows) {
                regeneratePengawasanPdfForRow(carryRow)
                    .catch((err) => console.error("[berkas_pengawasan] carry-forward regenerate error:", err));
            }

            await scheduleAutomaticSerahTerimaForRows([...rows, ...carryForwardRows]);
            return rows;
        } catch (error) {
            return mapPgError(error);
        }
    },

    async list(query: ListPengawasanQueryInput) {
        console.log('[PENGAWASAN SERVICE] list() called with query:', JSON.stringify(query));
        
        if (query.tanggal) {
            if (typeof query.id_gantt === "undefined") {
                throw new AppError("Query id_gantt wajib diisi jika menggunakan query tanggal", 400);
            }

            const idPengawasanGantt = await pengawasanRepository.findPengawasanGanttIdByDate(
                query.id_gantt,
                normalizeTanggalPengawasan(query.tanggal)
            );

            if (!idPengawasanGantt) {
                console.log('[PENGAWASAN SERVICE] No pengawasan_gantt found for tanggal:', query.tanggal);
                return [];
            }

            console.log('[PENGAWASAN SERVICE] Calling repository.findAll with idPengawasanGantt:', idPengawasanGantt);
            return pengawasanRepository.findAll(query, idPengawasanGantt);
        }

        console.log('[PENGAWASAN SERVICE] Calling repository.findAll without idPengawasanGantt');
        return pengawasanRepository.findAll(query);
    },

    async regeneratePdf(idPengawasanGantt: number) {
        const info = await pengawasanRepository.findPengawasanGanttInfoById(idPengawasanGantt);
        if (!info) {
            throw new AppError("Data pengawasan tidak ditemukan", 404);
        }

        await generateAndUploadPengawasanPdf(info.id_gantt, info.id, info.tanggal_pengawasan);
        return pengawasanRepository.findBerkasByPengawasanGanttId(idPengawasanGantt);
    },
    async downloadPdf(idPengawasanGantt: number) {
        const info = await pengawasanRepository.findPengawasanGanttInfoById(idPengawasanGantt);
        if (!info) {
            throw new AppError("Data pengawasan tidak ditemukan", 404);
        }

        const isMigrated = await pengawasanRepository.checkIsPengawasanMigrated(idPengawasanGantt);
        if (isMigrated) {
            const berkas = await pengawasanRepository.findBerkasByPengawasanGanttId(idPengawasanGantt);
            if (berkas?.link_pdf_pengawasan) {
                const fileIdMatch = /\/d\/([a-zA-Z0-9_-]+)/.exec(berkas.link_pdf_pengawasan);
                if (fileIdMatch?.[1]) {
                    const gp = GoogleProvider.instance;
                    if (gp.spartaDrive) {
                        try {
                            const response = await gp.spartaDrive.files.get(
                                { fileId: fileIdMatch[1], alt: 'media', supportsAllDrives: true },
                                { responseType: 'arraybuffer' }
                            );
                            return { 
                                buffer: Buffer.from(response.data as ArrayBuffer), 
                                filename: `PENGAWASAN_REPORT_GANTT${info.id_gantt}_PG${info.id}_MIGRATED.pdf` 
                            };
                        } catch (error) {
                            console.error("[downloadPdf] Gagal mengunduh PDF migrasi dari Google Drive:", error);
                            throw new AppError("Gagal mengunduh PDF migrasi dari Google Drive.", 500);
                        }
                    } else {
                        throw new AppError("Google Drive tidak terkonfigurasi.", 500);
                    }
                }
            }
            throw new AppError("Dokumen ini adalah hasil migrasi dan link PDF tidak ditemukan.", 404);
        }

        const buffer = await buildPengawasanPdfBuffer(
            info.id_gantt,
            info.id,
            info.tanggal_pengawasan
        );
        const filename = `PENGAWASAN_REPORT_GANTT${info.id_gantt}_PG${info.id}.pdf`;

        return { buffer, filename };
    },

    async getById(id: string) {
        const data = await pengawasanRepository.findById(id);
        if (!data) {
            throw new AppError("Data pengawasan tidak ditemukan", 404);
        }

        return data;
    },

    async update(
        id: string,
        input: UpdatePengawasanInput,
        uploadedDokumentasi?: UploadedDokumentasiFile
    ): Promise<PengawasanRow> {
        try {
            if (!hasAnyUpdateField(input) && !uploadedDokumentasi) {
                throw new AppError("Minimal satu field harus diisi untuk update atau kirim rev_file_dokumentasi", 400);
            }

            const existing = await pengawasanRepository.findById(id);
            if (!existing) {
                throw new AppError("Data pengawasan tidak ditemukan", 404);
            }

            const dokumentasiLink = uploadedDokumentasi
                ? await uploadDokumentasiToDrive(existing.id_gantt, uploadedDokumentasi)
                : undefined;

            const payload = dokumentasiLink
                ? { ...input, dokumentasi: dokumentasiLink }
                : input;

            await ensurePengawasanItemBelongsToScope({
                id_gantt: existing.id_gantt,
                kategori_pekerjaan: payload.kategori_pekerjaan ?? existing.kategori_pekerjaan,
                jenis_pekerjaan: payload.jenis_pekerjaan ?? existing.jenis_pekerjaan
            });

            let carryForwardRows: PengawasanRow[] = [];
            const data = await withTransaction(async (client) => {
                const updated = await pengawasanRepository.updateById(id, payload, client);
                if (!updated) {
                    throw new AppError("Data pengawasan tidak ditemukan", 404);
                }
                carryForwardRows = await createTerlambatCarryForwardRows([updated], client);
                return updated;
            });

            await regeneratePengawasanPdfForRow(data);
            for (const carryRow of carryForwardRows) {
                regeneratePengawasanPdfForRow(carryRow)
                    .catch((err) => console.error("[berkas_pengawasan] carry-forward regenerate error:", err));
            }

            await scheduleAutomaticSerahTerimaForRows([data, ...carryForwardRows]);
            return data;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            return mapPgError(error);
        }
    },

    async updateBulk(
        items: BulkUpdatePengawasanItemInput[],
        uploadedDokumentasiFiles: UploadedDokumentasiFile[] = [],
        uploadedDokumentasiIndexes?: number[],
        uploadedFotoOpnameFiles: UploadedFotoOpnameFile[] = [],
        uploadedFotoOpnameIndexes?: number[],
        emailPembuat?: string
    ): Promise<PengawasanRow[]> {
        try {
            const fileByItemIndex = new Map<number, UploadedDokumentasiFile>();

            if (uploadedDokumentasiFiles.length > 0) {
                if (uploadedDokumentasiIndexes && uploadedDokumentasiIndexes.length > 0) {
                    if (uploadedDokumentasiIndexes.length !== uploadedDokumentasiFiles.length) {
                        throw new AppError(
                            "Jumlah rev_file_dokumentasi_indexes harus sama dengan jumlah rev_file_dokumentasi",
                            400
                        );
                    }

                    const usedIndexes = new Set<number>();
                    for (let filePosition = 0; filePosition < uploadedDokumentasiFiles.length; filePosition++) {
                        const itemIndex = uploadedDokumentasiIndexes[filePosition];
                        if (itemIndex < 0 || itemIndex >= items.length) {
                            throw new AppError(
                                `rev_file_dokumentasi_indexes[${filePosition}] di luar range items (0-${items.length - 1})`,
                                400
                            );
                        }

                        if (usedIndexes.has(itemIndex)) {
                            throw new AppError(
                                `rev_file_dokumentasi_indexes tidak boleh duplikat (duplikat di index item ${itemIndex})`,
                                400
                            );
                        }

                        usedIndexes.add(itemIndex);
                        fileByItemIndex.set(itemIndex, uploadedDokumentasiFiles[filePosition]);
                    }
                } else {
                    if (uploadedDokumentasiFiles.length !== items.length) {
                        throw new AppError(
                            "Jumlah rev_file_dokumentasi harus sama dengan jumlah items, atau kirim rev_file_dokumentasi_indexes untuk mapping item tertentu",
                            400
                        );
                    }

                    uploadedDokumentasiFiles.forEach((file, index) => {
                        fileByItemIndex.set(index, file);
                    });
                }
            }

            const usedIds = new Set<number>();
            const updatedRows: PengawasanRow[] = [];
            const carryForwardRows: PengawasanRow[] = [];
            const ganttIdsToRegenerate = new Set<number>();

            const finalItemsToUpdate: { id: string | number, finalPayload: any }[] = [];
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                if (usedIds.has(item.id)) {
                    throw new AppError(`id duplikat ditemukan pada items[${index}] (id=${item.id})`, 400);
                }
                usedIds.add(item.id);

                const { id, ...rawPayload } = item;
                const payload: UpdatePengawasanInput = rawPayload;
                const uploadedDokumentasi = fileByItemIndex.get(index);

                if (!hasAnyUpdateField(payload) && !uploadedDokumentasi) {
                    throw new AppError(
                        `Minimal satu field update atau rev_file_dokumentasi wajib diisi pada items[${index}]`,
                        400
                    );
                }

                const existing = await pengawasanRepository.findById(String(id));
                if (!existing) {
                    throw new AppError(`Data pengawasan tidak ditemukan pada items[${index}] (id=${id})`, 404);
                }

                const dokumentasiLink = uploadedDokumentasi
                    ? await uploadDokumentasiToDrive(existing.id_gantt, uploadedDokumentasi)
                    : undefined;

                const finalPayload = dokumentasiLink
                    ? { ...payload, dokumentasi: dokumentasiLink }
                    : payload;

                await ensurePengawasanItemBelongsToScope({
                    id_gantt: existing.id_gantt,
                    kategori_pekerjaan: finalPayload.kategori_pekerjaan ?? existing.kategori_pekerjaan,
                    jenis_pekerjaan: finalPayload.jenis_pekerjaan ?? existing.jenis_pekerjaan
                }, index);

                finalItemsToUpdate.push({ id, finalPayload });
            }

            let fallbackIdToko = 0;
            const firstOpname = items.find(i => i.opname_data)?.opname_data;
            if (firstOpname && firstOpname.id_toko) fallbackIdToko = firstOpname.id_toko;
            
            const opnamePayloads = await preUploadOpnameFotos(items, uploadedFotoOpnameFiles, uploadedFotoOpnameIndexes, fallbackIdToko);

            const updatedRowsArray = await withTransaction(async (client) => {
                const results = [];
                for (const { id, finalPayload } of finalItemsToUpdate) {
                    const data = await pengawasanRepository.updateById(String(id), finalPayload, client);
                    if (!data) {
                        throw new AppError(`Data pengawasan tidak ditemukan (id=${id})`, 404);
                    }
                    results.push(data);
                    ganttIdsToRegenerate.add(data.id_pengawasan_gantt);
                }
                
                carryForwardRows.push(...await createTerlambatCarryForwardRows(results, client));
                await processOpnameDataForPengawasanBulk(opnamePayloads, emailPembuat || "", client);
                
                return results;
            });
            updatedRows.push(...updatedRowsArray);

            // Generate PDF sekali per id_pengawasan_gantt (fire-and-forget)
            // Ini mencegah N concurrent PDF generation yang bisa crash server
            for (const pgId of ganttIdsToRegenerate) {
                const representativeRow = updatedRows.find(r => r.id_pengawasan_gantt === pgId);
                if (representativeRow) {
                    regeneratePengawasanPdfForRow(representativeRow)
                        .catch((err) => console.error("[berkas_pengawasan] bulk regenerate error:", err));
                }
            }
            for (const carryRow of carryForwardRows) {
                regeneratePengawasanPdfForRow(carryRow)
                    .catch((err) => console.error("[berkas_pengawasan] carry-forward regenerate error:", err));
            }

            await scheduleAutomaticSerahTerimaForRows([...updatedRows, ...carryForwardRows]);
            return updatedRows;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            return mapPgError(error);
        }
    },

    async remove(id: string) {
        const deleted = await pengawasanRepository.deleteById(id);
        if (!deleted) {
            throw new AppError("Data pengawasan tidak ditemukan", 404);
        }

        return { id: Number(id), deleted: true };
    }
};
