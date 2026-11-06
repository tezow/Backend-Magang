import fs from "fs";
import path from "path";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { PengajuanSpkRow } from "./spk.repository";

type BuildSpkPdfInput = {
    pengajuan: PengajuanSpkRow;
    tokoNama: string;
    tokoKode: string;
    tokoAlamat: string;
    tokoCabang: string;
};

const JAKARTA_TIME_ZONE = "Asia/Jakarta";

const formatTanggal = (isoString: string): string => {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return String(isoString);
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: JAKARTA_TIME_ZONE,
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(d);
};

const formatTanggalWib = (isoString?: string | null): string => {
    if (!isoString) return "Waktu tidak tersedia";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "Waktu tidak tersedia";
    return `${new Intl.DateTimeFormat("id-ID", {
        timeZone: JAKARTA_TIME_ZONE,
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(d).replace(".", ":")} WIB`;
};

const staticAssetPath = (filename: string): string => {
    const candidates = [
        path.resolve(__dirname, "../../image", filename),
        path.resolve(__dirname, "../../../src/image", filename),
        path.resolve(__dirname, "../../../../server/static", filename),
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


const isNoPpnArea = (cabang?: string | null): boolean => {
    const normalized = String(cabang ?? "").trim().toUpperCase();
    return normalized === "BATAM" || normalized === "BINTAN";
};

const terbilang = (angka: number): string => {
    const satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

    if (angka < 0) return "Minus " + terbilang(-angka);
    if (angka < 12) return satuan[angka];
    if (angka < 20) return satuan[angka - 10] + " Belas";
    if (angka < 100) return satuan[Math.floor(angka / 10)] + " Puluh" + (angka % 10 ? " " + satuan[angka % 10] : "");
    if (angka < 200) return "Seratus" + (angka - 100 ? " " + terbilang(angka - 100) : "");
    if (angka < 1000) return satuan[Math.floor(angka / 100)] + " Ratus" + (angka % 100 ? " " + terbilang(angka % 100) : "");
    if (angka < 2000) return "Seribu" + (angka - 1000 ? " " + terbilang(angka - 1000) : "");
    if (angka < 1_000_000) return terbilang(Math.floor(angka / 1000)) + " Ribu" + (angka % 1000 ? " " + terbilang(angka % 1000) : "");
    if (angka < 1_000_000_000) return terbilang(Math.floor(angka / 1_000_000)) + " Juta" + (angka % 1_000_000 ? " " + terbilang(angka % 1_000_000) : "");
    if (angka < 1_000_000_000_000) return terbilang(Math.floor(angka / 1_000_000_000)) + " Miliar" + (angka % 1_000_000_000 ? " " + terbilang(angka % 1_000_000_000) : "");
    return terbilang(Math.floor(angka / 1_000_000_000_000)) + " Triliun" + (angka % 1_000_000_000_000 ? " " + terbilang(angka % 1_000_000_000_000) : "");
};

export const buildSpkPdfBuffer = async (input: BuildSpkPdfInput): Promise<Buffer> => {
    const p = input.pengajuan;
    const startFormatted = formatTanggal(p.waktu_mulai);
    const endFormatted = formatTanggal(p.waktu_selesai);
    const today = formatTanggal(p.created_at || new Date().toISOString());
    const displayGrandTotal = Number(p.grand_total);
    const totalFormatted = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(displayGrandTotal);
    const isBatam = isNoPpnArea(input.tokoCabang);
    const initiatorRole = isBatam ? "Branch Building Coordinator" : "Branch Building & Maintenance Manager";

    const approvalBlock = (identity?: string | null, approvedAt?: string | null): string => {
        const cleanedIdentity = (identity ?? "").trim();
        if (!cleanedIdentity) return "";
        const approved = `Disetujui pada: ${formatTanggalWib(approvedAt)}`;
        return `
    <div class="approval-details">
        <strong>( ${cleanedIdentity} )</strong><br>
        <span class="timestamp">${approved}</span>
    </div>
    `;
    };

    const logoPath = staticAssetPath("Alfamart-Emblem.png");
    const templatePath = await resolveTemplatePath("spk_report.njk");

    const html = await renderHtmlTemplate(templatePath, {
        logo_path: logoPath,
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        spk_location: input.tokoCabang,
        spk_date: today,
        spk_number: p.nomor_spk || "____/PROPNDEV-____/____/____",
        par_number: p.par || "____/PROPNDEV-____/____/____",
        contractor_name: p.nama_kontraktor,
        lingkup_pekerjaan: p.lingkup_pekerjaan,
        proyek: p.proyek,
        project_address: input.tokoAlamat,
        nama_toko: input.tokoNama,
        kode_toko: input.tokoKode,
        total_cost_formatted: totalFormatted,
        terbilang: terbilang(Math.floor(displayGrandTotal)),
        start_date: startFormatted,
        end_date: endFormatted,
        duration: p.durasi,
        initiator_details_html: approvalBlock(p.email_pembuat, p.created_at),
        approver_details_html: approvalBlock(p.approver_email, p.waktu_persetujuan),
        initiator_role_title: initiatorRole,
    });

    return renderPdfFromHtml(html);
};
