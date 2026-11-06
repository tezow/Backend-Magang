import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { AppError } from "../../common/app-error";
import { env } from "../../config/env";
import { GoogleProvider } from "../../common/google";
import type { ApprovalActionInput } from "../approval/approval.schema";
import type { ListInstruksiLapanganQuery, SubmitInstruksiLapanganInput } from "./instruksi-lapangan.schema";
import { instruksiLapanganRepository } from "./instruksi-lapangan.repository";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import {
    buildInstruksiLapanganPdfBuffer,
    buildInstruksiLapanganRecapPdfBuffer,
    mergePdfBuffers
} from "./instruksi-lapangan.pdf";
import { opnameRepository } from "../opname/opname.repository";
import { generateStandardFilename } from "../../common/filename-helper";

const MailComposer = require("nodemailer/lib/mail-composer");

const saveUploadToTemp = async (file: { originalname: string; buffer: Buffer }): Promise<string> => {
    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;
    const tmpPath = path.join(process.cwd(), "tmp", filename);
    
    await fs.mkdir(path.dirname(tmpPath), { recursive: true });
    await fs.writeFile(tmpPath, file.buffer);
    
    return tmpPath;
};

const extractDriveFileId = (value: string): string | null => {
    const match = value.match(/id=([^&]+)/) || value.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
};



async function uploadPdfToDrive(buffer: Buffer, filename: string, nomorUlok?: string, proyek?: string): Promise<string> {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);

    const folderId = await gp.getOrCreateProcessFolder("Instruksi Lapangan", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        "application/pdf",
        buffer,
        2,
        drive,
    );
    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
}

const normalizeNoPpnText = (value?: string | null): string => String(value ?? "").trim().toUpperCase();

const isNoPpnArea = (toko: { cabang?: string | null; nama_toko?: string | null; alamat?: string | null }): boolean => {
    const identity = [
        toko.cabang,
        toko.nama_toko,
        toko.alamat,
    ].map(normalizeNoPpnText);

    return identity.some(value => value === "BATAM" || value === "BINTAN" || /\bBATAM\b|\bBINTAN\b/.test(value));
};

const generateInstruksiLapanganPdfInBackground = (idIL: number | string): void => {
    setImmediate(() => {
        instruksiLapanganService.generateAndStorePdf(idIL).catch((err) => {
            console.error("[IL][PDF_BACKGROUND] Gagal generate/upload PDF Instruksi Lapangan", {
                idIL,
                error: err instanceof Error ? err.message : String(err)
            });
        });
    });
};

async function sendILApprovalEmail(data: any, pdfBuffer: Buffer, pdfFilename: string) {
    if (!env.EMAIL_USER) {
        console.warn("[IL][EMAIL] EMAIL_USER belum diset, melewati pengiriman email.");
        return;
    }

    const gmail = GoogleProvider.instance.spartaGmail;
    if (!gmail) {
        console.warn("[IL][EMAIL] Google Gmail belum terkonfigurasi, melewati pengiriman email.");
        return;
    }

    const recipient = data.instruksiLapangan.email_pembuat;
    if (!recipient) {
        console.warn("[IL][EMAIL] Tidak ada email pembuat (kontraktor) untuk IL ini.");
        return;
    }

    const htmlBody = `
Yth. Bapak/Ibu Kontraktor,
<br><br>
Bersama email ini, kami informasikan bahwa pengajuan Instruksi Lapangan (IL) untuk proyek <b>${data.toko.nama_toko}</b> dengan Nomor ULOK <b>${data.toko.nomor_ulok}</b> telah <b>DISETUJUI</b> secara keseluruhan.
<br><br>
Sebagai acuan resmi pelaksanaan pekerjaan di lapangan, kami telah melampirkan dokumen PDF Instruksi Lapangan final bersama email ini.
<br><br>
Untuk melihat detail persetujuan dan rincian pekerjaan lebih lanjut, silakan akses portal resmi SPARTA melalui tautan berikut:<br>
<a href="https://building.sparta-alfamart.web.id/">https://building.sparta-alfamart.web.id/</a>
<br><br>
Demikian informasi ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.
<br><br>
Hormat kami,
<br><br>
<b>Tim SPARTA Alfamart</b>
<hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
<span style="font-size: 12px; color: #666;">(Email ini dibuat secara otomatis oleh sistem, mohon untuk tidak membalas ke alamat email ini)</span>
    `;

    const branch = data.toko.cabang;
    let ccEmailList: string[] = [];
    let toEmailList: string[] = [recipient];

    try {
        const usersFound = await userCabangRepository.findAll({ email_sat: recipient });
        const creatorUser = usersFound.length > 0 ? usersFound[0] : null;
        if (creatorUser && creatorUser.nama_pt) {
            const direkturUsers = (await userCabangRepository.findAll({ cabang: branch }))
                .filter(u => u.nama_pt?.toUpperCase() === creatorUser.nama_pt?.toUpperCase() && u.jabatan?.toUpperCase() === "DIREKTUR KONTRAKTOR");
            toEmailList.push(...direkturUsers.map(u => u.email_sat));
        }

        const ccRoles = [
            "BRANCH BUILDING & MAINTENANCE MANAGER",
            "BRANCH BUILDING COORDINATOR",
            "BRANCH BUILDING SUPPORT"
        ];
        
        for (const role of ccRoles) {
            const users = await userCabangRepository.findAll({ cabang: branch, jabatan: role });
            ccEmailList.push(...users.map(u => u.email_sat));
        }
    } catch (e) {
        console.warn("[IL][EMAIL] Gagal mengambil list email cc/direktur:", e);
    }

    // Filter duplicates and valid emails
    toEmailList = Array.from(new Set(toEmailList.filter(e => e && e.trim() !== "")));
    ccEmailList = Array.from(new Set(ccEmailList.filter(e => e && e.trim() !== "" && !toEmailList.includes(e))));

    const options = {
        from: `"Tim SPARTA Alfamart" <${env.EMAIL_USER}>`,
        to: toEmailList.join(", "),
        cc: ccEmailList.join(", "),
        subject: `[DISETUJUI] Instruksi Lapangan (IL) Proyek ${data.toko.nama_toko} - ${data.toko.nomor_ulok}`,
        html: htmlBody,
        attachments: [
            {
                filename: pdfFilename,
                content: pdfBuffer,
            }
        ]
    };

    try {
        const mail = new MailComposer(options);
        const messageBuffer = await mail.compile().build();
        const encodedMessage = messageBuffer
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: encodedMessage },
        });
        console.log(`[IL][EMAIL] Email persetujuan IL berhasil dikirim ke ${recipient}`);
    } catch (err: any) {
        console.error(`[IL][EMAIL] Gagal mengirim email persetujuan IL ke ${recipient}:`, err?.message || err);
    }
}

export const instruksiLapanganService = {
    async submit(
        payload: SubmitInstruksiLapanganInput,
        files: { lampiranFile?: { originalname: string; buffer: Buffer; mimetype: string } }
    ) {
        // Validate Toko. Prefer id_toko because nomor_ulok can exist for multiple scopes (Sipil/ME).
        const toko = payload.id_toko
            ? await instruksiLapanganRepository.getTokoById(payload.id_toko)
            : await instruksiLapanganRepository.getTokoByUlok(payload.nomor_ulok, payload.lingkup_pekerjaan);

        if (!toko) {
            throw new AppError(`Toko dengan nomor ULOK ${payload.nomor_ulok} tidak ditemukan`, 404);
        }

        if (toko.nomor_ulok !== payload.nomor_ulok) {
            throw new AppError("id_toko tidak sesuai dengan nomor ULOK yang dipilih", 409);
        }

        if (
            payload.lingkup_pekerjaan &&
            toko.lingkup_pekerjaan &&
            toko.lingkup_pekerjaan.trim().toUpperCase() !== payload.lingkup_pekerjaan.trim().toUpperCase()
        ) {
            throw new AppError("id_toko tidak sesuai dengan lingkup pekerjaan yang dipilih", 409);
        }

        console.log("[IL][SUBMIT_SERVICE] Toko tervalidasi, mulai simpan", {
            id_toko: toko.id,
            nomor_ulok: toko.nomor_ulok,
            lingkup_pekerjaan: toko.lingkup_pekerjaan,
            item_count: payload.detail_items.length,
            is_revisi: Boolean(payload.id_instruksi_lapangan_revisi)
        });

        let lampiranPath: string | undefined;

        if (files.lampiranFile) {
            lampiranPath = await saveUploadToTemp(files.lampiranFile);
        }

        let idInstruksiLapangan: number;

        if (payload.id_instruksi_lapangan_revisi) {
            const existing = await instruksiLapanganRepository.getHeaderAndToko(payload.id_instruksi_lapangan_revisi);
            if (!existing) {
                throw new AppError("Instruksi Lapangan revisi tidak ditemukan", 404);
            }
            if (existing.instruksiLapangan.id_toko !== toko.id) {
                throw new AppError("Instruksi Lapangan revisi tidak sesuai dengan ULOK yang dipilih", 409);
            }
            if (existing.instruksiLapangan.status.toUpperCase() !== "DITOLAK") {
                throw new AppError("Hanya Instruksi Lapangan berstatus Ditolak yang dapat direvisi", 409);
            }

            idInstruksiLapangan = await instruksiLapanganRepository.replaceRejectedWithDetails(
                existing.instruksiLapangan.id,
                payload,
                lampiranPath
            );
        } else {
            idInstruksiLapangan = await instruksiLapanganRepository.insertWithItems(
                payload,
                toko.id,
                lampiranPath
            );
        }

        console.log("[IL][SUBMIT_SERVICE] Data IL berhasil tersimpan", {
            id_instruksi_lapangan: idInstruksiLapangan,
            id_toko: toko.id
        });

        // Jangan tahan response user pada proses render/upload PDF ke Drive.
        // PDF tetap dibuat background dan link akan terisi ketika proses selesai.
        generateInstruksiLapanganPdfInBackground(idInstruksiLapangan);

        return await instruksiLapanganRepository.getById(idInstruksiLapangan);
    },

    async generateAndStorePdf(idIL: number | string) {
        const data = await instruksiLapanganRepository.getHeaderAndToko(idIL);
        if (!data) return;

        const items = await instruksiLapanganRepository.getItems(idIL);
        
        const noPpn = isNoPpnArea(data.toko);

        const reportBuffer = await buildInstruksiLapanganPdfBuffer({
            instruksiLapangan: data.instruksiLapangan,
            items,
            toko: data.toko
        });

        const recapBuffer = await buildInstruksiLapanganRecapPdfBuffer({
            instruksiLapangan: data.instruksiLapangan,
            items,
            toko: data.toko
        });

        const buffersToMerge: Buffer[] = [recapBuffer, reportBuffer];

        // Also merge lampiran if it's a PDF
        if (data.instruksiLapangan.link_lampiran) {
            try {
                const lampiranBuffer = await fs.readFile(data.instruksiLapangan.link_lampiran);
                // check if it's pdf magic number
                if (lampiranBuffer.subarray(0, 4).toString('hex') === '25504446') {
                    buffersToMerge.push(lampiranBuffer);
                }
            } catch (err) {
                console.warn("Could not read lampiran for merging", err);
            }
        }

        const mergedBuffer = await mergePdfBuffers(buffersToMerge);

        const pdfFilename = `Instruksi_Lapangan_${data.toko.nomor_ulok}_${Date.now()}`;

        const [linkGabungan, linkNonSbo, linkRekap] = await Promise.all([
            uploadPdfToDrive(mergedBuffer, `${pdfFilename}_Gabungan.pdf`, data.toko.nomor_ulok, data.toko.proyek),
            uploadPdfToDrive(reportBuffer, `${pdfFilename}_NonSBO.pdf`, data.toko.nomor_ulok, data.toko.proyek),
            uploadPdfToDrive(recapBuffer, `${pdfFilename}_Rekapitulasi.pdf`, data.toko.nomor_ulok, data.toko.proyek)
        ]);

        const total = items.reduce((acc, item) => acc + Number(item.total_harga || 0), 0);
        const roundedDown = Math.floor(total / 10000) * 10000;
        const ppn = noPpn ? 0 : roundedDown * 0.11;
        const finalTotal = roundedDown + ppn;

        await instruksiLapanganRepository.updatePdfLinks(idIL, {
            pdfGabungan: linkGabungan || "",
            pdfNonSbo: linkNonSbo || "",
            pdfRekapitulasi: linkRekap || "",
            grandTotalNonSbo: total.toString(),
            grandTotalFinal: finalTotal.toString()
        });
    },

    async list(query: ListInstruksiLapanganQuery) {
        return await instruksiLapanganRepository.findMany(query);
    },

    async getById(id: string) {
        const data = await instruksiLapanganRepository.getHeaderAndToko(id);
        if (!data) throw new AppError("Instruksi Lapangan tidak ditemukan", 404);

        const items = await instruksiLapanganRepository.getItems(id);
        return { ...data.instruksiLapangan, toko: data.toko, items };
    },

    async getPdfDownloadPayload(id: string) {
        const data = await instruksiLapanganRepository.getHeaderAndToko(id);
        if (!data) throw new AppError("Instruksi Lapangan tidak ditemukan", 404);

        const items = await instruksiLapanganRepository.getItems(id);
        
        const reportBuffer = await buildInstruksiLapanganPdfBuffer({
            instruksiLapangan: data.instruksiLapangan,
            items,
            toko: data.toko
        });

        const recapBuffer = await buildInstruksiLapanganRecapPdfBuffer({
            instruksiLapangan: data.instruksiLapangan,
            items,
            toko: data.toko
        });

        const buffersToMerge: Buffer[] = [recapBuffer, reportBuffer];
        if (data.instruksiLapangan.link_lampiran) {
            try {
                const lampiranBuffer = await fs.readFile(data.instruksiLapangan.link_lampiran);
                if (lampiranBuffer.subarray(0, 4).toString('hex') === '25504446') {
                    buffersToMerge.push(lampiranBuffer);
                }
            } catch (err) {
                console.warn("Could not read lampiran for merging", err);
            }
        }

        const mergedBuffer = await mergePdfBuffers(buffersToMerge);

        return {
            filename: generateStandardFilename("IL", data.toko.nomor_ulok, data.toko.nama_toko, data.toko.lingkup_pekerjaan, ".pdf"),
            pdfBuffer: mergedBuffer
        };
    },

    async getAssetDownloadPayload(id: string, assetType: "lampiran") {
        const data = await instruksiLapanganRepository.getHeaderAndToko(id);
        if (!data) throw new AppError("Instruksi Lapangan tidak ditemukan", 404);

        const assetPath = data.instruksiLapangan.link_lampiran;
        if (!assetPath) {
            throw new AppError(`File ${assetType} tidak tersedia untuk Instruksi Lapangan ini`, 404);
        }

        try {
            const buffer = await fs.readFile(assetPath);
            const ext = path.extname(assetPath).toLowerCase();
            const contentType = ext === ".pdf" ? "application/pdf"
                : ext === ".png" ? "image/png"
                : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
                : "application/octet-stream";

            return {
                filename: `${assetType}_${data.toko.nomor_ulok}${ext}`,
                contentType,
                fileBuffer: buffer
            };
        } catch {
            throw new AppError(`File ${assetType} tidak dapat dibaca dari server`, 500);
        }
    },

    async handleApproval(id: string, action: ApprovalActionInput) {
        const data = await instruksiLapanganRepository.getHeaderAndToko(id);
        if (!data) throw new AppError("Instruksi Lapangan tidak ditemukan", 404);

        const currentStatus = data.instruksiLapangan.status;

        if (action.tindakan === "APPROVE") {
            if (currentStatus === "Menunggu Persetujuan Koordinator") {
                if (action.jabatan !== "KOORDINATOR") {
                    throw new AppError("Instruksi Lapangan saat ini menunggu approval Koordinator", 403);
                }

                const isBatam = data.toko.cabang?.toUpperCase() === "BATAM";

                await instruksiLapanganRepository.updateApproval(
                    id,
                    isBatam ? "Disetujui" : "Menunggu Persetujuan Manager",
                    "koordinator",
                    action.approver_email,
                    undefined,
                    action.catatan_approval ?? null
                );
                
                if (isBatam) {
                    // Sync to Opname Final if exists, since we bypass manager
                    await opnameRepository.syncApprovedInstruksiLapangan(data.toko.id, Number(id)).catch(err => {
                        console.error("Failed to sync approved Instruksi Lapangan to Opname:", err);
                    });
                }
            } else if (currentStatus === "Menunggu Persetujuan Manager") {
                const isBatam = data.toko.cabang?.toUpperCase() === "BATAM";
                const isKoordinatorBatam = isBatam && action.jabatan === "KOORDINATOR";

                if (action.jabatan !== "MANAGER" && !isKoordinatorBatam) {
                    throw new AppError("Instruksi Lapangan saat ini menunggu approval Manager", 403);
                }

                await instruksiLapanganRepository.updateApproval(
                    id,
                    "Disetujui",
                    isKoordinatorBatam ? "koordinator" : "manager",
                    action.approver_email,
                    undefined,
                    action.catatan_approval ?? null
                );
                
                // Sync to Opname Final if exists
                await opnameRepository.syncApprovedInstruksiLapangan(data.toko.id, Number(id)).catch(err => {
                    console.error("Failed to sync approved Instruksi Lapangan to Opname:", err);
                });
            } else {
                throw new AppError(`Status tidak dapat di-approve dari state saat ini: ${currentStatus}`, 400);
            }
        } else if (action.tindakan === "REJECT") {
            const role = currentStatus === "Menunggu Persetujuan Koordinator" ? "koordinator"
                : currentStatus === "Menunggu Persetujuan Manager" ? "manager"
                : null;

            if (!role) {
                throw new AppError(`Status tidak dapat di-reject dari state saat ini: ${currentStatus}`, 400);
            }

            if (
                (role === "koordinator" && action.jabatan !== "KOORDINATOR") ||
                (role === "manager" && action.jabatan !== "MANAGER")
            ) {
                throw new AppError(`Instruksi Lapangan saat ini menunggu approval ${role === "koordinator" ? "Koordinator" : "Manager"}`, 403);
            }
            
            await instruksiLapanganRepository.updateApproval(
                id,
                "Ditolak",
                role,
                action.approver_email,
                action.alasan_penolakan ?? undefined,
                action.catatan_approval ?? null
            );
        } else {
            throw new AppError("Action tidak valid", 400);
        }

        // Regenerate PDF after status change
        await this.generateAndStorePdf(id);

        if (action.tindakan === "APPROVE" && currentStatus === "Menunggu Persetujuan Manager") {
            // Injeksi otomatis kategori IL ke Gantt Chart (background, non-blocking)
            setImmediate(() => {
                instruksiLapanganRepository.injectApprovedIlToGantt(id)
                    .then(({ injected, skipped }) => {
                        console.log(`[IL][GANTT_INJECT] IL id=${id}: ${injected} kategori diinjeksi, ${skipped} dilewati`);
                    })
                    .catch((err) => {
                        console.error(`[IL][GANTT_INJECT] Error background inject IL id=${id}:`, err?.message || err);
                    });
            });

            try {
                const pdfPayload = await this.getPdfDownloadPayload(id);
                const updatedData = await instruksiLapanganRepository.getHeaderAndToko(id);
                if (updatedData) {
                    sendILApprovalEmail(updatedData, pdfPayload.pdfBuffer, pdfPayload.filename).catch(e => {
                        console.error("[IL][EMAIL_BACKGROUND] Error:", e);
                    });
                }
            } catch (err: any) {
                console.error("[IL][EMAIL] Gagal mendapatkan PDF untuk dilampirkan:", err?.message || err);
            }
        }

        return await instruksiLapanganRepository.getById(id);
    }
};
