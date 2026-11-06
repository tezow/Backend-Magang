import crypto from "crypto";
import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { renderHtmlTemplate, resolveTemplatePath } from "../../common/html-pdf";
import { env } from "../../config/env";
import { authOtpRepository } from "./auth-otp.repository";

const OTP_TTL_MINUTES = 5;
const OTP_CODE_LENGTH = 6;

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

const buildRawEmail = (input: { from: string; to: string; subject: string; html: string }) => {
    const encodedHtml = wrapBase64(Buffer.from(input.html, "utf-8").toString("base64"));
    const message = [
        `From: ${input.from}`,
        `To: ${input.to}`,
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

const generateOtpCode = () => {
    const value = crypto.randomInt(0, 10 ** OTP_CODE_LENGTH);
    return String(value).padStart(OTP_CODE_LENGTH, "0");
};

const hashOtpCode = (otpCode: string) => {
    return crypto.createHash("sha256").update(otpCode).digest("hex");
};

const toTimestampMs = (value: Date | string): number => {
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value);
    return parsed.getTime();
};

export const authOtpService = {
    async createAndSend(input: { email_sat: string; cabang: string; nama_lengkap?: string | null }) {
        const otpCode = generateOtpCode();
        const otpHash = hashOtpCode(otpCode);
        const otpToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

        await authOtpRepository.invalidateActive(input.email_sat, input.cabang);
        const otpRow = await authOtpRepository.create({
            email_sat: input.email_sat,
            cabang: input.cabang,
            otp_hash: otpHash,
            otp_token: otpToken,
            expires_at: expiresAt
        });

        if (!env.EMAIL_USER) {
            throw new AppError("EMAIL_USER belum diset", 500);
        }

        const templatePath = await resolveTemplatePath("login_otp.njk");
        const html = await renderHtmlTemplate(templatePath, {
            greeting: getFormalGreeting(),
            nama_lengkap: input.nama_lengkap?.trim() || "User Head Office",
            email_sat: input.email_sat,
            cabang: input.cabang,
            otp_code: otpCode,
            expired_minutes: OTP_TTL_MINUTES,
            sent_at: formatJakartaTimestamp()
        });

        const gp = GoogleProvider.instance;
        const gmail = gp.spartaGmail;
        if (!gmail) {
            throw new AppError("Google Gmail belum terkonfigurasi", 500);
        }

        const raw = buildRawEmail({
            from: env.EMAIL_USER,
            to: input.email_sat,
            subject: "SPARTA Building - Kode OTP Login",
            html
        });

        await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw }
        });

        return {
            otp_token: otpRow.otp_token,
            otp_expires_at: otpRow.expires_at
        };
    },

    async verify(input: { email_sat: string; cabang: string; otp_token: string; otp_code: string }) {
        const record = await authOtpRepository.findActiveByToken(input.email_sat, input.cabang, input.otp_token);
        if (!record) {
            throw new AppError("OTP tidak ditemukan atau sudah digunakan", 401);
        }

        const expiresAtMs = toTimestampMs(record.expires_at);
        if (Number.isNaN(expiresAtMs)) {
            throw new AppError("Waktu kadaluarsa OTP tidak valid", 500);
        }

        if (expiresAtMs < Date.now()) {
            throw new AppError("OTP sudah kadaluarsa", 401);
        }

        const hashed = hashOtpCode(input.otp_code);
        if (hashed !== record.otp_hash) {
            throw new AppError("OTP salah", 401);
        }

        await authOtpRepository.consumeById(record.id);

        return true;
    }
};
