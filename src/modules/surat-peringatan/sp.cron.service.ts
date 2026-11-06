import { GoogleProvider } from "../../common/google";
import { renderHtmlTemplate, resolveTemplatePath } from "../../common/html-pdf";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { spRepository } from "./sp.repository";

/**
 * SP Cron Service - Background jobs for SP lifecycle management
 *
 * Jobs:
 * 1. Check & send expiry reminders (H-30, H-7, H-1)
 * 2. Auto-mark expired SP
 * 3. Generate weekly SP summary reports
 */

type SpWithExpiry = {
    id: number;
    nomor_surat: string | null;
    nama_kontraktor: string | null;
    cabang: string | null;
    nomor_ulok: string | null;
    sp_level: number | null;
    expires_at: string | null;
    status: string;
    manager_approved_at: string | null;
    acknowledged_by_contractor_at: string | null;
};

const REMINDER_CONFIGS = [
    { days: 30, label: "30 hari", urgency: "medium" },
    { days: 7, label: "7 hari", urgency: "high" },
    { days: 1, label: "1 hari", urgency: "critical" },
];

function daysUntilExpiry(expiresAt: string): number {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatTanggal(isoString?: string | null): string {
    if (!isoString) return "-";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return String(isoString);
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(d);
}

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return "Selamat pagi";
    if (hour >= 11 && hour < 15) return "Selamat siang";
    if (hour >= 15 && hour < 18) return "Selamat sore";
    return "Selamat malam";
}

/** Lookup email kontraktor dari tabel user_cabang berdasarkan nama_pt */
async function lookupKontraktorEmailCron(namaKontraktor: string, cabang?: string | null): Promise<string | null> {
    try {
        if (cabang) {
            const res = await pool.query<{ email_sat: string }>(
                `SELECT email_sat FROM user_cabang
                 WHERE UPPER(jabatan) = 'KONTRAKTOR'
                   AND LOWER(TRIM(COALESCE(nama_pt, ''))) = LOWER(TRIM($1))
                   AND UPPER(TRIM(COALESCE(cabang, ''))) = UPPER(TRIM($2))
                 ORDER BY email_sat ASC LIMIT 1`,
                [namaKontraktor, cabang]
            );
            if (res.rows[0]?.email_sat) return res.rows[0].email_sat;
        }
        const res2 = await pool.query<{ email_sat: string }>(
            `SELECT email_sat FROM user_cabang
             WHERE UPPER(jabatan) = 'KONTRAKTOR'
               AND LOWER(TRIM(COALESCE(nama_pt, ''))) = LOWER(TRIM($1))
             ORDER BY email_sat ASC LIMIT 1`,
            [namaKontraktor]
        );
        return res2.rows[0]?.email_sat ?? null;
    } catch (err: any) {
        console.warn(`[SP Cron] lookupKontraktorEmail error for "${namaKontraktor}":`, err?.message);
        return null;
    }
}

async function sendExpiryReminderEmail(sp: SpWithExpiry, daysLeft: number, urgency: string) {
    const gp = GoogleProvider.instance;
    const gmail = gp.spartaGmail;
    if (!gmail) {
        console.warn("[SP Cron] Gmail not configured, skipping reminder email");
        return;
    }

    // Lookup email kontraktor dari user_cabang
    const kontraktorEmail = await lookupKontraktorEmailCron(sp.nama_kontraktor ?? "", sp.cabang);
    if (!kontraktorEmail) {
        console.warn(`[SP Cron] Email tidak ditemukan untuk kontraktor "${sp.nama_kontraktor}" — reminder tidak dikirim.`);
        return;
    }

    const templateData = {
        greeting: getGreeting(),
        nama_kontraktor: sp.nama_kontraktor || "-",
        nomor_surat: sp.nomor_surat || "-",
        nomor_ulok: sp.nomor_ulok || "-",
        cabang: sp.cabang || "-",
        sp_level_romawi: sp.sp_level === 1 ? "I" : sp.sp_level === 2 ? "II" : sp.sp_level === 3 ? "III" : "-",
        days_left: daysLeft,
        urgency: urgency,
        tanggal_expired: formatTanggal(sp.expires_at),
        is_acknowledged: sp.acknowledged_by_contractor_at ? true : false,
        acknowledge_url: `${env.FRONTEND_URL}/kontraktor/surat-peringatan?id=${sp.id}&kontraktor=${encodeURIComponent(sp.nama_kontraktor || "")}`,
        sent_at: new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(new Date()),
    };

    try {
        const templatePath = await resolveTemplatePath("sp-expiry-reminder.njk");
        const htmlBody = await renderHtmlTemplate(templatePath, templateData);

        const urgencyEmoji = urgency === "critical" ? "🚨" : urgency === "high" ? "⚠️" : "⏰";
        const subject = `${urgencyEmoji} Reminder: SP ${templateData.sp_level_romawi} akan expired dalam ${daysLeft} hari - ${sp.nama_kontraktor}`;

        const messageParts = [
            `From: SPARTA Building <no-reply@sparta-building.com>`,
            `To: ${kontraktorEmail}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=utf-8`,
            ``,
            htmlBody
        ];

        const message = messageParts.join("\r\n");
        const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: encodedMessage },
        });

        console.log(`[SP Cron] Expiry reminder sent to ${kontraktorEmail}: SP #${sp.id}, ${daysLeft} days left`);
    } catch (error: any) {
        console.error(`[SP Cron] Failed to send reminder for SP #${sp.id}:`, error.message);
    }
}

export const spCronService = {
    /**
     * Check all active SP and send reminders for those approaching expiry.
     * Should run daily.
     */
    async checkAndSendExpiryReminders(): Promise<{
        checked: number;
        reminders_sent: number;
        errors: number;
    }> {
        console.log("[SP Cron] Starting expiry reminder check...");

        await spRepository.ensureSchema();

        const activeSp = await spRepository.getActiveSpWithExpiry();
        console.log(`[SP Cron] Found ${activeSp.length} active SP to check`);

        let remindersSent = 0;
        let errors = 0;

        for (const sp of activeSp) {
            if (!sp.expires_at) continue;

            const daysLeft = daysUntilExpiry(sp.expires_at);

            for (const config of REMINDER_CONFIGS) {
                if (daysLeft === config.days) {
                    try {
                        await sendExpiryReminderEmail(sp, config.days, config.urgency);
                        remindersSent++;
                    } catch (error) {
                        console.error(`[SP Cron] Error sending reminder for SP #${sp.id}:`, error);
                        errors++;
                    }
                    break; // Only send one reminder per SP per day
                }
            }
        }

        console.log(`[SP Cron] Reminder check complete. Sent: ${remindersSent}, Errors: ${errors}`);
        return {
            checked: activeSp.length,
            reminders_sent: remindersSent,
            errors,
        };
    },

    /**
     * Mark SP as expired if past expiry date.
     * Should run daily.
     */
    async markExpiredSp(): Promise<{
        checked: number;
        marked_expired: number;
    }> {
        console.log("[SP Cron] Starting expired SP check...");

        await spRepository.ensureSchema();

        const expired = await spRepository.markExpiredSp();

        console.log(`[SP Cron] Marked ${expired} SP as expired`);
        return {
            checked: expired,
            marked_expired: expired,
        };
    },

    /**
     * Generate weekly summary report for managers.
     * Should run weekly (e.g., every Monday).
     */
    async generateWeeklySummary(): Promise<{
        total_sp: number;
        active_sp: number;
        expiring_soon: number;
        pending_acknowledge: number;
    }> {
        console.log("[SP Cron] Generating weekly summary...");

        await spRepository.ensureSchema();

        const stats = await spRepository.getGlobalStats();

        console.log("[SP Cron] Weekly summary:", stats);

        // TODO: Send summary email to managers

        return stats;
    },

    /**
     * Manual trigger for testing — run all cron jobs.
     */
    async runAllJobs(): Promise<{
        reminders: any;
        expired: any;
        summary: any;
    }> {
        console.log("[SP Cron] Running all jobs manually...");

        const reminders = await this.checkAndSendExpiryReminders();
        const expired = await this.markExpiredSp();
        const summary = await this.generateWeeklySummary();

        return { reminders, expired, summary };
    }
};
