import { PDFDocument as PdfLibDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { InstruksiLapanganRow, InstruksiLapanganItemRow, TokoRow } from "./instruksi-lapangan.repository";

type BuildInstruksiLapanganPdfInput = {
    instruksiLapangan: InstruksiLapanganRow;
    items: InstruksiLapanganItemRow[];
    toko: TokoRow;
};

const rupiah = (value: number | string): string => {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value) || 0);
};

const formatVolume = (value: number | string | null | undefined): string => {
    const raw = String(value ?? "").trim();
    if (!raw) return "0";
    const normalized = raw.replace(",", ".");
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return raw;
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(numeric);
};

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const formatDateIndonesia = (value?: string | null): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const formatDateTimeIndonesia = (value?: string | null): string => {
    if (!value) return "Waktu tidak tersedia";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm} WIB`;
};

const approvalDetails = (nameOrEmail?: string | null, approvedAt?: string | null, catatan?: string | null): string => {
    const identity = (nameOrEmail ?? "").trim();
    if (!identity) {
        return "<div class='approval-details'><div class='approval-date'>&nbsp;</div><div class='approval-name'>( _________________ )</div></div>";
    }
    const noteHtml = catatan ? `<div class="approval-note" style="font-size: 8px; color: #666; font-style: italic; margin-top: 2px;">"${catatan}"</div>` : "";
    return `<div class="approval-details"><div class="approval-date">${formatDateTimeIndonesia(approvedAt)}</div><div class="approval-name">( ${identity} )</div>${noteHtml}</div>`;
};

const isRejectedStatus = (status?: string | null): boolean =>
    String(status ?? "").toUpperCase().includes("DITOLAK");

const formatNomorUlok = (raw?: string | null): string => {
    const value = String(raw ?? "").trim();
    if (!value) return "";
    const clean = value.replace(/-/g, "");
    if (clean.length === 13 && clean.endsWith("R")) {
        return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12)}`;
    }
    if (clean.length === 12) {
        return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
    }
    return value;
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
            const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
            const base64 = fs.readFileSync(assetPath).toString("base64");
            return `data:${mimeType};base64,${base64}`;
        }
    }
    return "";
};

const buildGroupedItems = (items: InstruksiLapanganItemRow[]) => {
    const grouped = new Map<string, any>();
    for (const item of items) {
        const safeCategory = String(item.kategori_pekerjaan ?? "").trim() || "LAIN-LAIN";
        const safeJenisPekerjaan = String(item.jenis_pekerjaan ?? "").trim() || "-";
        const key = safeCategory;
        if (!grouped.has(key)) {
            grouped.set(key, { category: safeCategory, items: [], subTotalMaterial: 0, subTotalUpah: 0, subTotalHarga: 0 });
        }
        const group = grouped.get(key)!;
        group.items.push({
            jenisPekerjaan: safeJenisPekerjaan,
            satuan: item.satuan,
            volume: formatVolume(item.volume),
            hargaMaterialFormatted: rupiah(item.harga_material),
            hargaUpahFormatted: rupiah(item.harga_upah),
            totalMaterialFormatted: rupiah(item.total_material),
            totalUpahFormatted: rupiah(item.total_upah),
            totalHargaFormatted: rupiah(item.total_harga),
            catatan: item.catatan ?? ""
        });
        group.subTotalMaterial += Number(item.total_material || 0);
        group.subTotalUpah += Number(item.total_upah || 0);
        group.subTotalHarga += Number(item.total_harga || 0);
    }
    return Array.from(grouped.values()).map((group) => ({
        ...group,
        subTotalMaterialFormatted: rupiah(group.subTotalMaterial),
        subTotalUpahFormatted: rupiah(group.subTotalUpah),
        subTotalHargaFormatted: rupiah(group.subTotalHarga),
    }));
};

const normalizeNoPpnText = (value?: string | null): string => String(value ?? "").trim().toUpperCase();

const isNoPpnArea = (toko: { cabang?: string | null; nama_toko?: string | null; alamat?: string | null }): boolean => {
    const identity = [
        toko.cabang,
        toko.nama_toko,
        toko.alamat,
    ].map(normalizeNoPpnText);

    return identity.some(value => value === "BATAM" || value === "BINTAN" || /\bBATAM\b|\bBINTAN\b/.test(value));
};

const computeRecapTotals = (total: number, noPpn = false) => {
    const roundedDown = Math.floor(total / 10000) * 10000;
    const ppn = noPpn ? 0 : roundedDown * 0.11;
    const finalTotal = roundedDown + ppn;
    return { roundedDown, ppn, finalTotal };
};

export const buildInstruksiLapanganPdfBuffer = async (input: BuildInstruksiLapanganPdfInput): Promise<Buffer> => {
    const total = input.items.reduce((acc, item) => acc + Number(item.total_harga || 0), 0);
    const noPpn = isNoPpnArea(input.toko);
    const recap = computeRecapTotals(total, noPpn);
    const templatePath = await resolveTemplatePath("instruksi_lapangan_report.njk");

    const isRejected = isRejectedStatus(input.instruksiLapangan.status);
    const html = await renderHtmlTemplate(templatePath, {
        data: {
            NomorUlok: formatNomorUlok(input.toko.nomor_ulok),
            nama_toko: input.toko.nama_toko ?? "",
            Proyek: input.toko.proyek ?? "",
            Cabang: input.toko.cabang ?? "",
            Alamat: input.toko.alamat ?? "",
            LingkupPekerjaan: input.toko.lingkup_pekerjaan ?? "",
        },
        grouped_items_list: buildGroupedItems(input.items),
        grand_total: rupiah(total),
        pembulatan: rupiah(recap.roundedDown),
        ppn: rupiah(recap.ppn),
        final_grand_total: rupiah(recap.finalTotal),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        tanggal_pengajuan: formatDateIndonesia(input.instruksiLapangan.created_at),
        nama_pt: input.toko.nama_kontraktor || "NAMA PT. KONTRAKTOR TIDAK ADA",
        is_batam_branch: noPpn,
        creator_details: approvalDetails(input.instruksiLapangan.email_pembuat, input.instruksiLapangan.created_at),
        coordinator_approval_details: isRejected
            ? approvalDetails()
            : approvalDetails(
                input.instruksiLapangan.pemberi_persetujuan_koordinator,
                input.instruksiLapangan.waktu_persetujuan_koordinator,
                input.instruksiLapangan.catatan_persetujuan_koordinator
            ),
        manager_approval_details: isRejected
            ? approvalDetails()
            : approvalDetails(
                input.instruksiLapangan.pemberi_persetujuan_manager,
                input.instruksiLapangan.waktu_persetujuan_manager,
                input.instruksiLapangan.catatan_persetujuan_manager
            ),
    });

    return renderPdfFromHtml(html);
};

export const buildInstruksiLapanganRecapPdfBuffer = async (input: BuildInstruksiLapanganPdfInput): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("instruksi_lapangan_recap_report.njk");
    const grouped = new Map<string, { material: number; upah: number; total: number }>();

    for (const item of input.items) {
        const key = item.kategori_pekerjaan;
        if (!grouped.has(key)) {
            grouped.set(key, { material: 0, upah: 0, total: 0 });
        }
        const row = grouped.get(key)!;
        row.material += Number(item.total_material || 0);
        row.upah += Number(item.total_upah || 0);
        row.total += Number(item.total_harga || 0);
    }

    const category_totals_list = Array.from(grouped.entries()).map(([name, value]) => ({
        name,
        materialFormatted: rupiah(value.material),
        upahFormatted: rupiah(value.upah),
        totalFormatted: rupiah(value.total),
        totalRaw: value.total,
    }));

    const grandTotal = category_totals_list.reduce((acc, row) => acc + row.totalRaw, 0);
    const recap = computeRecapTotals(grandTotal, isNoPpnArea(input.toko));

    const html = await renderHtmlTemplate(templatePath, {
        data: {
            NomorUlok: formatNomorUlok(input.toko.nomor_ulok),
            nama_toko: input.toko.nama_toko ?? "",
            Proyek: input.toko.proyek ?? "",
            Cabang: input.toko.cabang ?? "",
            Alamat: input.toko.alamat ?? "",
            LingkupPekerjaan: input.toko.lingkup_pekerjaan ?? "",
        },
        category_totals_list,
        grand_total_formatted: rupiah(grandTotal),
        pembulatan_formatted: rupiah(recap.roundedDown),
        ppn_formatted: rupiah(recap.ppn),
        final_total_formatted: rupiah(recap.finalTotal),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        tanggal_pengajuan: formatDateIndonesia(input.instruksiLapangan.created_at),
        nama_pt: input.toko.nama_kontraktor || "NAMA PT. KONTRAKTOR TIDAK ADA",
    });

    return renderPdfFromHtml(html);
};

export const mergePdfBuffers = async (pdfBuffers: Buffer[]): Promise<Buffer> => {
    const merged = await PdfLibDocument.create();
    for (const pdfBuffer of pdfBuffers) {
        if (!pdfBuffer || pdfBuffer.length === 0) continue;
        const source = await PdfLibDocument.load(pdfBuffer);
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) merged.addPage(page);
    }
    const bytes = await merged.save();
    return Buffer.from(bytes);
};
