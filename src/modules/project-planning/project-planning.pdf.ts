import fs from "fs";
import path from "path";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import type { ProjekPlanningRow } from "./project-planning.repository";

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// ── Photo point label mapping (mirrored from frontend photoPoints.ts) ──────
const PHOTO_POINT_LABELS: Record<number, string> = {
    1: "KANAN 50 M",
    2: "DEPAN KANAN",
    3: "DEPAN",
    4: "DEPAN KIRI",
    5: "KIRI 50 M",
    6: "KIRI BAHU JALAN",
    7: "KANAN BAHU JALAN",
    8: "TAMPAK KANAN DEPAN KEBELAKANG",
    9: "TAMPAK KIRI DEPAN KEBELAKANG",
    10: "KANAN BELAKANG BANGUNAN MENGHADAP DEPAN",
    11: "KANAN BELAKANG BANGUNAN MENGHADAP SAMPING",
    12: "KIRI BELAKANG BANGUNAN MENGHADAP SAMPING",
    13: "KIRI BELAKANG BANGUNAN MENGHADAP DEPAN",
    14: "INSTALASI LISTRIK POLE SIGN",
    15: "GUTTER",
    16: "KOLOM IWF DUDUKAN LISTPLANK",
    17: "KANAN TERAS LUAR",
    18: "KIRI TERAS LUAR",
    19: "KANAN TERAS DALAM",
    20: "KIRI TERAS DALAM",
    21: "PINTU KACA ALLUMUNIUM",
    22: "SUDUT KIRI DEPAN AREA SALES",
    23: "INSTALASI LISTRIK FREEZER",
    24: "SUDUT KANAN DEPAN AREA SALES",
    25: "INSTALASI LISTRIK MEJA KASIR",
    26: "SUDUT KANAN BELAKANG AREA SALES",
    27: "SUDUT KIRI BELAKANG AREA SALES",
    28: "SELASAR + JANITOR",
    29: "KAMAR MANDI",
    30: "GUDANG SEBELAH KANAN",
    31: "GUDANG SEBELAH KIRI",
    32: "INSTALASI LISTRIK & DRAINASE CHILLER",
    33: "AREA DAG TORN",
    34: "INSTALASI LISTRIK DAN LISTPLANK",
    35: "CREMONA DIATAS FOLDING GATE",
    36: "INSTALASI LISTRIK DIATAS PLAFOND",
    37: "SEPTICTANK EXISTING",
    38: "SUMUR EXISTING",
    39: "HEAD TO HEAD KOMPETITOR 1",
    40: "HEAD TO HEAD KOMPETITOR 2",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDateIndonesia = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    // Konversi ke WIB (UTC+7)
    const wibDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);

    return `${wibDate.getUTCDate()} ${monthNames[wibDate.getUTCMonth()]} ${wibDate.getUTCFullYear()} pukul ${wibDate.getUTCHours().toString().padStart(2, '0')}.${wibDate.getUTCMinutes().toString().padStart(2, '0')}`;
};

const formatCurrency = (value?: string | number | null): string => {
    if (!value) return "0";
    return Number(value).toLocaleString("id-ID");
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

/**
 * Ekstrak Google Drive fileId dari berbagai format URL GDrive.
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - https://drive.google.com/uc?export=download&id={fileId}
 */
export function extractGdriveFileId(url: string): string | null {
    if (!url) return null;
    // Pattern /d/{fileId}/
    const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return m1[1];
    // Pattern ?id={fileId}
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return m2[1];
    return null;
}

/**
 * Download file dari GDrive menggunakan docDrive OAuth dan konversi ke base64 data URL.
 * Return null jika gagal atau bukan URL GDrive.
 */
async function gdriveUrlToBase64(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    const fileId = extractGdriveFileId(url);
    if (!fileId) return null;

    try {
        const drive = GoogleProvider.instance.docDrive;
        if (!drive) return null;
        const buffer = await GoogleProvider.instance.getFileBufferById(drive, fileId);
        if (!buffer) return null;
        // Detect mime type dari magic bytes
        const head = buffer.slice(0, 4);
        let mime = "image/jpeg";
        if (head[0] === 0x89 && head[1] === 0x50) mime = "image/png";
        else if (head[0] === 0x47 && head[1] === 0x49) mime = "image/gif";
        else if (head[0] === 0x25 && head[1] === 0x50) mime = "application/pdf";
        return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
        return null;
    }
}

// ── Main export ──────────────────────────────────────────────────────────────

export const buildProjekPlanningPdfBuffer = async (
    projek: ProjekPlanningRow
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("projek_planning_report.njk");
    const status = projek.status;
    const bmApproverEmailFinal = projek.bm2_approver_email;
    const bmApprovalTimeFinal = projek.bm2_waktu_persetujuan;
    const hasBmSignature = [
        "WAITING_BM_REGIONAL_APPROVAL",
        "WAITING_PP_APPROVAL_2",
        "WAITING_PP_MANAGER_APPROVAL",
        "COMPLETED",
    ].includes(status) && !!bmApproverEmailFinal;
    const hasBmRegionalSignature = [
        "WAITING_PP_APPROVAL_2",
        "WAITING_PP_MANAGER_APPROVAL",
        "COMPLETED",
    ].includes(status) && !!projek.bm_regional_approver_email;
    const ppSpecialistApproverEmail = projek.pp2_approver_email;
    const ppSpecialistApprovalTime = projek.pp2_waktu_persetujuan;
    const hasPpSpecialistSignature = [
        "WAITING_PP_MANAGER_APPROVAL",
        "COMPLETED",
    ].includes(status) && !!ppSpecialistApproverEmail;
    const hasPpManagerSignature = status === "COMPLETED" && !!projek.pp_manager_approver_email;

    // Enrich foto_items: download dari GDrive sebagai base64 dan tambahkan label
    const enrichedFotoItems = await Promise.all(
        (projek.foto_items || []).map(async (foto) => {
            const base64 = await gdriveUrlToBase64(foto.link_foto);
            const label = PHOTO_POINT_LABELS[foto.item_index] ?? `Titik ${foto.item_index}`;
            return { ...foto, base64, label };
        })
    );

    const skip_bm_approval = ["BATAM"].includes(String(projek.cabang ?? "").trim().toUpperCase());

    const html = await renderHtmlTemplate(templatePath, {
        projek: { ...projek, foto_items: enrichedFotoItems },
        skip_bm_approval,
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        alfamart_logo_path: staticAssetPath("Alfamart-Emblem.png"),
        sparta_logo_path: staticAssetPath("Building-Logo.png"),
        created_at_formatted: formatDateIndonesia(projek.created_at),
        has_bm_signature: hasBmSignature,
        has_bm_regional_signature: hasBmRegionalSignature,
        has_pp_specialist_signature: hasPpSpecialistSignature,
        has_pp_manager_signature: hasPpManagerSignature,
        pp_specialist_approver_email: ppSpecialistApproverEmail,
        bm_approver_email_final: bmApproverEmailFinal,
        bm_waktu_formatted: formatDateIndonesia(bmApprovalTimeFinal),
        bm_regional_waktu_formatted: formatDateIndonesia(projek.bm_regional_waktu_persetujuan),
        pp2_waktu_formatted: formatDateIndonesia(ppSpecialistApprovalTime),
        pp_manager_waktu_formatted: formatDateIndonesia(projek.pp_manager_waktu_persetujuan),
        estimasi_biaya_formatted: formatCurrency(projek.estimasi_biaya),
        generated_at: formatDateIndonesia(new Date().toISOString())
    });

    return renderPdfFromHtml(html);
};

export const buildProjekPlanningPhotosPdfBuffer = async (
    projek: ProjekPlanningRow
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("projek_planning_photos_report.njk");

    // Enrich foto_items: download dari GDrive sebagai base64 dan tambahkan label
    const enrichedFotoItems = await Promise.all(
        (projek.foto_items || []).map(async (foto) => {
            const base64 = await gdriveUrlToBase64(foto.link_foto);
            const label = PHOTO_POINT_LABELS[foto.item_index] ?? `Titik ${foto.item_index}`;
            return { ...foto, base64, label };
        })
    );

    const skip_bm_approval = ["BATAM"].includes(String(projek.cabang ?? "").trim().toUpperCase());

    const html = await renderHtmlTemplate(templatePath, {
        projek: { ...projek, foto_items: enrichedFotoItems },
        skip_bm_approval,
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        alfamart_logo_path: staticAssetPath("Alfamart-Emblem.png"),
        sparta_logo_path: staticAssetPath("Building-Logo.png"),
        generated_at: formatDateIndonesia(new Date().toISOString())
    });

    return renderPdfFromHtml(html);
};
