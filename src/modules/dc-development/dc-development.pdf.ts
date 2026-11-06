import fs from "fs";
import path from "path";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { DcArchiveProjectRow } from "./dc-development.repository";

// ── Helpers ──────────────────────────────────────────────────────────────────
const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const formatDateIndonesia = (value?: string | Date | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const wibDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return `${wibDate.getUTCDate()} ${monthNames[wibDate.getUTCMonth()]} ${wibDate.getUTCFullYear()} pukul ${wibDate.getUTCHours().toString().padStart(2, '0')}.${wibDate.getUTCMinutes().toString().padStart(2, '0')}`;
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

export type PdfStageItem = {
    kategori: string;
    jenis: string;
    status: boolean;
    notes: string | null;
    linkDrive: string[];
};

export type PdfStage = {
    stageName: string;
    total: number;
    filled: number;
    percentage: number;
    items: PdfStageItem[];
};

export const buildDcDocumentReportPdfBuffer = async (
    project: DcArchiveProjectRow,
    stages: PdfStage[]
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("dc_document_report.njk");

    const html = await renderHtmlTemplate(templatePath, {
        project,
        stages,
        alfamart_logo_path: staticAssetPath("Alfamart-Emblem.png"),
        sparta_logo_path: staticAssetPath("Building-Logo.png"),
        generated_at: formatDateIndonesia(new Date().toISOString())
    });

    return renderPdfFromHtml(html);
};

export const buildGlobalDcDocumentReportPdfBuffer = async (
    allStages: { project: any, stages: PdfStage[] }[]
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath('dc_document_report_global.njk');

    const html = await renderHtmlTemplate(templatePath, {
        allStages,
        alfamart_logo_path: staticAssetPath('Alfamart-Emblem.png'),
        sparta_logo_path: staticAssetPath('Building-Logo.png'),
        generated_at: formatDateIndonesia(new Date().toISOString())
    });

    return renderPdfFromHtml(html);
};
