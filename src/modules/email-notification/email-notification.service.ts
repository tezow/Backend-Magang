import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { renderHtmlTemplate, resolveTemplatePath } from "../../common/html-pdf";
import { env } from "../../config/env";
import { rabRepository } from "../rab/rab.repository";
import { spkRepository } from "../spk/spk.repository";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import { spRepository } from "../surat-peringatan/sp.repository";
import type { SendEmailNotificationInput } from "./email-notification.schema";

type EmailTemplateConfig = {
    template: string;
    subject: string;
    targetJabatan: string;
    ccJabatan?: string | string[];
};

const TEMPLATE_MAP: Record<string, EmailTemplateConfig> = {
    "send-notification-spk": {
        template: "send-notification-spk.njk",
        subject: "SPARTA Building - Notifikasi Approval SPK",
        targetJabatan: "Branch Manager",
        ccJabatan: "BRANCH BUILDING & MAINTENANCE MANAGER"
    },
    "send-notification-pertambahan-spk": {
        template: "send-notification-pertambahan-spk.njk",
        subject: "SPARTA Building - Notifikasi Approval Pertambahan Hari SPK",
        targetJabatan: "Branch Manager",
        ccJabatan: "BRANCH BUILDING & MAINTENANCE MANAGER"
    },
    "notification-spk-has-approve": {
        template: "send-notification-spk-has-approve.njk",
        subject: "SPARTA Building - SPK Disetujui",
        targetJabatan: "KONTRAKTOR",
        ccJabatan: ["BRANCH MANAGER", "BRANCH BUILDING & MAINTENANCE MANAGER", "BRANCH BUILDING COORDINATOR", "BRANCH BUILDING SUPPORT"]
    },
    "notification-spk-has-reject": {
        template: "send-notification-spk-has-reject.njk",
        subject: "SPARTA Building - SPK Ditolak",
        targetJabatan: "KONTRAKTOR"
    },
    "notification-sp-has-approve": {
        template: "send-notification-sp-has-approve.njk",
        subject: "SPARTA Building - Surat Peringatan Disetujui",
        targetJabatan: "KONTRAKTOR"
    },
    "notification-rab-has-approve": {
        template: "send-notification-rab-has-approve.njk",
        subject: "SPARTA Building - RAB Disetujui",
        targetJabatan: "KONTRAKTOR",
        ccJabatan: ["BRANCH BUILDING & MAINTENANCE MANAGER", "BRANCH BUILDING COORDINATOR", "BRANCH BUILDING SUPPORT"]
    },
    "notification-rab-has-reject": {
        template: "send-notification-rab-has-reject.njk",
        subject: "SPARTA Building - RAB Direvisi / Ditolak",
        targetJabatan: "KONTRAKTOR",
        ccJabatan: "BRANCH BUILDING & MAINTENANCE MANAGER"
    }
};

const formatJakartaTimestamp = () => {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(new Date());
};

const getJakartaHour = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        hour12: false
    }).formatToParts(new Date());
    const hourPart = parts.find((part) => part.type === "hour")?.value ?? "00";
    return Number(hourPart);
};

const getFormalGreeting = () => {
    const hour = getJakartaHour();
    if (hour >= 4 && hour < 11) return "Selamat pagi";
    if (hour >= 11 && hour < 15) return "Selamat siang";
    if (hour >= 15 && hour < 18) return "Selamat sore";
    return "Selamat malam";
};

const wrapBase64 = (value: string, lineLength = 76) => {
    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += lineLength) {
        chunks.push(value.slice(index, index + lineLength));
    }
    return chunks.join("\r\n");
};

const normalizeEmailList = (emails: Array<string | null | undefined>) => {
    const cleaned = emails
        .map((email) => (email ?? "").trim())
        .filter(Boolean);

    return Array.from(new Set(cleaned));
};

const normalizeCompanyName = (value?: string | null): string =>
    String(value ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .replace(/\b(PT|CV)\b/g, "")
        .replace(/^(PT|CV)/, "")
        .replace(/(PT|CV)$/, "");

const buildRawEmail = (input: { from: string; to: string; cc?: string; subject: string; html: string }) => {
    const encodedHtml = wrapBase64(Buffer.from(input.html, "utf-8").toString("base64"));
    const message = [
        `From: ${input.from}`,
        `To: ${input.to}`,
        input.cc ? `Cc: ${input.cc}` : null,
        `Subject: ${input.subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=\"UTF-8\"",
        "Content-Transfer-Encoding: base64",
        "",
        encodedHtml
    ]
        .filter((line) => line !== null)
        .join("\r\n");

    return Buffer.from(message, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
};

export const emailNotificationService = {
    async send(payload: SendEmailNotificationInput) {
        const templateConfig = TEMPLATE_MAP[payload.flag];
        if (!templateConfig) {
            throw new AppError(`Template email untuk flag ${payload.flag} tidak ditemukan`, 400);
        }

        const isKontraktorTarget = templateConfig.targetJabatan.toUpperCase() === "KONTRAKTOR";
        const shouldUseSpkContractorEmails =
            Boolean(payload.id_spk) &&
            (payload.flag === "notification-spk-has-approve" || payload.flag === "notification-spk-has-reject");
        const shouldUseSpContractorEmails =
            Boolean(payload.id_denda_action) && payload.flag === "notification-sp-has-approve";
        const shouldUseRabEmails =
            !shouldUseSpkContractorEmails &&
            !shouldUseSpContractorEmails &&
            Boolean(payload.id_toko) &&
            (payload.flag === "notification-spk-has-approve" || payload.flag === "notification-spk-has-reject" || payload.flag === "notification-rab-has-approve");
        const spkData = shouldUseSpkContractorEmails
            ? await spkRepository.findById(String(payload.id_spk))
            : null;
        if (shouldUseSpkContractorEmails && !spkData) {
            throw new AppError(`SPK dengan id ${payload.id_spk} tidak ditemukan`, 404);
        }
        const spData = shouldUseSpContractorEmails
            ? await spRepository.findActionById(Number(payload.id_denda_action))
            : null;
        if (shouldUseSpContractorEmails && !spData) {
            throw new AppError(`SP dengan id ${payload.id_denda_action} tidak ditemukan`, 404);
        }
        const rabData = shouldUseRabEmails
            ? await rabRepository.findLatestByTokoId(payload.id_toko as number)
            : null;
        if (shouldUseRabEmails && !rabData) {
            throw new AppError(`RAB untuk id_toko ${payload.id_toko} tidak ditemukan`, 404);
        }

        const targetUsers = !shouldUseRabEmails && !shouldUseSpkContractorEmails && !shouldUseSpContractorEmails && isKontraktorTarget
            ? await userCabangRepository.findAll({ cabang: payload.cabang, jabatan: templateConfig.targetJabatan })
            : [];
        const spkContractorUsers = shouldUseSpkContractorEmails && isKontraktorTarget
            ? (await userCabangRepository.findAll({ cabang: payload.cabang }))
                .filter((user) => normalizeCompanyName(user.nama_pt) === normalizeCompanyName(spkData?.pengajuan.nama_kontraktor) && (user.jabatan?.toUpperCase() === "KONTRAKTOR" || user.jabatan?.toUpperCase() === "DIREKTUR KONTRAKTOR"))
            : [];
        const rabContractorUsers = shouldUseRabEmails
            ? (await userCabangRepository.findAll({ cabang: payload.cabang }))
                .filter((user) => normalizeCompanyName(user.nama_pt) === normalizeCompanyName(rabData?.nama_pt) && user.jabatan?.toUpperCase() === "DIREKTUR KONTRAKTOR")
            : [];
        const spContractorUsers = shouldUseSpContractorEmails && isKontraktorTarget
            ? (await userCabangRepository.findAll({ cabang: payload.cabang, jabatan: templateConfig.targetJabatan }))
                .filter((user) => normalizeCompanyName(user.nama_pt) === normalizeCompanyName(spData?.nama_kontraktor))
            : [];
        const targetUser = !shouldUseRabEmails && !shouldUseSpkContractorEmails && !shouldUseSpContractorEmails && !isKontraktorTarget
            ? await userCabangRepository.findByCabangAndJabatan(payload.cabang, templateConfig.targetJabatan)
            : null;

        if (!shouldUseRabEmails && !shouldUseSpkContractorEmails && !shouldUseSpContractorEmails && !targetUser && targetUsers.length === 0) {
            throw new AppError(
                `User dengan jabatan "${templateConfig.targetJabatan}" untuk cabang tersebut tidak ditemukan`,
                404
            );
        }
        if (shouldUseSpkContractorEmails && spkContractorUsers.length === 0) {
            throw new AppError(
                `User kontraktor untuk ${spkData?.pengajuan.nama_kontraktor ?? "-"} di cabang ${payload.cabang} tidak ditemukan`,
                404
            );
        }
        if (shouldUseSpContractorEmails && spContractorUsers.length === 0) {
            throw new AppError(
                `User kontraktor untuk ${spData?.nama_kontraktor ?? "-"} di cabang ${payload.cabang} tidak ditemukan`,
                404
            );
        }
        const ccUsers: Array<{ email_sat: string }> = [];
        if (templateConfig.ccJabatan) {
            const ccJabatanList = Array.isArray(templateConfig.ccJabatan) ? templateConfig.ccJabatan : [templateConfig.ccJabatan];
            for (const jab of ccJabatanList) {
                const users = await userCabangRepository.findAll({ cabang: payload.cabang, jabatan: jab });
                ccUsers.push(...users);
            }
        }

        if (!env.EMAIL_USER) {
            throw new AppError("EMAIL_USER belum diset", 500);
        }

        const templatePath = await resolveTemplatePath(templateConfig.template);
        const html = await renderHtmlTemplate(templatePath, {
            cabang: payload.cabang,
            flag: payload.flag,
            sent_at: formatJakartaTimestamp(),
            greeting: getFormalGreeting(),
            nama_lengkap: isKontraktorTarget
                ? "Kontraktor"
                : targetUser?.nama_lengkap?.trim() || templateConfig.targetJabatan
        });

        const gp = GoogleProvider.instance;
        const gmail = gp.spartaGmail;
        if (!gmail) {
            throw new AppError("Google Gmail belum terkonfigurasi", 500);
        }

        const targetEmails = shouldUseRabEmails
            ? normalizeEmailList([rabData?.email_pembuat, ...rabContractorUsers.map(u => u.email_sat)])
            : shouldUseSpkContractorEmails
                ? normalizeEmailList(spkContractorUsers.map((user) => user.email_sat))
            : shouldUseSpContractorEmails
                ? normalizeEmailList(spContractorUsers.map((user) => user.email_sat))
            : normalizeEmailList(
                  isKontraktorTarget
                      ? targetUsers.map((user) => user.email_sat)
                      : [targetUser?.email_sat]
              );

        if (targetEmails.length === 0) {
            throw new AppError(
                shouldUseRabEmails
                    ? `Email pembuat RAB untuk id_toko ${payload.id_toko} tidak ditemukan`
                    : shouldUseSpkContractorEmails
                        ? `Email kontraktor SPK id ${payload.id_spk} tidak ditemukan`
                    : shouldUseSpContractorEmails
                        ? `Email kontraktor SP id ${payload.id_denda_action} tidak ditemukan`
                    : `User dengan jabatan "${templateConfig.targetJabatan}" untuk cabang tersebut tidak ditemukan`,
                404
            );
        }

        const ccEmailList = shouldUseRabEmails
            ? normalizeEmailList([
                  rabData?.pemberi_persetujuan_koordinator,
                  rabData?.pemberi_persetujuan_manager,
                  ...ccUsers.map((u) => u.email_sat)
              ]).filter((email) => !targetEmails.includes(email))
            : normalizeEmailList(ccUsers.map((u) => u.email_sat)).filter((email) => !targetEmails.includes(email));
        const ccEmail = ccEmailList.length > 0 ? ccEmailList.join(", ") : undefined;

        const raw = buildRawEmail({
            from: env.EMAIL_USER,
            to: targetEmails.join(", "),
            cc: ccEmail,
            subject: templateConfig.subject,
            html
        });

        const result = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw }
        });

        return {
            message_id: result.data.id ?? null,
            cabang: payload.cabang,
            flag: payload.flag,
            to: targetEmails.length === 1 ? targetEmails[0] : targetEmails,
            cc: ccEmail ?? null,
            subject: templateConfig.subject
        };
    },

    async sendCustom(input: {
        to: string[];
        cc?: string[];
        subject: string;
        template: string;
        templateData: Record<string, any>;
    }) {
        if (!env.EMAIL_USER) throw new AppError("EMAIL_USER belum diset", 500);
        
        const targetEmails = normalizeEmailList(input.to);
        if (targetEmails.length === 0) return null;

        const templatePath = await resolveTemplatePath(input.template);
        const html = await renderHtmlTemplate(templatePath, {
            ...input.templateData,
            sent_at: formatJakartaTimestamp(),
            greeting: getFormalGreeting(),
        });
        
        const gmail = GoogleProvider.instance.spartaGmail;
        if (!gmail) throw new AppError("Google Gmail belum terkonfigurasi", 500);

        const ccEmails = normalizeEmailList(input.cc || []).filter(e => !targetEmails.includes(e));
        const raw = buildRawEmail({
            from: env.EMAIL_USER,
            to: targetEmails.join(", "),
            cc: ccEmails.length > 0 ? ccEmails.join(", ") : undefined,
            subject: input.subject,
            html
        });

        const result = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw }
        });

        return result.data.id;
    }
};
