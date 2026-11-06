import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import fs from "fs";
import path from "path";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { RabRow, RabItemRow, TokoJoinRow } from "./rab.repository";

type BuildRabPdfInput = {
    rab: RabRow;
    items: RabItemRow[];
    toko: TokoJoinRow;
    alamat_cabang?: string | null;
    hideCoordinatorInfo?: boolean; // true = untuk kontraktor/direktur kontraktor
};

const rupiah = (value: number | string | null | undefined): string => {
    const numeric = Number(value ?? 0);
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number.isFinite(numeric) ? numeric : 0);
};

const numericValue = (value: number | string | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim().replace(/\./g, "").replace(",", ".");
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatVolume = (value: number | string | null | undefined): string => {
    const raw = String(value ?? "").trim();
    if (!raw) return "0";
    const normalized = raw.replace(",", ".");
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return raw;
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(numeric);
};

const formatPlainNumber = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value).trim();
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(numeric);
};

const formatBeanspotType = (value?: string | null): string => {
    const normalized = String(value ?? "").trim().toUpperCase();
    const labels: Record<string, string> = {
        TIDAK: "Tidak",
        ADVANCE: "Advance",
        MEDIUM: "Medium",
        RTD_ONLY: "RTD Only",
    };
    return labels[normalized] ?? "-";
};

const formatYesNoNullable = (value?: boolean | null): string => {
    if (value === true) return "Ya";
    if (value === false) return "Tidak";
    return "-";
};

const buildCoordinatorInfo = (rab: RabRow) => {
    const hasData = Boolean(rab.beanspot_type) || rab.is_hth !== null || rab.is_fasade !== null;
    const meter = formatPlainNumber(rab.hth_meter);

    return {
        show: hasData,
        beanspot: formatBeanspotType(rab.beanspot_type),
        hth: rab.is_hth === true ? `Ya${meter ? `, ${meter} meter` : ""}` : formatYesNoNullable(rab.is_hth),
        fasade: formatYesNoNullable(rab.is_fasade),
    };
};

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dayNames = [
    "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
];

const monthToRoman = (month: number): string => {
    const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    return romans[month - 1] ?? "I";
};

const buildSphDocumentNumber = (
    noSph: number | null | undefined,
    dateValue?: string | null
): string => {
    const numberPart = String(Math.max(Number(noSph ?? 0), 1)).padStart(4, "0");
    const baseDate = dateValue ? new Date(dateValue) : new Date();
    const safeDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
    const monthRoman = monthToRoman(safeDate.getMonth() + 1);
    const year = safeDate.getFullYear();
    return `${numberPart}/SPH/${monthRoman}/${year}`;
};

const formatDateIndonesia = (value?: string | null): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const formatDayDateIndonesia = (value?: string | null): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const formatDateTimeIndonesia = (value?: string | null): string => {
    if (!value) return "Waktu tidak tersedia";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm} WIB`;
};

const formatApprovalDateTimeIndonesia = (value?: string | null): string => {
    if (!value) return "";
    return formatDateTimeIndonesia(value);
};

const approvalDetails = (nameOrEmail?: string | null, approvedAt?: string | null): string => {
    const identity = (nameOrEmail ?? "").trim();
    if (!identity) {
        return "<div class=\"approval-details\"><strong>( _________________ )</strong></div>";
    }

    return `<div class="approval-details"><strong>( ${identity} )</strong><br>Disetujui pada: ${formatDateTimeIndonesia(approvedAt)}</div>`;
};

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

const terbilangInt = (angka: number): string => {
    const huruf = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
    let hasil = "";
    if (angka < 12) {
        hasil = huruf[angka];
    } else if (angka < 20) {
        hasil = terbilangInt(angka - 10) + " Belas";
    } else if (angka < 100) {
        hasil = terbilangInt(Math.floor(angka / 10)) + " Puluh " + terbilangInt(angka % 10);
    } else if (angka < 200) {
        hasil = "Seratus " + terbilangInt(angka - 100);
    } else if (angka < 1000) {
        hasil = terbilangInt(Math.floor(angka / 100)) + " Ratus " + terbilangInt(angka % 100);
    } else if (angka < 2000) {
        hasil = "Seribu " + terbilangInt(angka - 1000);
    } else if (angka < 1000000) {
        hasil = terbilangInt(Math.floor(angka / 1000)) + " Ribu " + terbilangInt(angka % 1000);
    } else if (angka < 1000000000) {
        hasil = terbilangInt(Math.floor(angka / 1000000)) + " Juta " + terbilangInt(angka % 1000000);
    } else if (angka < 1000000000000) {
        hasil = terbilangInt(Math.floor(angka / 1000000000)) + " Milyar " + terbilangInt(angka % 1000000000);
    }
    return hasil.trim();
};

const terbilang = (angka: number): string => {
    return `${terbilangInt(angka)} Rupiah`;
};

const staticAssetPath = (filename: string): string => {
    const candidates = [
        // Works for dev and build: src/modules/rab -> src/image, dist/modules/rab -> dist/image
        path.resolve(__dirname, "../../image", filename),
        // Build mode (dist): dist/modules/rab -> src/image
        path.resolve(__dirname, "../../../src/image", filename),
        // Legacy fallback
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

const buildGroupedItems = (items: RabItemRow[]) => {
    const grouped = new Map<string, {
        category: string;
        items: Array<Record<string, string | number>>;
        subTotalMaterial: number;
        subTotalUpah: number;
        subTotalHarga: number;
    }>();

    for (const item of items) {
        const safeCategory = String(item.kategori_pekerjaan ?? "").trim() || "LAIN-LAIN";
        const safeJenisPekerjaan = String(item.jenis_pekerjaan ?? "").trim() || "-";
        const key = safeCategory;
        if (!grouped.has(key)) {
            grouped.set(key, {
                category: safeCategory,
                items: [],
                subTotalMaterial: 0,
                subTotalUpah: 0,
                subTotalHarga: 0,
            });
        }

        const group = grouped.get(key)!;
        group.items.push({
            jenisPekerjaan: safeJenisPekerjaan,
            satuan: item.satuan,
            volumeFormatted: formatVolume(item.volume),
            hargaMaterialFormatted: rupiah(item.harga_material),
            hargaUpahFormatted: rupiah(item.harga_upah),
            totalMaterialFormatted: rupiah(item.total_material),
            totalUpahFormatted: rupiah(item.total_upah),
            totalHargaFormatted: rupiah(item.total_harga),
            catatan: String(item.catatan ?? "").trim(),
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

const isBatamBranch = (cabang?: string | null): boolean => {
    const normalizedCabang = String(cabang ?? "").trim().toUpperCase();
    return normalizedCabang === "BATAM" || normalizedCabang === "BINTAN";
};

const isBogorBranch = (cabang?: string | null): boolean => {
    const normalizedCabang = String(cabang ?? "").trim().toUpperCase();
    return normalizedCabang === "BOGOR" || /\bBOGOR\b/.test(normalizedCabang);
};

const computeRecapTotals = (nonSboTotal: number, cabang?: string | null) => {
    const roundedDown = Math.floor(nonSboTotal / 10000) * 10000;
    const ppn = isBatamBranch(cabang) ? 0 : roundedDown * 0.11;
    const finalTotal = roundedDown + ppn;
    return { roundedDown, ppn, finalTotal };
};

const resolvePdfTotals = (input: BuildRabPdfInput, itemTotal: number) => {
    if (itemTotal > 0) {
        return {
            sourceTotal: itemTotal,
            ...computeRecapTotals(itemTotal, input.toko.cabang),
        };
    }

    const headerTotal = numericValue(input.rab.grand_total);
    const headerNonSbo = numericValue(input.rab.grand_total_non_sbo);
    const headerFinal = numericValue(input.rab.grand_total_final);
    const sourceTotal = headerTotal || headerNonSbo || headerFinal;
    const roundedDown = headerNonSbo > 0
        ? Math.floor(headerNonSbo / 10000) * 10000
        : Math.floor(sourceTotal / 10000) * 10000;
    const computedPpn = isBatamBranch(input.toko.cabang) ? 0 : roundedDown * 0.11;
    const finalTotal = headerFinal || (roundedDown + computedPpn);
    const ppn = Math.max(0, finalTotal - roundedDown);

    return {
        sourceTotal,
        roundedDown,
        ppn,
        finalTotal,
    };
};

/** PDF detail item (Non-SBO atau semua, tergantung items yang dikirim). */
export const buildRabPdfBuffer = async (input: BuildRabPdfInput): Promise<Buffer> => {
    const total = input.items.reduce((acc, item) => acc + Number(item.total_harga || 0), 0);
    const recap = resolvePdfTotals(input, total);
    const templatePath = await resolveTemplatePath("rab_report.njk");
    const isBatam = isBatamBranch(input.toko.cabang);
    const isBogor = isBogorBranch(input.toko.cabang);
    const coordinatorInfo = buildCoordinatorInfo(input.rab);
    
    // Hide coordinator info jika untuk kontraktor/direktur kontraktor
    const shouldShowCoordinatorInfo = !input.hideCoordinatorInfo && coordinatorInfo.show;

    const html = await renderHtmlTemplate(templatePath, {
        data: {
            NomorUlok: formatNomorUlok(input.toko.nomor_ulok),
            nama_toko: input.toko.nama_toko ?? "",
            Proyek: input.toko.proyek ?? "",
            Cabang: input.toko.cabang ?? "",
            Alamat: input.toko.alamat ?? "",
            LingkupPekerjaan: input.toko.lingkup_pekerjaan ?? "",
            DurasiPekerjaan: input.rab.durasi_pekerjaan ?? "",
            KategoriLokasi: input.rab.kategori_lokasi ?? "",
            LuasAreaParkir: input.rab.luas_area_parkir ?? "",
            LuasAreaSales: input.rab.luas_area_sales ?? "",
            LuasGudang: input.rab.luas_gudang ?? "",
            LuasBangunan: input.rab.luas_bangunan ?? "",
            LuasAreaTerbuka: input.rab.luas_area_terbuka ?? "",
            LuasTerbangun: input.rab.luas_terbangun ?? "",
        },
        grouped_items_list: buildGroupedItems(input.items),
        grand_total: rupiah(recap.sourceTotal),
        pembulatan: rupiah(recap.roundedDown),
        ppn: rupiah(recap.ppn),
        final_grand_total: rupiah(recap.finalTotal),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        tanggal_pengajuan: formatDateIndonesia(input.rab.created_at),
        coordinator_info: shouldShowCoordinatorInfo ? coordinatorInfo : { show: false },
        nama_pt: input.rab.nama_pt || "NAMA PT. KONTRAKTOR TIDAK ADA",
        is_batam_branch: isBatam,
        is_bogor_branch: isBogor,
        creator_details: approvalDetails(input.rab.email_pembuat, input.rab.created_at),
        coordinator_approval_details: approvalDetails(
            input.rab.nama_persetujuan_koordinator || input.rab.pemberi_persetujuan_koordinator,
            input.rab.waktu_persetujuan_koordinator,
        ),
        manager_approval_details: approvalDetails(
            input.rab.nama_persetujuan_manager || input.rab.pemberi_persetujuan_manager,
            input.rab.waktu_persetujuan_manager,
        ),
    });

    return renderPdfFromHtml(html);
};

/** PDF Rekapitulasi - ringkasan total per kategori pekerjaan. */
export const buildRecapPdfBuffer = async (input: BuildRabPdfInput): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("rab_recap_report.njk");
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

    const itemGrandTotal = category_totals_list.reduce((acc, row) => acc + row.totalRaw, 0);
    const recap = resolvePdfTotals(input, itemGrandTotal);
    const hasFallbackTotal = category_totals_list.length === 0 && recap.sourceTotal > 0;
    const resolvedCategoryTotals = hasFallbackTotal
        ? [{
            name: "TOTAL RAB",
            materialFormatted: rupiah(0),
            upahFormatted: rupiah(0),
            totalFormatted: rupiah(recap.sourceTotal),
            totalRaw: recap.sourceTotal,
        }]
        : category_totals_list;

    const html = await renderHtmlTemplate(templatePath, {
        data: {
            NomorUlok: formatNomorUlok(input.toko.nomor_ulok),
            nama_toko: input.toko.nama_toko ?? "",
            Proyek: input.toko.proyek ?? "",
            Cabang: input.toko.cabang ?? "",
            Alamat: input.toko.alamat ?? "",
            LingkupPekerjaan: input.toko.lingkup_pekerjaan ?? "",
            DurasiPekerjaan: input.rab.durasi_pekerjaan ?? "",
            KategoriLokasi: input.rab.kategori_lokasi ?? "",
        },
        category_totals_list: resolvedCategoryTotals,
        grand_total_formatted: rupiah(recap.sourceTotal),
        pembulatan_formatted: rupiah(recap.roundedDown),
        ppn_formatted: rupiah(recap.ppn),
        final_total_formatted: rupiah(recap.finalTotal),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        tanggal_pengajuan: formatDateIndonesia(input.rab.created_at),
        nama_pt: input.rab.nama_pt || "NAMA PT. KONTRAKTOR TIDAK ADA",
    });

    return renderPdfFromHtml(html);
};

export const generateSphPdf = async (
    input: BuildRabPdfInput & { logoOverride?: string | null }
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("rab_sph_report.njk");

    const total = input.items.reduce((acc, item) => acc + Number(item.total_harga || 0), 0);
    const recap = resolvePdfTotals(input, total);
    const finalTotal = recap.finalTotal;

    const referenceDate = input.rab.waktu_persetujuan_direktur || input.rab.created_at;
    const tenderDate = formatDateIndonesia(referenceDate);
    const tenderDayDate = formatDayDateIndonesia(referenceDate);
    const tanggalSurat = formatDateIndonesia(referenceDate);
    const coordinatorInfo = buildCoordinatorInfo(input.rab);

    const html = await renderHtmlTemplate(templatePath, {
        nomor_sph: buildSphDocumentNumber(input.rab.no_sph, referenceDate),
        langsung: true,
        proyek: input.toko.proyek || "Alfamart",
        lingkup_pekerjaan: input.toko.lingkup_pekerjaan || "Sipil",
        cabang: input.toko.cabang || "",
        nama_toko: input.toko.nama_toko || "", 
        alamat_toko: input.toko.alamat || "",
        alamat_cabang: input.alamat_cabang ?? "",
        grand_total: rupiah(finalTotal),
        grand_total_terbilang: terbilang(finalTotal),
        tanggal_surat: tenderDate,
        hari_tanggal_surat: tenderDayDate,
        tanggal_persetujuan: input.rab.waktu_persetujuan_direktur 
            ? formatDateIndonesia(input.rab.waktu_persetujuan_direktur)
            : formatDateIndonesia(input.rab.created_at),
        nama_pt: input.rab.nama_pt || "PT. ONTOSENO BAYUAJI",
        nama_direktur: input.rab.nama_persetujuan_direktur
            || input.rab.nama_lengkap_persetujuan_direktur
            || input.rab.pemberi_persetujuan_direktur
            || "__________________",
        direktur_approval_time: formatApprovalDateTimeIndonesia(input.rab.waktu_persetujuan_direktur),
        no_polis: input.rab.no_polis ?? "",
        berlaku_polis: input.rab.berlaku_polis ?? "",
        coordinator_info: coordinatorInfo,
        fallback_logo: input.logoOverride || input.rab.logo || "",
        watermark_logo_path: staticAssetPath("Building-Logo.png")
    });

    return renderPdfFromHtml(html);
};

/** Merge PDF valid (bukan concat byte mentah) untuk meniru flow backend server. */
export const mergePdfBuffers = async (pdfBuffers: Buffer[]): Promise<Buffer> => {
    const merged = await PdfLibDocument.create();

    for (const pdfBuffer of pdfBuffers) {
        if (!pdfBuffer || pdfBuffer.length === 0) {
            continue;
        }

        const source = await PdfLibDocument.load(pdfBuffer);
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) {
            merged.addPage(page);
        }
    }

    const bytes = await merged.save();
    return Buffer.from(bytes);
};

export const extractFirstPdfPageBuffer = async (pdfBuffer: Buffer): Promise<Buffer | null> => {
    if (!pdfBuffer || pdfBuffer.length === 0) return null;

    const source = await PdfLibDocument.load(pdfBuffer);
    if (source.getPageCount() === 0) return null;

    const singlePage = await PdfLibDocument.create();
    const [firstPage] = await singlePage.copyPages(source, [0]);
    singlePage.addPage(firstPage);

    const bytes = await singlePage.save();
    return Buffer.from(bytes);
};

const extractSinglePdfPageBuffer = async (pdfBuffer: Buffer, pageIndex: number): Promise<Buffer | null> => {
    if (!pdfBuffer || pdfBuffer.length === 0) return null;

    const source = await PdfLibDocument.load(pdfBuffer);
    const pageCount = source.getPageCount();
    if (pageCount === 0) return null;

    const safeIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
    const singlePage = await PdfLibDocument.create();
    const [page] = await singlePage.copyPages(source, [safeIndex]);
    singlePage.addPage(page);

    const bytes = await singlePage.save();
    return Buffer.from(bytes);
};

const normalizePdfText = (text: string): string =>
    text.toUpperCase().replace(/\s+/g, " ").trim();

const hasMeaningfulPdfText = (text: string): boolean => {
    const withoutPageMarker = normalizePdfText(text)
        .replace(/--\s*\d+\s+OF\s+\d+\s*--/g, "")
        .replace(/[-\s]+/g, "")
        .trim();
    return withoutPageMarker.length > 0;
};

const extractNearestNonBlankPageBefore = async (
    pdfBuffer: Buffer,
    parser: PDFParse,
    pageIndex: number
): Promise<Buffer | null> => {
    for (let previousPageIndex = pageIndex - 1; previousPageIndex >= 0; previousPageIndex -= 1) {
        const previousResult = await parser.getText({ partial: [previousPageIndex + 1] });
        if (hasMeaningfulPdfText(previousResult.text ?? "")) {
            return await extractSinglePdfPageBuffer(pdfBuffer, previousPageIndex);
        }
    }

    return null;
};

export const extractMateraiCoverPageBuffer = async (pdfBuffer: Buffer): Promise<Buffer | null> => {
    if (!pdfBuffer || pdfBuffer.length === 0) return null;

    const source = await PdfLibDocument.load(pdfBuffer);
    const pageCount = source.getPageCount();
    if (pageCount === 0) return null;

    const parser = new PDFParse({ data: pdfBuffer });
    try {
        let fallbackRabPageIndex: number | null = null;
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const result = await parser.getText({ partial: [pageNumber] });
            const text = normalizePdfText(result.text ?? "");
            if (!text.includes("RENCANA ANGGARAN BIAYA")) continue;

            const pageIndex = pageNumber - 1;
            if (text.includes("NOMOR ULOK")) {
                return await extractNearestNonBlankPageBefore(pdfBuffer, parser, pageIndex);
            }
            if (fallbackRabPageIndex === null) {
                fallbackRabPageIndex = pageIndex;
            }
        }

        if (fallbackRabPageIndex !== null) {
            return await extractNearestNonBlankPageBefore(pdfBuffer, parser, fallbackRabPageIndex);
        }
    } finally {
        await parser.destroy();
    }

    const fallbackParser = new PDFParse({ data: pdfBuffer });
    try {
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const result = await fallbackParser.getText({ partial: [pageNumber] });
            if (hasMeaningfulPdfText(result.text ?? "")) {
                return await extractSinglePdfPageBuffer(pdfBuffer, pageNumber - 1);
            }
        }
    } finally {
        await fallbackParser.destroy();
    }

    return null;
};
