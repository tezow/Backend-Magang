import fs from "fs";
import path from "path";
import { resolveDriveImageDataUrl } from "../../common/drive-image";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { InstruksiLapanganItemRow } from "../instruksi-lapangan/instruksi-lapangan.repository";
import type { OpnameFinalDetail, OpnameFinalItemRow } from "./opname-final.repository";
import type { RabItemRow, RabRow } from "../rab/rab.repository";
import {
    buildFinancialSummary as buildSharedFinancialSummary,
    calculateEffectiveInstruksiLapanganAmount,
    calculateOpnameFinalFinancials,
    isNoPpnArea,
} from "./opname-final.financial";

const rupiah = (value: number): string => {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value) || 0);
};

const buildFinancialSummary = (total: number, direction: "down" | "up", noPpn = false) => {
    const summary = buildSharedFinancialSummary(total, direction, noPpn);

    return {
        ...summary,
        total_formatted: rupiah(summary.total),
        pembulatan_formatted: rupiah(summary.pembulatan),
        ppn_formatted: rupiah(summary.ppn),
        grand_total_formatted: rupiah(summary.grand_total)
    };
};

const formatVolume = (value: number | string | null | undefined): string => {
    const raw = String(value ?? "").trim();
    if (!raw) return "0";
    const normalized = raw.replace(",", ".");
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return raw;
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(numeric);
};

const toNumber = (value: string | number | null | undefined): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

type GroupSummary = ReturnType<typeof buildFinancialSummary>;

type GroupedItems<T> = Array<{ category: string; items: T[]; summary: GroupSummary }>;
type PhotoResolver = (rawLink?: string | null) => Promise<string | null>;

const mapWithConcurrency = async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(concurrency, 1), items.length);

    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(workers);
    return results;
};

const sortOpnameItemsByRabOrder = (items: OpnameFinalItemRow[]): OpnameFinalItemRow[] => {
    return [...items].sort((left, right) => {
        const leftRabId = Number(left.rab_item?.id ?? left.id_rab_item ?? Number.MAX_SAFE_INTEGER);
        const rightRabId = Number(right.rab_item?.id ?? right.id_rab_item ?? Number.MAX_SAFE_INTEGER);

        if (leftRabId !== rightRabId) return leftRabId - rightRabId;

        const leftIlId = Number(left.instruksi_lapangan_item?.id ?? left.id_instruksi_lapangan_item ?? Number.MAX_SAFE_INTEGER);
        const rightIlId = Number(right.instruksi_lapangan_item?.id ?? right.id_instruksi_lapangan_item ?? Number.MAX_SAFE_INTEGER);
        if (leftIlId !== rightIlId) return leftIlId - rightIlId;

        return Number(left.id) - Number(right.id);
    });
};

const sumOpnameTotalSelisih = (items: OpnameFinalItemRow[]): number => {
    return items.reduce((acc, item) => acc + toNumber(item.total_selisih), 0);
};

const sumRabTotalHarga = (items: RabItemRow[]): number => {
    return items.reduce((acc, item) => acc + toNumber(item.total_harga), 0);
};

const sumInstruksiLapanganTotalHarga = (items: InstruksiLapanganItemRow[]): number => {
    return items.reduce((acc, item) => acc + toNumber(item.total_harga), 0);
};

const mapOpnameItemsByInstruksiLapanganId = (opnameItems: OpnameFinalItemRow[]): Map<number, OpnameFinalItemRow> => {
    const opnameByInstruksiId = new Map<number, OpnameFinalItemRow>();
    for (const opnameItem of opnameItems) {
        const instruksiId = Number(opnameItem.id_instruksi_lapangan_item ?? 0);
        if (instruksiId > 0) opnameByInstruksiId.set(instruksiId, opnameItem);
    }

    return opnameByInstruksiId;
};

type OpnameItemView = {
    jenis_pekerjaan: string;
    satuan: string;
    volume_rab: string;
    volume_akhir: string;
    selisih_volume: string;
    total_harga_rab_formatted: string;
    total_selisih_formatted: string;
    foto_data_url: string | null;
    catatan: string | null;
};

type InstruksiLapanganItemView = {
    id: number;
    jenis_pekerjaan: string;
    satuan: string;
    volume: string;
    harga_material_formatted: string;
    harga_upah_formatted: string;
    total_material_formatted: string;
    total_upah_formatted: string;
    total_harga_formatted: string;
    foto_data_url: string | null;
};

type RabItemView = {
    jenis_pekerjaan: string;
    satuan: string;
    volume_formatted: string;
    harga_material_formatted: string;
    harga_upah_formatted: string;
    total_material_formatted: string;
    total_upah_formatted: string;
    total_harga_formatted: string;
    catatan: string | null;
};

const resolveOpnameCategory = (item: OpnameFinalItemRow): string => {
    return String(item.kategori_pekerjaan ?? item.rab_item?.kategori_pekerjaan ?? "")
        .trim()
        .toUpperCase() || "LAIN-LAIN";
};

const resolveOpnameJenis = (item: OpnameFinalItemRow): string => {
    return String(item.jenis_pekerjaan ?? item.rab_item?.jenis_pekerjaan ?? "")
        .trim() || "-";
};

const resolveOpnameSatuan = (item: OpnameFinalItemRow): string => {
    return String(item.satuan ?? item.rab_item?.satuan ?? "")
        .trim() || "-";
};

const buildOpnameGroupedItems = async (
    items: OpnameFinalItemRow[],
    noPpn = false,
    resolvePhoto: PhotoResolver = resolveDriveImageDataUrl
): Promise<GroupedItems<OpnameItemView>> => {
    const grouped = new Map<string, OpnameItemView[]>();
    const totals = new Map<string, number>();

    const preparedItems = await mapWithConcurrency(items, 4, async (item) => {
        const category = resolveOpnameCategory(item);
        const totalHargaRab = toNumber(item.total_harga_rab ?? item.rab_item?.total_harga ?? 0);
        const totalSelisih = toNumber(item.total_selisih);
        return {
            category,
            totalSelisih,
            view: {
                jenis_pekerjaan: resolveOpnameJenis(item),
                satuan: resolveOpnameSatuan(item),
                volume_rab: formatVolume(item.volume_rab ?? item.rab_item?.volume ?? 0),
                volume_akhir: formatVolume(item.volume_akhir),
                selisih_volume: formatVolume(item.selisih_volume),
                total_harga_rab_formatted: rupiah(totalHargaRab),
                total_selisih_formatted: rupiah(totalSelisih),
                foto_data_url: await resolvePhoto(item.foto),
                catatan: item.catatan
            }
        };
    });

    for (const { category, totalSelisih, view } of preparedItems) {
        if (!grouped.has(category)) {
            grouped.set(category, []);
            totals.set(category, 0);
        }
        grouped.get(category)!.push(view);
        totals.set(category, (totals.get(category) ?? 0) + totalSelisih);
    }

    return Array.from(grouped.entries()).map(([category, groupedItems]) => ({
        category,
        items: groupedItems,
        summary: buildFinancialSummary(totals.get(category) ?? 0, "down", noPpn)
    }));
};

const buildInstruksiLapanganGroups = async (
    items: InstruksiLapanganItemRow[],
    opnameItems: OpnameFinalItemRow[],
    noPpn = false,
    resolvePhoto: PhotoResolver = resolveDriveImageDataUrl
): Promise<GroupedItems<InstruksiLapanganItemView>> => {
    const grouped = new Map<string, InstruksiLapanganItemView[]>();
    const totals = new Map<string, number>();
    const opnameByInstruksiId = mapOpnameItemsByInstruksiLapanganId(opnameItems);

    const preparedItems = await mapWithConcurrency(items, 4, async (item) => {
        const category = String(item.kategori_pekerjaan ?? "").trim().toUpperCase() || "LAIN-LAIN";
        const opnameItem = opnameByInstruksiId.get(Number(item.id));
        const effectiveAmount = calculateEffectiveInstruksiLapanganAmount(item, opnameItem);
        return {
            category,
            totalHarga: effectiveAmount.totalHarga,
            view: {
                id: Number(item.id),
                jenis_pekerjaan: String(item.jenis_pekerjaan ?? "").trim() || "-",
                satuan: String(item.satuan ?? "").trim() || "-",
                volume: formatVolume(effectiveAmount.volume),
                harga_material_formatted: rupiah(toNumber(item.harga_material)),
                harga_upah_formatted: rupiah(toNumber(item.harga_upah)),
                total_material_formatted: rupiah(effectiveAmount.totalMaterial),
                total_upah_formatted: rupiah(effectiveAmount.totalUpah),
                total_harga_formatted: rupiah(effectiveAmount.totalHarga),
                foto_data_url: await resolvePhoto(opnameItem?.foto),
            }
        };
    });

    for (const { category, totalHarga, view } of preparedItems) {
        if (!grouped.has(category)) {
            grouped.set(category, []);
            totals.set(category, 0);
        }
        grouped.get(category)!.push(view);
        totals.set(category, (totals.get(category) ?? 0) + totalHarga);
    }

    return Array.from(grouped.entries()).map(([category, groupedItems]) => ({
        category,
        items: groupedItems,
        summary: buildFinancialSummary(totals.get(category) ?? 0, "down", noPpn)
    }));
};

const buildRabGroupedItems = (items: RabItemRow[], noPpn = false): GroupedItems<RabItemView> => {
    const grouped = new Map<string, RabItemView[]>();
    const totals = new Map<string, number>();

    for (const item of items) {
        const category = String(item.kategori_pekerjaan ?? "").trim().toUpperCase() || "LAIN-LAIN";
        const totalHarga = toNumber(item.total_harga);
        const view: RabItemView = {
            jenis_pekerjaan: String(item.jenis_pekerjaan ?? "").trim() || "-",
            satuan: String(item.satuan ?? "").trim() || "-",
            volume_formatted: formatVolume(item.volume),
            harga_material_formatted: rupiah(toNumber(item.harga_material)),
            harga_upah_formatted: rupiah(toNumber(item.harga_upah)),
            total_material_formatted: rupiah(toNumber(item.total_material)),
            total_upah_formatted: rupiah(toNumber(item.total_upah)),
            total_harga_formatted: rupiah(totalHarga),
            catatan: item.catatan
        };

        if (!grouped.has(category)) {
            grouped.set(category, []);
            totals.set(category, 0);
        }
        grouped.get(category)!.push(view);
        totals.set(category, (totals.get(category) ?? 0) + totalHarga);
    }

    return Array.from(grouped.entries()).map(([category, groupedItems]) => ({
        category,
        items: groupedItems,
        summary: buildFinancialSummary(totals.get(category) ?? 0, "down", noPpn)
    }));
};

const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const formatDateIndonesia = (value?: string | null): string => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const formatDateTimeIndonesia = (value?: string | null): string => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm} WIB`;
};

const displayName = (name?: string | null, email?: string | null): string => {
    const explicitName = (name ?? "").trim();
    if (explicitName) return explicitName;

    const identity = (email ?? "").trim();
    if (!identity) return "";
    return identity.includes("@") ? identity.split("@")[0] : identity;
};

const approvalDetails = (name?: string | null, email?: string | null, approvedAt?: string | null): string => {
    const identity = displayName(name, email);
    if (!identity) {
        return "<div class=\"approval-details\"><div class=\"approval-date\">&nbsp;</div><div class=\"approval-name\">( _________________ )</div></div>";
    }

    return `<div class="approval-details"><div class="approval-date">${formatDateTimeIndonesia(approvedAt)}</div><div class="approval-name">( ${identity} )</div></div>`;
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

export const buildOpnameFinalPdfBuffer = async (
    detail: OpnameFinalDetail,
    instruksiLapanganItems: InstruksiLapanganItemRow[] = [],
    rabData?: { header: RabRow | null; items: RabItemRow[] }
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("opname_final_report.njk");
    const noPpn = isNoPpnArea(detail.toko);

    const grandTotalOpname = toNumber(detail.opname_final.grand_total_opname);
    const grandTotalRab = toNumber(detail.opname_final.grand_total_rab);
    const allOpnameItems = sortOpnameItemsByRabOrder(detail.items ?? []);
    const opnameItems = allOpnameItems.filter((item) => item.id_rab_item !== null);
    const kerjaTambahItems = opnameItems.filter((item) => toNumber(item.total_selisih) > 0);
    const kerjaKurangItems = opnameItems.filter((item) => toNumber(item.total_selisih) < 0);
    const photoCache = new Map<string, Promise<string | null>>();
    const resolvePhotoCached: PhotoResolver = async (rawLink) => {
        const key = String(rawLink ?? "").trim();
        if (!key) return null;
        const existing = photoCache.get(key);
        if (existing) return existing;

        const promise = resolveDriveImageDataUrl(key);
        photoCache.set(key, promise);
        return promise;
    };
    const rabItems = rabData?.items ?? [];
    const rabGrandTotalRaw = rabData?.header?.grand_total_final
        ?? rabData?.header?.grand_total_non_sbo
        ?? rabData?.header?.grand_total
        ?? null;
    const rabGrandTotal = rabGrandTotalRaw !== null && typeof rabGrandTotalRaw !== "undefined"
        ? toNumber(rabGrandTotalRaw)
        : rabItems.reduce((acc, item) => acc + toNumber(item.total_harga), 0);
    const totalOpnameSelisih = sumOpnameTotalSelisih(opnameItems);
    const totalRabItems = sumRabTotalHarga(rabItems);
    const opnameByInstruksiId = mapOpnameItemsByInstruksiLapanganId(allOpnameItems);
    const grandTotalIl = sumInstruksiLapanganTotalHarga(instruksiLapanganItems.map((item) => {
        const opnameItem = opnameByInstruksiId.get(Number(item.id));
        const effectiveAmount = calculateEffectiveInstruksiLapanganAmount(item, opnameItem);

        return {
            ...item,
            total_harga: effectiveAmount.totalHarga,
        };
    }));
    const grandTotalKerjaTambah = sumOpnameTotalSelisih(kerjaTambahItems);
    const grandTotalKerjaKurang = sumOpnameTotalSelisih(kerjaKurangItems);
    const nilaiDenda = toNumber(detail.opname_final.nilai_denda);
    const hariDenda = Number(detail.opname_final.hari_denda ?? 0) || 0;
    const tanggalAkhirSpkDenda = detail.opname_final.tanggal_akhir_spk_denda
        ?? detail.opname_final.denda_allocation_tanggal_akhir_spk;
    const tanggalSerahTerimaDenda = detail.opname_final.tanggal_serah_terima_denda
        ?? detail.opname_final.denda_allocation_tanggal_serah_terima;
    const documentLabel = "Opname";
    const financials = calculateOpnameFinalFinancials({
        rab: totalRabItems,
        instruksiLapangan: grandTotalIl,
        kerjaTambah: grandTotalKerjaTambah,
        kerjaKurang: grandTotalKerjaKurang,
        denda: nilaiDenda,
        noPpn,
    });
    const rabSummary = buildFinancialSummary(financials.rab.total, "down", noPpn);
    const instruksiLapanganSummary = buildFinancialSummary(financials.instruksiLapangan.total, "down", noPpn);
    const kerjaTambahSummary = buildFinancialSummary(financials.kerjaTambah.total, "down", noPpn);
    const kerjaKurangSummary = buildFinancialSummary(financials.kerjaKurang.total, "down", noPpn);
    const selisihKerjaTambahKurang = financials.selisihKerjaTambahKurang;
    const selisihKerjaTambahKurangAbs = Math.abs(selisihKerjaTambahKurang);
    const totalOpnameFinal = financials.totalFinal;
    const selisihFinalRabKtk = totalOpnameFinal - rabSummary.grand_total;
    const selisihFinalRabKtkAbs = Math.abs(selisihFinalRabKtk);

    const html = await renderHtmlTemplate(templatePath, {
        generated_at: formatDateIndonesia(new Date().toISOString()),
        opname_final: detail.opname_final,
        document_label: documentLabel,
        skip_bm_approval: detail.toko.cabang?.toUpperCase() === "BATAM",
        toko: detail.toko,
        header_left_logo_path: staticAssetPath("Alfamart-Emblem.png"),
        header_right_logo_path: staticAssetPath("Building-Logo.png"),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
        grouped_items_list: await buildOpnameGroupedItems(opnameItems, noPpn, resolvePhotoCached),
        rab_grouped_items_list: buildRabGroupedItems(rabItems, noPpn),
        instruksi_lapangan_groups: await buildInstruksiLapanganGroups(instruksiLapanganItems, allOpnameItems, noPpn, resolvePhotoCached),
        kerja_tambah_groups: await buildOpnameGroupedItems(kerjaTambahItems, noPpn, resolvePhotoCached),
        kerja_kurang_groups: await buildOpnameGroupedItems(kerjaKurangItems, noPpn, resolvePhotoCached),
        opname_summary: buildFinancialSummary(totalOpnameSelisih, "down", noPpn),
        rab_summary: rabSummary,
        instruksi_lapangan_summary: instruksiLapanganSummary,
        kerja_tambah_summary: kerjaTambahSummary,
        kerja_kurang_summary: kerjaKurangSummary,
        grand_total_opname_formatted: rupiah(grandTotalOpname),
        grand_total_rab_formatted: rupiah(grandTotalRab),
        selisih_total_formatted: rupiah(grandTotalOpname - grandTotalRab),
        grand_total_final_rab_formatted: rabSummary.grand_total_formatted,
        grand_total_il_formatted: instruksiLapanganSummary.grand_total_formatted,
        grand_total_kerja_tambah_formatted: kerjaTambahSummary.grand_total_formatted,
        grand_total_kerja_kurang_formatted: kerjaKurangSummary.grand_total_formatted,
        selisih_kerja_tambah_kurang_formatted: rupiah(selisihKerjaTambahKurang),
        selisih_kerja_tambah_kurang_raw: selisihKerjaTambahKurang,
        selisih_kerja_tambah_kurang_abs_formatted: rupiah(selisihKerjaTambahKurangAbs),
        selisih_final_rab_ktk_raw: selisihFinalRabKtk,
        selisih_final_rab_ktk_abs_formatted: rupiah(selisihFinalRabKtkAbs),
        hari_denda: hariDenda,
        nilai_denda_formatted: rupiah(nilaiDenda),
        denda_allocation_note: detail.opname_final.denda_allocation_note,
        tanggal_akhir_spk_denda_formatted: formatDateIndonesia(tanggalAkhirSpkDenda),
        tanggal_serah_terima_denda_formatted: formatDateIndonesia(tanggalSerahTerimaDenda),
        total_opname_final_formatted: rupiah(totalOpnameFinal),
        created_at_formatted: formatDateIndonesia(detail.opname_final.created_at),
        creator_details: approvalDetails(
            detail.opname_final.nama_pembuat,
            detail.opname_final.email_pembuat,
            detail.opname_final.created_at
        ),
        coordinator_approval_details: approvalDetails(
            detail.opname_final.nama_persetujuan_koordinator,
            detail.opname_final.pemberi_persetujuan_koordinator,
            detail.opname_final.waktu_persetujuan_koordinator
        ),
        manager_approval_details: approvalDetails(
            detail.opname_final.nama_persetujuan_manager,
            detail.opname_final.pemberi_persetujuan_manager,
            detail.opname_final.waktu_persetujuan_manager
        ),
        director_approval_details: approvalDetails(
            detail.opname_final.nama_persetujuan_direktur,
            detail.opname_final.pemberi_persetujuan_direktur,
            detail.opname_final.waktu_persetujuan_direktur
        )
    });

    return renderPdfFromHtml(html);
};
