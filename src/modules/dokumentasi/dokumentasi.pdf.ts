import fs from "fs";
import path from "path";
import sharp from "sharp";
import { env } from "../../config/env";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import { GoogleProvider } from "../../common/google";
import type { DokumentasiBangunanDetail } from "./dokumentasi.repository";

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const formatDateIndonesia = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const staticAssetPath = (filename: string): string => {
    const candidates = [
        path.resolve(__dirname, "../../image", filename),
        path.resolve(__dirname, "../../../src/image", filename),
        path.resolve(__dirname, "../../../../server/static", filename)
    ];

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

const resolveFallbackPhoto = (): string => {
    const fileId = env.DOC_BANGUNAN_DEFAULT_PHOTO_ID;
    if (!fileId) return "";
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
};

const extractGdriveFileId = (url: string): string | null => {
    if (!url) return null;
    const byPath = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (byPath) return byPath[1];
    const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (byQuery) return byQuery[1];
    return null;
};

const imageBufferToPdfDataUrl = async (buffer: Buffer): Promise<string | null> => {
    try {
        const normalized = await sharp(buffer, { failOn: "none" })
            .rotate()
            .resize({ width: 1280, withoutEnlargement: true })
            .jpeg({ quality: 75, mozjpeg: true })
            .toBuffer();

        return `data:image/jpeg;base64,${normalized.toString("base64")}`;
    } catch (error) {
        console.error("[dokumentasi_bangunan] Gagal normalisasi foto untuk PDF:", {
            size: buffer.length,
            error
        });
        return null;
    }
};

const gdriveUrlToBase64 = async (url: string | null | undefined): Promise<string | null> => {
    if (!url) return null;
    const fileId = extractGdriveFileId(url);
    if (!fileId) return null;

    try {
        const drive = GoogleProvider.instance.docDrive;
        if (!drive) return null;
        const buffer = await GoogleProvider.instance.getFileBufferById(drive, fileId);
        if (!buffer) return null;
        return imageBufferToPdfDataUrl(buffer);
    } catch (error) {
        console.error("[dokumentasi_bangunan] Gagal mengambil foto Drive untuk PDF:", {
            fileId,
            error
        });
        return null;
    }
};

export const buildDokumentasiBangunanPdfBuffer = async (
    detail: DokumentasiBangunanDetail
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("dokumentasi_bangunan_report.njk");
    const fallbackPhoto = resolveFallbackPhoto();

    const items = await Promise.all(
        detail.items.map(async (item, index) => {
            const link = item.link_foto || fallbackPhoto;
            const base64 = await gdriveUrlToBase64(link);
            return {
                index: index + 1,
                item_index: item.item_index ?? index + 1,
                link_foto: link,
                base64,
                sudut_foto: item.sudut_foto || ""
            };
        })
    );

    const html = await renderHtmlTemplate(templatePath, {
        dokumentasi: detail.dokumentasi,
        photo_items: items,
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        alfamart_logo_path: staticAssetPath("Alfamart-Emblem.png"),
        building_logo_path: staticAssetPath("Building-Logo.png"),
        tanggal_go_formatted: formatDateIndonesia(detail.dokumentasi.tanggal_go),
        tanggal_serah_terima_formatted: formatDateIndonesia(detail.dokumentasi.tanggal_serah_terima),
        tanggal_ambil_foto_formatted: formatDateIndonesia(detail.dokumentasi.tanggal_ambil_foto),
        generated_at: formatDateIndonesia(new Date().toISOString())
    });

    return renderPdfFromHtml(html);
};
