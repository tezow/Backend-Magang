import fs from "fs";
import path from "path";
import { resolveDriveImageDataUrl } from "../../common/drive-image";
import { renderHtmlTemplate, renderPdfFromHtml, resolveTemplatePath } from "../../common/html-pdf";
import type { SerahTerimaDetail } from "./serah-terima.repository";

const rupiah = (value: number): string => {
    return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value) || 0);
};

const toNumber = (value: string | number | null | undefined): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
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

const staticAssetPath = (filename: string): string => {
    const candidates = [
        // Works for dev and build: src/modules/serah-terima -> src/image, dist/modules/serah-terima -> dist/image
        path.resolve(__dirname, "../../image", filename),
        // Build mode (dist): dist/modules/serah-terima -> src/image
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

const groupItemsByCategory = (items: SerahTerimaDetail["items"]) => {
    const groups: Array<{ category: string; items: SerahTerimaDetail["items"] }> = [];
    const indexByCategory = new Map<string, number>();

    for (const item of items) {
        const category = (item.kategori_pekerjaan ?? "").trim() || "Lainnya";
        const key = category.toLowerCase();
        const existingIndex = indexByCategory.get(key);

        if (existingIndex === undefined) {
            indexByCategory.set(key, groups.length);
            groups.push({ category, items: [item] });
            continue;
        }

        groups[existingIndex].items.push(item);
    }

    return groups;
};

const normalizeText = (value?: string | null): string => {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
};

const countMatching = (
    items: SerahTerimaDetail["items"],
    selector: (item: SerahTerimaDetail["items"][number]) => string | null,
    expected: string
): number => {
    const normalizedExpected = normalizeText(expected);
    return items.filter((item) => normalizeText(selector(item)) === normalizedExpected).length;
};

export const calculateSerahTerimaAssessmentScore = (items: SerahTerimaDetail["items"]) => {
    const total = items.length;
    const desainSesuai = countMatching(items, (item) => item.desain, "Sesuai");
    const kualitasBaik = countMatching(items, (item) => item.kualitas, "Baik");
    const spesifikasiSesuai = countMatching(items, (item) => item.spesifikasi, "Sesuai");
    const nilaiDesain = total > 0 ? (desainSesuai / total) * 30 : 0;
    const nilaiKualitas = total > 0 ? (kualitasBaik / total) * 35 : 0;
    const nilaiSpesifikasi = total > 0 ? (spesifikasiSesuai / total) * 35 : 0;
    const nilaiToko = nilaiDesain + nilaiKualitas + nilaiSpesifikasi;

    return {
        total,
        desainSesuai,
        kualitasBaik,
        spesifikasiSesuai,
        nilaiDesain,
        nilaiKualitas,
        nilaiSpesifikasi,
        nilaiToko,
    };
};

const buildAssessmentSummary = (items: SerahTerimaDetail["items"]) => {
    const score = calculateSerahTerimaAssessmentScore(items);

    return [
        {
            label: "Desain Sesuai",
            value: `${score.desainSesuai} dari ${score.total}`,
            detail: ""
        },
        {
            label: "Kualitas Baik",
            value: `${score.kualitasBaik} dari ${score.total}`,
            detail: ""
        },
        {
            label: "Spesifikasi Sesuai",
            value: `${score.spesifikasiSesuai} dari ${score.total}`,
            detail: ""
        },
        {
            label: "Nilai Toko",
            value: `${score.nilaiToko.toFixed(1)} / 100`,
            detail: ""
        },
    ];
};

export const buildSerahTerimaPdfBuffer = async (
    detail: SerahTerimaDetail,
    createdAt: string,
    options: { unifiedPartIndex?: number; unifiedPartTotal?: number } = {}
): Promise<Buffer> => {
    const templatePath = await resolveTemplatePath("serah_terima_report.njk");

    const grandTotalOpname = toNumber(detail.opname_final.grand_total_opname);
    const grandTotalRab = toNumber(detail.opname_final.grand_total_rab);
    const itemsWithPhotos = await Promise.all(detail.items.map(async (item) => ({
        ...item,
        foto_data_url: await resolveDriveImageDataUrl(item.foto),
        total_selisih_formatted: rupiah(item.total_selisih),
        total_harga_rab_formatted: rupiah(toNumber(item.total_harga_rab)),
        total_harga_opname_formatted: rupiah(item.total_harga_opname),
    })));

    const html = await renderHtmlTemplate(templatePath, {
        generated_at: formatDateIndonesia(createdAt),
        unified_part_index: options.unifiedPartIndex,
        unified_part_total: options.unifiedPartTotal,
        opname_final: detail.opname_final,
        toko: detail.toko,
        items: itemsWithPhotos,
        grouped_items_list: groupItemsByCategory(itemsWithPhotos).map((group) => ({
            category: group.category,
            items: group.items,
        })),
        assessment_summary: buildAssessmentSummary(detail.items),
        total_item_count: detail.items.length,
        grand_total_opname_formatted: rupiah(grandTotalOpname),
        grand_total_rab_formatted: rupiah(grandTotalRab),
        selisih_total_formatted: rupiah(grandTotalOpname - grandTotalRab),
        created_at_formatted: formatDateIndonesia(createdAt),
        watermark_logo_path: staticAssetPath("Building-Logo.png"),
    });

    return renderPdfFromHtml(html);
};

export const buildSerahTerimaUnifiedCoverPdfBuffer = async (input: {
    nomor_ulok: string;
    nama_toko?: string | null;
    cabang?: string | null;
    proyek?: string | null;
    created_at: string;
    scopes: Array<{
        lingkup_pekerjaan: string | null;
        kode_toko?: string | null;
        nama_kontraktor?: string | null;
        item_count: number;
        nilai_opname?: string | number | null;
    }>;
}): Promise<Buffer> => {
    const totalItems = input.scopes.reduce((sum, scope) => sum + Number(scope.item_count || 0), 0);
    const totalNilai = input.scopes.reduce((sum, scope) => sum + toNumber(scope.nilai_opname), 0);
    const rows = input.scopes.map((scope, index) => `
        <tr>
            <td class="center">${index + 1}</td>
            <td class="scope-name">${scope.lingkup_pekerjaan || "-"}</td>
            <td>${scope.kode_toko || "-"}</td>
            <td>${scope.nama_kontraktor || "-"}</td>
            <td class="center">${scope.item_count}</td>
            <td class="num">${rupiah(toNumber(scope.nilai_opname))}</td>
        </tr>
    `).join("");

    const templatePath = await resolveTemplatePath("serah_terima_unified_cover.njk");
    const coverHtml = await renderHtmlTemplate(templatePath, {
        nomor_ulok: input.nomor_ulok,
        nama_toko: input.nama_toko ?? "-",
        created_at_formatted: formatDateIndonesia(input.created_at),
        scope_count: input.scopes.length,
        total_items: totalItems,
        total_nilai_formatted: rupiah(totalNilai),
        scope_order: input.scopes.map((scope) => scope.lingkup_pekerjaan || "-").join(" lalu "),
        scopes: input.scopes.map((scope) => ({
            ...scope,
            nilai_opname_formatted: rupiah(toNumber(scope.nilai_opname)),
        })),
    });
    return renderPdfFromHtml(coverHtml);

    const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <style>
    ${""}
    ${staticAssetPath("Building-Logo.png") ? "" : ""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    ${""}
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; }
    .cover-title { margin-top: 30px; border: 2px solid #dc2626; border-radius: 8px; padding: 22px; }
    .eyebrow { color: #dc2626; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.6px; }
    h1 { margin: 8px 0 8px; font-size: 24px; color: #111827; }
    .subtitle { color: #475569; font-size: 12px; line-height: 1.5; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; }
    .summary-card { background: #f8fafc; border: 1px solid #d8dee6; border-radius: 6px; padding: 11px; }
    .summary-label { color: #64748b; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    .summary-value { margin-top: 5px; color: #111827; font-size: 17px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
    th { background: #eef6ff; font-weight: 800; text-align: center; }
    .center { text-align: center; }
    .num { text-align: right; white-space: nowrap; }
    .scope-name { font-weight: 800; color: #dc2626; }
    .note { margin-top: 18px; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 6px; line-height: 1.45; }
    {{ sparta_pdf_css() | safe }}
  </style>
</head>
<body>
  {{ sparta_header("Berita Acara Serah Terima Gabungan", "${input.nomor_ulok} - ${input.nama_toko || "-"}") | safe }}
  <div class="cover-title">
    <div class="eyebrow">Dokumen Unified SIPIL + ME</div>
    <h1>Serah Terima Gabungan ULOK ${input.nomor_ulok}</h1>
    <div class="subtitle">Dokumen ini menggabungkan lingkup pekerjaan yang tersedia dalam satu PDF. Bagian detail setelah halaman ini dipisahkan per lingkup supaya pemeriksaan SIPIL dan ME tetap mudah dibaca.</div>
  </div>
  <div class="summary-grid">
    <div class="summary-card"><div class="summary-label">Tanggal ST</div><div class="summary-value">${formatDateIndonesia(input.created_at)}</div></div>
    <div class="summary-card"><div class="summary-label">Total Lingkup</div><div class="summary-value">${input.scopes.length}</div></div>
    <div class="summary-card"><div class="summary-label">Total Item</div><div class="summary-value">${totalItems}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">No</th>
        <th>Lingkup</th>
        <th>Kode Toko</th>
        <th>Kontraktor</th>
        <th style="width:70px">Item</th>
        <th style="width:110px">Nilai Opname</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="num"><strong>Total</strong></td>
        <td class="center"><strong>${totalItems}</strong></td>
        <td class="num"><strong>${rupiah(totalNilai)}</strong></td>
      </tr>
    </tfoot>
  </table>
  <div class="note">Urutan lampiran: ${input.scopes.map((scope) => scope.lingkup_pekerjaan || "-").join(" lalu ")}. Setiap lampiran memiliki header lingkup sendiri.</div>
</body>
</html>`;

    return renderPdfFromHtml(html.replace("{{ sparta_pdf_css() | safe }}", "").replace(/{{ sparta_header\("Berita Acara Serah Terima Gabungan", "([^"]*)"\) \| safe }}/, ""));
};

export const buildSerahTerimaUnifiedAssessmentPdfBuffer = async (input: {
    nomor_ulok: string;
    nama_toko?: string | null;
    created_at: string;
    scopes: Array<{
        lingkup_pekerjaan: string | null;
        nilai_toko: number;
    }>;
}): Promise<Buffer> => {
    const logo = staticAssetPath("Building-Logo.png");
    const totalScore = input.scopes.reduce((sum, scope) => sum + Number(scope.nilai_toko || 0), 0);
    const averageScore = input.scopes.length > 0 ? totalScore / input.scopes.length : 0;
    const formula = input.scopes.length > 1
        ? `(${input.scopes.map((scope) => `${scope.lingkup_pekerjaan || "-"} ${Number(scope.nilai_toko || 0).toFixed(1)}`).join(" + ")}) / ${input.scopes.length}`
        : `${input.scopes[0]?.lingkup_pekerjaan || "-"} ${Number(input.scopes[0]?.nilai_toko || 0).toFixed(1)}`;
    const rows = input.scopes.map((scope, index) => `
        <tr>
            <td class="center">${index + 1}</td>
            <td>${scope.lingkup_pekerjaan || "-"}</td>
            <td class="num">${Number(scope.nilai_toko || 0).toFixed(1)} / 100</td>
        </tr>
    `).join("");

    const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, sans-serif; color: #0f172a; font-size: 12px; }
    .header { border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 54px; height: 54px; object-fit: contain; }
    h1 { margin: 0; color: #dc2626; font-size: 22px; letter-spacing: .3px; }
    .subtitle { margin-top: 4px; color: #64748b; font-weight: 700; }
    .meta { margin: 18px 0; border: 1px solid #cbd5e1; border-collapse: collapse; width: 100%; }
    .meta td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    .label { background: #f8fafc; font-weight: 800; width: 26%; }
    table.score { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .score th { background: #eff6ff; color: #0f172a; border: 1px solid #93c5fd; padding: 9px; }
    .score td { border: 1px solid #cbd5e1; padding: 9px; }
    .center { text-align: center; }
    .num { text-align: right; font-weight: 800; }
    .summary { margin-top: 28px; border: 2px solid #dc2626; padding: 18px; text-align: center; }
    .summary-title { color: #64748b; text-transform: uppercase; font-size: 11px; font-weight: 800; letter-spacing: 1px; }
    .summary-score { margin-top: 8px; color: #dc2626; font-size: 34px; font-weight: 900; }
    .formula { margin-top: 8px; color: #475569; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${logo ? `<img class="logo" src="${logo}" />` : ""}
      <div>
        <h1>Nilai Toko Gabungan</h1>
        <div class="subtitle">Rekap nilai akhir Serah Terima SIPIL + ME</div>
      </div>
    </div>
  </div>
  <table class="meta">
    <tr><td class="label">Nomor ULOK</td><td>${input.nomor_ulok}</td></tr>
    <tr><td class="label">Nama Toko</td><td>${input.nama_toko || "-"}</td></tr>
    <tr><td class="label">Tanggal Dokumen</td><td>${formatDateIndonesia(input.created_at)}</td></tr>
  </table>
  <table class="score">
    <thead>
      <tr><th class="center">No</th><th>Lingkup</th><th class="num">Nilai Toko</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary">
    <div class="summary-title">Nilai Toko Rata-rata</div>
    <div class="summary-score">${averageScore.toFixed(1)} / 100</div>
    <div class="formula">${formula}</div>
  </div>
</body>
</html>`;

    return renderPdfFromHtml(html);
};
