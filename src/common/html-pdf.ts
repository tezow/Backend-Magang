import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import nunjucks from "nunjucks";
import puppeteer from "puppeteer";
import { env } from "../config/env";

const nunjucksEnv = new nunjucks.Environment(undefined, {
    autoescape: false,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true,
});

nunjucksEnv.addFilter("capitalizeFirst", (value: unknown) => {
    if (typeof value !== "string") return value;
    const lower = value.toLowerCase();
    return lower.length > 0 ? `${lower[0].toUpperCase()}${lower.slice(1)}` : lower;
});

const spartaAssetDataUrl = (filename: string): string => {
    const candidates = [
        path.resolve(__dirname, "../image", filename),
        path.resolve(__dirname, "../../src/image", filename),
        path.resolve(__dirname, "../../../server/static", filename),
    ];

    for (const assetPath of candidates) {
        if (fsSync.existsSync(assetPath)) {
            const ext = path.extname(assetPath).toLowerCase();
            const mimeType = ext === ".png"
                ? "image/png"
                : ext === ".jpg" || ext === ".jpeg"
                    ? "image/jpeg"
                    : "application/octet-stream";
            return `data:${mimeType};base64,${fsSync.readFileSync(assetPath).toString("base64")}`;
        }
    }

    return "";
};

const spartaPdfCss = () => `
    @page { size: A4; margin: 15mm 15mm 20mm 15mm; }

    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      color: #1f2937;
      margin: 0;
      padding: 0;
      position: relative;
    }

    .sparta-watermark, .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 400px;
      transform: translate(-50%, -50%);
      opacity: 0.05;
      z-index: -1;
      pointer-events: none;
    }

    .sparta-header {
      background-color: #dc2626;
      color: #ffffff;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      margin-bottom: 18px;
      border-radius: 4px;
      min-height: 38px;
    }

    .sparta-header-alfamart {
      height: 32px;
      width: auto;
      margin-right: 14px;
      padding-right: 14px;
      border-right: 2px solid rgba(255,255,255,0.35);
    }

    .sparta-header-building {
      height: 30px;
      width: auto;
      margin-right: 10px;
    }

    .sparta-brand-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 2px;
      line-height: 1;
    }

    .sparta-brand-subtitle {
      font-size: 10px;
      margin: 2px 0 0;
      opacity: 0.85;
      letter-spacing: 0.5px;
    }

    .sparta-document-title {
      margin-left: auto;
      max-width: 50%;
      text-align: right;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      line-height: 1.25;
    }

    .sparta-document-subtitle {
      font-size: 9px;
      font-weight: 400;
      opacity: 0.85;
      letter-spacing: 0;
      margin-top: 2px;
    }

    .section-title, .category-header {
      font-size: 13px;
      font-weight: 700;
      color: #dc2626;
      border-bottom: 1.6px solid #dc2626;
      padding-bottom: 4px;
      margin: 18px 0 9px;
      text-transform: none;
    }

    .category-header {
      font-size: 12px;
      text-transform: uppercase;
    }

    .info-table, .meta, .meta-table, .summary, .summary-table, .grand-total-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }

    .info-table td, .meta td, .meta-table td, .summary td, .summary-table td, .grand-total-table td {
      border: 1px solid #d8dee6;
      padding: 5px 8px;
      vertical-align: top;
    }

    .info-table .label, .meta .label, .meta-table .label, .summary .label, .summary-table .label {
      font-weight: 700;
      color: #374151;
      background: #f8fafc;
      width: 160px;
    }

    .data-table, .price-table, .items {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 16px;
      font-size: 8.8px;
      table-layout: fixed;
    }

    .data-table th, .data-table td,
    .price-table th, .price-table td,
    .items th, .items td {
      border: 1.2px solid #cbd5e1;
      padding: 5px 6px;
      vertical-align: middle;
      line-height: 1.25;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .data-table th, .price-table th, .items th {
      background-color: #eef6ff;
      color: #111827;
      text-align: center;
      font-weight: 800;
      text-transform: none;
      border-top: 1.6px solid #93c5fd;
      border-bottom: 1.6px solid #93c5fd;
    }

    .data-table tbody tr:nth-child(even),
    .price-table tbody tr:nth-child(even),
    .items tbody tr:nth-child(even) {
      background-color: rgba(248, 250, 252, 0.55);
    }

    .data-table td.label-col, .label-col {
      width: 40%;
      background-color: #f8fafc;
    }

    .text-left, .col-work, .work-col, td.work-col { text-align: left; }
    .text-right, .num, .money-col { text-align: right; white-space: nowrap; }
    .rab-money-col { text-align: center; }
    .center, .no-col, .unit-col, .volume-col, .amount-col { text-align: center; }
    .no-col { width: 28px; }
    .unit-col { width: 44px; }
    .volume-col { width: 52px; }
    .money-col { width: 76px; }
    .amount-col { width: 76px; white-space: nowrap; }
    .note-col { width: 90px; }
    .work-col { width: auto; }

    .sub-total-row td {
      font-weight: 700;
      background-color: #f8fafc;
    }

    .grand-total-table {
      margin-top: 16px;
      width: 46%;
      margin-left: auto;
      font-size: 10px;
    }

    .grand-total-table td {
      border: 1px solid #d8dee6;
      text-align: right;
      font-weight: 700;
    }

    .grand-total-table td:first-child {
      background: #f8fafc;
      color: #374151;
    }

    .total-amount-cell {
      background-color: #fff7ed;
      color: #9a3412;
    }

    .approval-table {
      width: 100%;
      margin-top: 28px;
      border-collapse: separate;
      border-spacing: 8px 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .approval-title {
      font-size: 10px;
      font-weight: 700;
      color: #ffffff;
      background: #dc2626;
      padding: 6px 5px;
      border-radius: 4px 4px 0 0;
      text-transform: uppercase;
      text-align: center;
    }

    .approval-box {
      border-top: 0;
      background: #f8fafc;
      padding: 10px;
      border-radius: 0 0 4px 4px;
      min-height: 98px;
      text-align: center;
      border: 1px solid #edf0f4;
      border-top: 0;
    }

    .approval-name {
      font-weight: 700;
      margin-top: 22px;
      font-size: 10px;
      text-align: center;
      color: #1f2937;
    }

    .approval-date {
      font-size: 8px;
      color: #6b7280;
      margin-top: 6px;
      font-style: italic;
      text-align: center;
      white-space: nowrap;
    }

    .approval-role {
      font-size: 9px;
      color: #4b5563;
      margin-top: 10px;
      border-top: 1px solid #e5e7eb;
      padding-top: 5px;
      text-align: center;
    }

    .approval-details {
      font-size: 9px;
      line-height: 1.4;
      color: #4b5563;
      text-align: center;
      min-height: 70px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .signatures {
      display: table;
      width: 100%;
      margin-top: 30px;
      text-align: center;
      page-break-inside: avoid;
    }

    .signature-box {
      display: table-cell;
      vertical-align: top;
      padding: 0 5px;
    }

    .signature-box > p:first-child {
      margin: 0;
      background: #dc2626;
      color: #fff;
      font-weight: 700;
      text-transform: uppercase;
      padding: 6px;
      border-radius: 4px 4px 0 0;
    }

    .signature-content {
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      position: relative;
    }

    .signature-line { display: none; }

    .signature-box > p:last-child {
      margin: 0;
      background: #f8fafc;
      color: #4b5563;
      border-top: 1px solid #e5e7eb;
      padding: 6px;
      min-height: 22px;
    }

    .photo-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .photo-item {
      width: calc(50% - 6px);
      border: 1px solid #111827;
      padding: 0;
      background: #ffffff;
      page-break-inside: avoid;
      box-sizing: border-box;
      margin-bottom: 12px;
    }

    .photo-item-title {
      font-size: 10px;
      font-weight: 700;
      padding: 5px;
      text-align: center;
      background: #f1f5f9;
      border-bottom: 1px solid #111827;
      text-transform: uppercase;
    }

    .photo-item img {
      width: 100%;
      height: 220px;
      object-fit: contain;
      display: block;
      background: #ffffff;
    }

    .footer {
      margin-top: 24px;
      font-size: 8px;
      color: #9ca3af;
      text-align: center;
      border-top: 1px solid #eeeeee;
      padding-top: 6px;
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      display: block;
      background: transparent;
    }

    .page-break { page-break-before: always; }
    .narrative p, .content-section p, .content p { text-align: justify; }
`;

nunjucksEnv.addGlobal("sparta_pdf_css", spartaPdfCss);
nunjucksEnv.addGlobal("sparta_asset", spartaAssetDataUrl);
nunjucksEnv.addGlobal("sparta_header", (title: string, subtitle?: string) => {
    const alfamartLogo = spartaAssetDataUrl("Alfamart-Emblem.png");
    const buildingLogo = spartaAssetDataUrl("Building-Logo.png");
    return `
  <div class="sparta-header">
    ${alfamartLogo ? `<img src="${alfamartLogo}" class="sparta-header-alfamart" alt="Alfamart" />` : ""}
    ${buildingLogo ? `<img src="${buildingLogo}" class="sparta-header-building" alt="SPARTA Building" />` : ""}
    <div>
      <div class="sparta-brand-title">SPARTA</div>
      <div class="sparta-brand-subtitle">Building</div>
    </div>
    <div class="sparta-document-title">
      ${title ?? ""}
      ${subtitle ? `<div class="sparta-document-subtitle">${subtitle}</div>` : ""}
    </div>
  </div>`;
});

export const renderHtmlTemplate = async (
    templatePath: string,
    context: Record<string, unknown>
): Promise<string> => {
    const template = await fs.readFile(templatePath, "utf-8");
    return nunjucksEnv.renderString(template, context);
};

export const resolveTemplatePath = async (templateFilename: string): Promise<string> => {
    const candidates = [
        path.resolve(__dirname, "../templates", templateFilename),
        path.resolve(__dirname, "../../src/templates", templateFilename),
    ];

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            // Continue to next candidate path.
        }
    }

    throw new Error(`Template not found: ${templateFilename}. Checked: ${candidates.join(", ")}`);
};

const findPuppeteerChromePath = (): string | undefined => {
    const cacheDir = env.PUPPETEER_CACHE_DIR?.trim() || "/opt/render/project/.cache/puppeteer";
    const chromeCacheDir = path.join(cacheDir, "chrome");
    if (!fsSync.existsSync(chromeCacheDir)) return undefined;

    try {
        // Search for chrome binary in versioned subdirectories
        const versionDirs = fsSync.readdirSync(chromeCacheDir);
        for (const versionDir of versionDirs.sort().reverse()) {
            const candidates = [
                path.join(chromeCacheDir, versionDir, "chrome-linux64", "chrome"),
                path.join(chromeCacheDir, versionDir, "chrome-linux", "chrome"),
                path.join(chromeCacheDir, versionDir, "chrome"),
            ];
            for (const candidate of candidates) {
                if (fsSync.existsSync(candidate)) {
                    console.log(`[PDF] Auto-detected Puppeteer Chrome at: ${candidate}`);
                    return candidate;
                }
            }
        }
    } catch {
        // ignore read errors
    }
    return undefined;
};

export const renderPdfFromHtml = async (html: string): Promise<Buffer> => {
    const localChromeCandidates = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    const executablePath = env.PUPPETEER_EXECUTABLE_PATH?.trim()
        || localChromeCandidates.find((candidate) => fsSync.existsSync(candidate))
        || findPuppeteerChromePath()
        || undefined;
    const navigationTimeoutMs = env.PUPPETEER_NAVIGATION_TIMEOUT_MS ?? 240000;
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        executablePath,
    });

    try {
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(navigationTimeoutMs);
        page.setDefaultTimeout(navigationTimeoutMs);

        // Avoid waiting for network-idle because remote/runtime assets can keep
        // pending requests alive in cloud environments and trigger false timeouts.
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: navigationTimeoutMs,
        });
        await page.evaluate(async () => {
            const images = Array.from(document.images);
            await Promise.all(images.map(async (image) => {
                if (image.complete && image.naturalWidth > 0) return;

                try {
                    await image.decode();
                } catch {
                    await new Promise<void>((resolve) => {
                        image.addEventListener("load", () => resolve(), { once: true });
                        image.addEventListener("error", () => resolve(), { once: true });
                        setTimeout(resolve, 5000);
                    });
                }
            }));
        });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
};
