import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import type {
    CabangLookupInput,
    LingkupByUlokInput,
    ResendEmailInput,
    UlokByCabangInput,
} from "./email-resend.schema";

const MailComposer = require("nodemailer/lib/mail-composer");

type MailAttachment = {
    filename: string;
    content: Buffer;
};

type MailOptions = {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments?: MailAttachment[];
};

const sheetId = () => env.DOC_SHEET_ID || env.SPREADSHEET_ID;
const backendBaseUrl = () => (env.SPARTA_BACKEND_BASE_URL || env.FRONTEND_URL).replace(/\/$/, "");
const frontendBaseUrl = () => env.FRONTEND_URL.replace(/\/$/, "");

function escapeHtml(text: unknown): string {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeString(value: unknown): string {
    return String(value ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .trim();
}

function normalizeLooseText(value: unknown): string {
    return normalizeString(value);
}

function extractFileId(url: unknown): string | null {
    const text = String(url ?? "").trim();
    if (!text) return null;
    if (/^[\w-]{20,}$/.test(text)) return text;
    const match = text.match(/(?:id=|\/d\/|file\/d\/)([\w-]{20,})/);
    return match ? match[1] : null;
}

function getHeaderIndex(headers: unknown[], candidateNames: string[]): number {
    const normalized = headers.map((header) => String(header || "").trim().toUpperCase());
    for (const name of candidateNames) {
        const index = normalized.indexOf(String(name || "").trim().toUpperCase());
        if (index >= 0) return index;
    }
    return -1;
}

function getCellByHeaders(row: unknown[], headers: unknown[], candidateNames: string[], fallback = ""): string {
    const index = getHeaderIndex(headers, candidateNames);
    if (index < 0) return String(fallback ?? "");
    return String(row[index] ?? fallback ?? "");
}

function uniqueEmails(emails: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const email of emails.map((item) => item.trim()).filter(Boolean)) {
        const key = email.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(email);
        }
    }
    return result;
}

function buildRabApprovalEmailHtml(input: {
    level: string;
    proyek: string;
    nomorUlok: string;
    approvalUrl: string;
    rejectionUrl: string;
    additionalInfo?: string;
}): string {
    const infoBlock = input.additionalInfo
        ? `<p style="font-style: italic;">${escapeHtml(input.additionalInfo)}</p>`
        : "";

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        .button { padding: 10px 20px; text-decoration: none; color: white !important; border-radius: 5px; }
        .approve { background-color: #28a745; }
        .reject { background-color: #dc3545; }
    </style>
</head>
<body>
    <p>Yth. Bapak/Ibu ${escapeHtml(input.level)},</p>
    <p>Dokumen RAB untuk proyek <strong>${escapeHtml(input.proyek)}</strong> dengan Nomor Ulok <strong>${escapeHtml(input.nomorUlok)}</strong> memerlukan tinjauan dan persetujuan Anda.</p>
    ${infoBlock}
    <p>Silakan periksa detailnya pada file PDF yang terlampir dan pilih tindakan di bawah ini:</p>
    <br>
    <a href="${escapeHtml(input.approvalUrl)}" class="button approve">SETUJUI</a>
    <a href="${escapeHtml(input.rejectionUrl)}" class="button reject">TOLAK</a>
    <br><br>
    <p>Terima kasih.</p>
    <p><em>--- Email ini dibuat secara otomatis.---</em></p>
</body>
</html>`;
}

function buildDocApprovalEmailHtml(input: {
    docType: string;
    level: string;
    proyek: string;
    nomorUlok: string;
    approvalUrl: string;
    rejectionUrl: string;
    additionalInfo?: string;
}): string {
    const infoBlock = input.additionalInfo
        ? `<p style="font-style: italic;">${escapeHtml(input.additionalInfo)}</p>`
        : "";

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        .button { padding: 10px 20px; text-decoration: none; color: white !important; border-radius: 5px; }
        .approve { background-color: #28a745; }
        .reject { background-color: #dc3545; }
    </style>
</head>
<body>
    <p>Yth. Bapak/Ibu ${escapeHtml(input.level)},</p>
    <p>Dokumen ${escapeHtml(input.docType)} untuk proyek <strong>${escapeHtml(input.proyek)}</strong> dengan Nomor Ulok <strong>${escapeHtml(input.nomorUlok)}</strong> memerlukan tinjauan dan persetujuan Anda.</p>
    ${infoBlock}
    <p>Silakan periksa detailnya pada file PDF yang terlampir dan pilih tindakan di bawah ini:</p>
    <br>
    <a href="${escapeHtml(input.approvalUrl)}" class="button approve">SETUJUI</a>
    <a href="${escapeHtml(input.rejectionUrl)}" class="button reject">TOLAK</a>
    <br><br>
    <p>Terima kasih.</p>
    <p><em>--- Email ini dibuat secara otomatis.---</em></p>
</body>
</html>`;
}

function buildRabFinalApprovedEmailHtml(input: {
    namaToko: string;
    proyek: string;
    lingkup: string;
    pdfGabunganFilename: string;
    linkPdfGabungan: string;
}): string {
    return `
<p>Pengajuan RAB Toko <b>${escapeHtml(input.namaToko)}</b> untuk proyek <b>${escapeHtml(input.proyek)} - ${escapeHtml(input.lingkup)}</b> telah disetujui sepenuhnya.</p>
<p>File PDF RAB gabungan telah dilampirkan:</p>
<ul><li><b>${escapeHtml(input.pdfGabunganFilename)}</b>: Berisi dokumen RAB gabungan.</li></ul>
<p>Link Google Drive:</p>
<ul><li><a href="${escapeHtml(input.linkPdfGabungan)}">Link PDF RAB Gabungan</a></li></ul>`;
}

function buildRabFinalApprovedKontraktorHtml(baseBody: string): string {
    return `${baseBody}
<p>Silakan upload Rekapitulasi RAB Termaterai & SPH melalui link berikut:</p>
<p><a href="https://materai-rab-pi.vercel.app/login" target="_blank">UPLOAD REKAP RAB TERMATERAI & SPH</a></p>`;
}

async function getValues(range: string): Promise<string[][]> {
    const sheets = GoogleProvider.instance.docSheets;
    if (!sheets) throw new AppError("Google Sheets DOC belum terkonfigurasi", 500);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range });
    return (response.data.values || []) as string[][];
}

async function downloadDriveFile(fileId: string | null): Promise<Buffer | null> {
    if (!fileId) return null;
    const gp = GoogleProvider.instance;

    if (gp.docDrive) {
        const buffer = await gp.getFileBufferById(gp.docDrive, fileId);
        if (buffer) return buffer;
    }

    if (gp.spartaDrive) {
        const buffer = await gp.getFileBufferById(gp.spartaDrive, fileId);
        if (buffer) return buffer;
    }

    return null;
}

async function sendMailViaGmail(options: MailOptions): Promise<string | null> {
    if (!env.EMAIL_USER) throw new AppError("EMAIL_USER belum diset", 500);

    const gmail = GoogleProvider.instance.spartaGmail;
    if (!gmail) throw new AppError("Google Gmail belum terkonfigurasi", 500);

    const mail = new MailComposer(options);
    const messageBuffer = await mail.compile().build();
    const encodedMessage = messageBuffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
    });

    return result.data.id ?? null;
}

async function getScopeInfo(oauthClient: any) {
    if (!oauthClient) return { ok: false, message: "OAuth client belum tersedia.", scopes: [] as string[] };

    try {
        const accessToken = await oauthClient.getAccessToken();
        const tokenValue = typeof accessToken === "string" ? accessToken : accessToken?.token;
        if (!tokenValue) return { ok: false, message: "Tidak bisa mengambil access token.", scopes: [] as string[] };

        const info = await oauthClient.getTokenInfo(tokenValue);
        const scopes = Array.isArray(info?.scopes)
            ? info.scopes
            : String(info?.scope || "").split(" ").map((scope) => scope.trim()).filter(Boolean);

        return { ok: true, message: "OK", scopes };
    } catch (error: any) {
        return { ok: false, message: error?.message ?? String(error), scopes: [] as string[] };
    }
}

export const emailResendService = {
    async debugOAuthClients() {
        const gp = GoogleProvider.instance;
        const [docScopeInfo, spartaScopeInfo] = await Promise.all([
            getScopeInfo(gp.docAuthClient),
            getScopeInfo(gp.spartaAuthClient),
        ]);

        return {
            doc: {
                ...gp.docTokenMeta,
                configured: Boolean(gp.docSheets && gp.docDrive),
                scopeInfo: docScopeInfo,
            },
            sparta: {
                ...gp.spartaTokenMeta,
                configured: Boolean(gp.spartaSheets && gp.spartaDrive && gp.spartaGmail),
                scopeInfo: spartaScopeInfo,
            },
        };
    },

    async resendRabEmail(input: ResendEmailInput) {
        const rowsForm2 = await getValues("form2!A:AA");
        if (rowsForm2.length === 0) throw new AppError("Data form2 kosong.", 404);

        const headersForm2 = rowsForm2[0].map((header) => String(header || "").trim().toUpperCase());
        const dataRowsForm2 = rowsForm2.slice(1);
        const targetUlok = normalizeString(input.ulok);
        const targetLingkup = normalizeLooseText(input.lingkup);
        const targetCabang = normalizeLooseText(input.cabang);
        const form2UlokHeaders = ["Nomor Ulok", "NOMOR ULOK", "Lokasi", "LOKASI"];
        const form2LingkupHeaders = ["Lingkup Pekerjaan", "LINGKUP PEKERJAAN", "Lingkup_Pekerjaan", "LINGKUP_PEKERJAAN"];
        const form2CabangHeaders = ["Cabang", "CABANG"];

        const targetRowRelativeIndex = dataRowsForm2.findIndex((row) => {
            const rowUlok = normalizeString(getCellByHeaders(row, headersForm2, form2UlokHeaders, row[9] || ""));
            const rowLingkup = normalizeLooseText(getCellByHeaders(row, headersForm2, form2LingkupHeaders, row[13] || ""));
            const rowCabang = normalizeLooseText(getCellByHeaders(row, headersForm2, form2CabangHeaders, row[12] || ""));
            return rowUlok === targetUlok && rowLingkup === targetLingkup && rowCabang === targetCabang;
        });

        if (targetRowRelativeIndex === -1) {
            throw new AppError("Data tidak ditemukan di form2 untuk kombinasi Ulok + Lingkup + Cabang.", 404);
        }

        const targetRow = dataRowsForm2[targetRowRelativeIndex];
        const sheetRowNumber = targetRowRelativeIndex + 2;
        const status = getCellByHeaders(targetRow, headersForm2, ["Status", "STATUS"], targetRow[0] || "").trim();
        const linkPdfGabungan = getCellByHeaders(targetRow, headersForm2, ["Link PDF", "LINK PDF"], targetRow[2] || "").trim();
        const emailKoordOld = getCellByHeaders(targetRow, headersForm2, ["Email Koordinator", "EMAIL KOORDINATOR", "EMAIL KOORD", "Email Koord"], targetRow[4] || "").trim();
        const emailManagerOld = getCellByHeaders(targetRow, headersForm2, ["Email Manager", "EMAIL MANAGER"], targetRow[6] || "").trim();
        const emailPembuat = getCellByHeaders(targetRow, headersForm2, ["Email_Pembuat", "EMAIL_PEMBUAT", "Dibuat Oleh"], targetRow[8] || "").trim();
        const rowUlok = getCellByHeaders(targetRow, headersForm2, form2UlokHeaders, targetRow[9] || "").trim();
        const proyek = getCellByHeaders(targetRow, headersForm2, ["Proyek", "PROYEK", "Jenis_Toko", "JENIS_TOKO"], targetRow[10] || "").trim();
        const cabang = getCellByHeaders(targetRow, headersForm2, ["Cabang", "CABANG"], targetRow[12] || "").trim();
        const rowLingkup = getCellByHeaders(targetRow, headersForm2, form2LingkupHeaders, targetRow[13] || "").trim();
        const alasanPenolakan = getCellByHeaders(targetRow, headersForm2, ["Alasan Penolakan", "ALASAN PENOLAKAN"], "").trim();
        const namaTokoIndex = headersForm2.indexOf("NAMA_TOKO");
        const namaToko = namaTokoIndex >= 0 ? String(targetRow[namaTokoIndex] || proyek) : proyek;

        let role = "";
        let targetJabatan = "";
        let approvalLevel = "";
        let isFinalApproved = false;
        let isRejected = false;
        let rejectionBy = "";
        const normalizedStatus = normalizeLooseText(status);

        if (normalizedStatus === normalizeLooseText("Menunggu Persetujuan Koordinator")) {
            role = "Koordinator";
            targetJabatan = "BRANCH BUILDING COORDINATOR";
            approvalLevel = "coordinator";
        } else if (normalizedStatus === normalizeLooseText("Menunggu Persetujuan Manajer")) {
            role = "Manager";
            targetJabatan = "BRANCH BUILDING & MAINTENANCE MANAGER";
            approvalLevel = "manager";
        } else if (normalizedStatus === normalizeLooseText("Disetujui")) {
            role = "Final Approved";
            isFinalApproved = true;
        } else if (normalizedStatus === normalizeLooseText("Ditolak oleh Koordinator")) {
            role = "Ditolak";
            isRejected = true;
            rejectionBy = "Koordinator";
        } else if (normalizedStatus === normalizeLooseText("Ditolak oleh Manajer")) {
            role = "Ditolak";
            isRejected = true;
            rejectionBy = "Manajer";
        } else {
            return { message: `Email tidak dikirim. Status saat ini: "${status}"` };
        }

        if (!cabang) throw new AppError("Kolom cabang kosong.", 400);

        let recipientEmails: string[] = [];
        if (isRejected) {
            recipientEmails = [emailPembuat].filter(Boolean);
        } else {
            const rowsCabang = await getValues("Cabang!A:Z");
            if (rowsCabang.length === 0) throw new AppError("Sheet Cabang kosong.", 404);

            const headersCabang = rowsCabang[0].map((header) => String(header || "").trim().toUpperCase());
            const idxCabang = headersCabang.indexOf("CABANG");
            const idxJabatan = headersCabang.indexOf("JABATAN");
            const idxEmail = headersCabang.indexOf("EMAIL_SAT");
            const targetCabangUpper = cabang.trim().toUpperCase();

            if (!isFinalApproved) {
                recipientEmails = rowsCabang.slice(1)
                    .filter((row) => String(row[idxCabang] || "").trim().toUpperCase() === targetCabangUpper
                        && String(row[idxJabatan] || "").trim().toUpperCase() === targetJabatan.toUpperCase())
                    .map((row) => String(row[idxEmail] || "").trim())
                    .filter(Boolean);
            } else {
                const allowedJabatan = new Set(["BRANCH BUILDING COORDINATOR", "BRANCH BUILDING & MAINTENANCE MANAGER"]);
                const cabangTeamEmails = rowsCabang.slice(1)
                    .filter((row) => String(row[idxCabang] || "").trim().toUpperCase() === targetCabangUpper
                        && allowedJabatan.has(String(row[idxJabatan] || "").trim().toUpperCase()))
                    .map((row) => String(row[idxEmail] || "").trim())
                    .filter(Boolean);
                recipientEmails = [emailPembuat, emailKoordOld, emailManagerOld, ...cabangTeamEmails].filter(Boolean);
            }
        }

        recipientEmails = uniqueEmails(recipientEmails);
        if (recipientEmails.length === 0) throw new AppError("Email tujuan ditemukan tapi datanya kosong di sheet Cabang.", 404);

        const attachments: MailAttachment[] = [];
        const pdfBuffer = await downloadDriveFile(extractFileId(linkPdfGabungan));
        if (pdfBuffer) attachments.push({ filename: "RAB_GABUNGAN.pdf", content: pdfBuffer });

        const fromAddress = `"Sparta System RE-EMAIL" <${env.EMAIL_USER}>`;
        const sentMessageIds: Array<string | null> = [];

        if (isFinalApproved) {
            const subject = `[FINAL - DISETUJUI] Pengajuan RAB Proyek ${namaToko}: ${proyek} - ${rowLingkup}`;
            const baseBody = buildRabFinalApprovedEmailHtml({
                namaToko,
                proyek,
                lingkup: rowLingkup,
                pdfGabunganFilename: "RAB_GABUNGAN.pdf",
                linkPdfGabungan,
            });
            const kontraktorEmail = emailPembuat.trim();
            const teamRecipients = recipientEmails.filter((email) => email.toLowerCase() !== kontraktorEmail.toLowerCase());

            if (kontraktorEmail) {
                sentMessageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: kontraktorEmail,
                    subject,
                    html: buildRabFinalApprovedKontraktorHtml(baseBody),
                    attachments,
                }));
            }

            if (teamRecipients.length > 0) {
                sentMessageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: teamRecipients.join(", "),
                    subject,
                    html: baseBody,
                    attachments,
                }));
            }
        } else if (isRejected) {
            sentMessageIds.push(await sendMailViaGmail({
                from: fromAddress,
                to: recipientEmails.join(", "),
                subject: `[DITOLAK] Pengajuan RAB Proyek ${namaToko}: ${proyek} - ${rowLingkup}`,
                html: `<p>Pengajuan RAB Toko <b>${escapeHtml(namaToko)}</b> untuk proyek <b>${escapeHtml(proyek)} - ${escapeHtml(rowLingkup)}</b> telah <b>DITOLAK</b> oleh ${escapeHtml(rejectionBy)}.</p><p><b>Alasan Penolakan:</b></p><p><i>${escapeHtml(alasanPenolakan || "Tidak ada alasan yang diberikan.")}</i></p><p>Silakan ajukan revisi RAB Anda melalui link berikut:</p><p><a href='${frontendBaseUrl()}' target='_blank' rel='noopener noreferrer'>Input Ulang RAB</a></p>`,
            }));
        } else {
            const approver = encodeURIComponent(recipientEmails[0] || "");
            const approvalUrl = `${backendBaseUrl()}/api/handle_rab_approval?action=approve&row=${sheetRowNumber}&level=${approvalLevel}&approver=${approver}`;
            const rejectionUrl = `${backendBaseUrl()}/api/reject_form/rab?row=${sheetRowNumber}&level=${approvalLevel}&approver=${approver}`;
            sentMessageIds.push(await sendMailViaGmail({
                from: fromAddress,
                to: recipientEmails.join(", "),
                subject: approvalLevel === "coordinator"
                    ? `[TAHAP 1: PERLU PERSETUJUAN] RAB Proyek ${proyek} - ${rowLingkup}`
                    : `[TAHAP 2: PERLU PERSETUJUAN] RAB Proyek ${proyek} - ${rowLingkup}`,
                html: buildRabApprovalEmailHtml({
                    level: role,
                    proyek,
                    nomorUlok: rowUlok,
                    approvalUrl,
                    rejectionUrl,
                    additionalInfo: approvalLevel === "manager" && emailKoordOld ? `Telah disetujui oleh Koordinator: ${emailKoordOld}` : "",
                }),
                attachments,
            }));
        }

        return {
            message: "Email berhasil dikirim.",
            recipient: recipientEmails.join(", "),
            role,
            cabang,
            messageId: sentMessageIds[0],
            messageIds: sentMessageIds,
        };
    },

    async resendSpkEmail(input: ResendEmailInput) {
        const spkRows = await getValues("SPK_Data!A:AZ");
        if (spkRows.length === 0) throw new AppError("Sheet SPK_Data kosong.", 404);

        const spkHeaders = spkRows[0];
        const dataRows = spkRows.slice(1);
        const targetUlok = normalizeString(input.ulok);
        const targetLingkup = normalizeLooseText(input.lingkup);
        const targetCabang = normalizeLooseText(input.cabang);
        const targetRowRelativeIndex = dataRows.findIndex((row) =>
            normalizeString(getCellByHeaders(row, spkHeaders, ["Nomor Ulok"])) === targetUlok
            && normalizeLooseText(getCellByHeaders(row, spkHeaders, ["Lingkup Pekerjaan", "Lingkup_Pekerjaan"])) === targetLingkup
            && normalizeLooseText(getCellByHeaders(row, spkHeaders, ["Cabang", "CABANG"])) === targetCabang
        );

        if (targetRowRelativeIndex === -1) {
            throw new AppError("Data SPK tidak ditemukan untuk kombinasi Nomor Ulok + Lingkup + Cabang.", 404);
        }

        const row = dataRows[targetRowRelativeIndex];
        const sheetRowNumber = targetRowRelativeIndex + 2;
        const status = getCellByHeaders(row, spkHeaders, ["Status"]).trim();
        const cabang = getCellByHeaders(row, spkHeaders, ["Cabang"]).trim();
        const nomorUlok = getCellByHeaders(row, spkHeaders, ["Nomor Ulok"]).trim();
        const namaToko = getCellByHeaders(row, spkHeaders, ["Nama_Toko", "nama_toko"]).trim();
        const kodeToko = getCellByHeaders(row, spkHeaders, ["Kode Toko", "kode_toko"]).trim();
        const jenisToko = getCellByHeaders(row, spkHeaders, ["Jenis_Toko", "Proyek"]).trim();
        const lingkupPekerjaan = getCellByHeaders(row, spkHeaders, ["Lingkup Pekerjaan", "Lingkup_Pekerjaan"]).trim();
        const linkPdf = getCellByHeaders(row, spkHeaders, ["Link PDF"]).trim();
        const initiatorEmail = getCellByHeaders(row, spkHeaders, ["Dibuat Oleh", "Email_Pembuat", "EMAIL_PEMBUAT"]).trim();
        const approverEmail = getCellByHeaders(row, spkHeaders, ["Disetujui Oleh"]).trim();
        const alasanPenolakan = getCellByHeaders(row, spkHeaders, ["Alasan Penolakan"]).trim();

        if (!cabang) throw new AppError("Kolom Cabang SPK kosong.", 400);

        const cabangRows = await getValues("Cabang!A:Z");
        if (cabangRows.length === 0) throw new AppError("Sheet Cabang kosong.", 404);

        const cabangHeaders = cabangRows[0].map((header) => String(header || "").trim().toUpperCase());
        const idxCabang = cabangHeaders.indexOf("CABANG");
        const idxJabatan = cabangHeaders.indexOf("JABATAN");
        const idxEmail = cabangHeaders.indexOf("EMAIL_SAT");
        const targetCabangUpper = cabang.toUpperCase();
        const getEmailsByJabatan = (jabatanName: string) => cabangRows.slice(1)
            .filter((cRow) => String(cRow[idxCabang] || "").trim().toUpperCase() === targetCabangUpper
                && String(cRow[idxJabatan] || "").trim().toUpperCase() === jabatanName.toUpperCase())
            .map((cRow) => String(cRow[idxEmail] || "").trim())
            .filter(Boolean);

        const branchManagerEmails = getEmailsByJabatan("BRANCH MANAGER");
        const managerEmails = getEmailsByJabatan("BRANCH BUILDING & MAINTENANCE MANAGER");
        const coordinatorEmails = getEmailsByJabatan("BRANCH BUILDING COORDINATOR");
        const attachments: MailAttachment[] = [];
        const spkPdfBuffer = await downloadDriveFile(extractFileId(linkPdf));
        if (spkPdfBuffer) {
            attachments.push({
                filename: (status === "SPK Disetujui"
                    ? `SPK_DISETUJUI_${jenisToko || "PROYEK"}_${nomorUlok || "ULOK"}.pdf`
                    : `SPK_${jenisToko || "PROYEK"}_${nomorUlok || "ULOK"}.pdf`).replace(/\s+/g, "_"),
                content: spkPdfBuffer,
            });
        }

        const fromAddress = `"Sparta System RE-EMAIL" <${env.EMAIL_USER}>`;
        const normalizedStatus = normalizeLooseText(status);

        if (normalizedStatus === normalizeLooseText("Menunggu Persetujuan Branch Manager")) {
            const bmEmail = branchManagerEmails[0] || approverEmail;
            if (!bmEmail) throw new AppError(`Email Branch Manager untuk cabang ${cabang} tidak ditemukan.`, 404);

            const approvalUrl = `${backendBaseUrl()}/api/handle_spk_approval?action=approve&row=${sheetRowNumber}&approver=${encodeURIComponent(bmEmail)}`;
            const rejectionUrl = `${backendBaseUrl()}/api/reject_form/spk?row=${sheetRowNumber}&approver=${encodeURIComponent(bmEmail)}`;
            const subject = `[PERLU PERSETUJUAN BM] SPK Proyek ${namaToko} (${kodeToko}): ${jenisToko} - ${lingkupPekerjaan}`;
            const messageId = await sendMailViaGmail({
                from: fromAddress,
                to: bmEmail,
                subject,
                html: buildDocApprovalEmailHtml({
                    docType: "SPK",
                    level: "Branch Manager",
                    proyek: jenisToko || namaToko,
                    nomorUlok,
                    approvalUrl,
                    rejectionUrl,
                }),
                attachments,
            });

            return { message: "Email SPK berhasil dikirim.", recipient: bmEmail, role: "Branch Manager", messageId };
        }

        if (normalizedStatus === normalizeLooseText("SPK Disetujui")) {
            const form2Rows = await getValues("form2!A:AA");
            const form2Headers = form2Rows[0] || [];
            let pembuatRabEmail = "";

            for (const form2Row of form2Rows.slice(1)) {
                const form2Ulok = normalizeString(getCellByHeaders(form2Row, form2Headers, ["Nomor Ulok", "Lokasi"]));
                const form2Lingkup = normalizeLooseText(getCellByHeaders(form2Row, form2Headers, ["Lingkup Pekerjaan", "Lingkup_Pekerjaan"]));
                if (form2Ulok === normalizeString(nomorUlok) && form2Lingkup === normalizeLooseText(lingkupPekerjaan)) {
                    pembuatRabEmail = getCellByHeaders(form2Row, form2Headers, ["Email_Pembuat", "EMAIL_PEMBUAT"]).trim();
                    break;
                }
            }

            const bmEmail = approverEmail || branchManagerEmails[0] || "";
            const bbmManagerEmail = managerEmails[0] || "";
            const messageIds: Array<string | null> = [];
            const otherRecipients = new Set<string>();
            if (initiatorEmail) otherRecipients.add(initiatorEmail);
            if (pembuatRabEmail) otherRecipients.add(pembuatRabEmail);

            const subject = `[DISETUJUI] SPK Proyek ${namaToko} (${kodeToko}): ${jenisToko} - ${lingkupPekerjaan}`;
            if (bmEmail) {
                messageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: bmEmail,
                    subject,
                    html: `<p>SPK yang Anda setujui untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah disetujui sepenuhnya dan final.</p><p>File PDF final terlampir.</p>`,
                    attachments,
                }));
                otherRecipients.delete(bmEmail);
            }
            if (bbmManagerEmail) {
                messageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: bbmManagerEmail,
                    subject,
                    html: `<p>SPK yang diajukan untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah disetujui oleh Branch Manager.</p><p>Silakan melakukan input PIC pengawasan melalui link berikut: <a href='${frontendBaseUrl()}' target='_blank' rel='noopener noreferrer'>Input PIC Pengawasan</a></p><p>File PDF final terlampir.</p>`,
                    attachments,
                }));
                otherRecipients.delete(bbmManagerEmail);
            }
            if (coordinatorEmails.length > 0) {
                messageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: coordinatorEmails.join(", "),
                    subject,
                    html: `<p>SPK untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah disetujui oleh Branch Manager.</p><p>File PDF final terlampir.</p>`,
                    attachments,
                }));
                coordinatorEmails.forEach((email) => otherRecipients.delete(email));
            }
            if (pembuatRabEmail) {
                messageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: pembuatRabEmail,
                    subject,
                    html: `<p>SPK untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah disetujui.</p><p>Silakan melakukan Opname melalui link berikut: <a href='${frontendBaseUrl()}' target='_blank' rel='noopener noreferrer'>Pengisian Opname</a></p><p>File PDF final terlampir.</p>`,
                    attachments,
                }));
                otherRecipients.delete(pembuatRabEmail);
            }
            if (otherRecipients.size > 0) {
                messageIds.push(await sendMailViaGmail({
                    from: fromAddress,
                    to: Array.from(otherRecipients).join(", "),
                    subject,
                    html: `<p>SPK yang Anda ajukan untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah disetujui oleh Branch Manager.</p><p>File PDF final terlampir.</p>`,
                    attachments,
                }));
            }
            if (messageIds.length === 0) throw new AppError("Tidak ada penerima email SPK final yang valid.", 404);

            const recipients = uniqueEmails([bmEmail, bbmManagerEmail, ...coordinatorEmails, pembuatRabEmail, ...Array.from(otherRecipients)].filter(Boolean));
            return {
                message: "Email SPK final disetujui berhasil dikirim.",
                recipient: recipients.join(", "),
                role: "SPK Disetujui",
                cabang,
                messageId: messageIds[0],
                messageIds,
            };
        }

        if (normalizedStatus === normalizeLooseText("SPK Ditolak")) {
            if (!initiatorEmail) throw new AppError("Email pembuat SPK (Dibuat Oleh) tidak ditemukan untuk status ditolak.", 404);
            const messageId = await sendMailViaGmail({
                from: fromAddress,
                to: initiatorEmail,
                subject: `[DITOLAK] SPK untuk Proyek ${namaToko} (${kodeToko}): ${jenisToko} - ${lingkupPekerjaan}`,
                html: `<p>SPK yang Anda ajukan untuk Toko <b>${escapeHtml(namaToko)}</b> pada proyek <b>${escapeHtml(jenisToko)} - ${escapeHtml(lingkupPekerjaan)}</b> (${escapeHtml(nomorUlok)}) telah ditolak oleh Branch Manager.</p><p><b>Alasan Penolakan:</b></p><p><i>${escapeHtml(alasanPenolakan || "Tidak ada alasan yang diberikan.")}</i></p><p>Silakan ajukan revisi SPK Anda melalui link berikut:</p><p><a href='${frontendBaseUrl()}' target='_blank' rel='noopener noreferrer'>Input Ulang SPK</a></p>`,
            });
            return { message: "Email SPK status ditolak berhasil dikirim.", recipient: initiatorEmail, role: "SPK Ditolak", cabang, messageId };
        }

        return { message: `Email SPK tidak dikirim. Status saat ini: "${status}"` };
    },

    async getUlokByCabang(input: UlokByCabangInput) {
        const rows = await getValues("form2!A:AA");
        if (rows.length === 0) throw new AppError("Data form2 kosong.", 404);

        const headers = rows[0];
        const normalizedCabang = normalizeLooseText(input.cabang);
        const normalizedKeyword = normalizeLooseText(input.keyword);
        const data = rows.slice(1)
            .filter((row) => {
                const rowCabang = normalizeLooseText(getCellByHeaders(row, headers, ["Cabang", "CABANG"]));
                if (rowCabang !== normalizedCabang) return false;
                if (!normalizedKeyword) return true;
                return normalizeLooseText(getCellByHeaders(row, headers, ["Nomor Ulok", "NOMOR ULOK", "Lokasi", "LOKASI"])).includes(normalizedKeyword);
            })
            .map((row) => getCellByHeaders(row, headers, ["Nomor Ulok", "NOMOR ULOK", "Lokasi", "LOKASI"]).trim())
            .filter(Boolean);

        const unique = Array.from(new Set(data));
        return { cabang: input.cabang, keyword: input.keyword, total: unique.length, data: unique };
    },

    async getLingkupByUlok(input: LingkupByUlokInput) {
        const rows = await getValues("form2!A:AA");
        if (rows.length === 0) throw new AppError("Data form2 kosong.", 404);

        const headers = rows[0];
        const normalizedUlok = normalizeString(input.ulok);
        const data = rows.slice(1)
            .filter((row) => normalizeString(getCellByHeaders(row, headers, ["Nomor Ulok", "NOMOR ULOK", "Lokasi", "LOKASI"])) === normalizedUlok)
            .map((row) => getCellByHeaders(row, headers, ["Lingkup Pekerjaan", "LINGKUP PEKERJAAN", "Lingkup_Pekerjaan", "LINGKUP_PEKERJAAN"]).trim())
            .filter(Boolean);

        const unique = Array.from(new Set(data));
        return { ulok: input.ulok, total: unique.length, data: unique };
    },

    async getCabangList(input: CabangLookupInput) {
        const rows = await getValues("Cabang!A:Z");
        if (rows.length === 0) throw new AppError("Sheet Cabang kosong.", 404);

        const headers = rows[0];
        const idxCabang = getHeaderIndex(headers, ["CABANG"]);
        if (idxCabang < 0) throw new AppError("Kolom CABANG tidak ditemukan di sheet Cabang.", 400);

        const normalizedKeyword = normalizeLooseText(input.keyword);
        const uniqueCabangMap = new Map<string, string>();
        for (const row of rows.slice(1)) {
            const cabangValue = String(row[idxCabang] || "").trim();
            if (!cabangValue) continue;
            const normalizedCabang = normalizeLooseText(cabangValue);
            if (!normalizedCabang) continue;
            if (normalizedKeyword && !normalizedCabang.includes(normalizedKeyword)) continue;
            if (!uniqueCabangMap.has(normalizedCabang)) uniqueCabangMap.set(normalizedCabang, cabangValue);
        }

        const data = Array.from(uniqueCabangMap.values()).sort((a, b) => a.localeCompare(b, "id"));
        return { keyword: input.keyword, total: data.length, data };
    },
};
