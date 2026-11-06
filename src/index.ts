import { app } from "./app";
import { env } from "./config/env";
import { GoogleProvider } from "./common/google";
import { authOtpRepository } from "./modules/auth/auth-otp.repository";
import { authSessionRepository } from "./modules/auth/auth-session.repository";
import { userCabangRepository } from "./modules/user-cabang/user-cabang.repository";
import { systemMaintenanceService } from "./modules/system-maintenance/system-maintenance.service";
import { systemAccessScheduleService } from "./modules/system-access-schedule/system-access-schedule.service";
import { serahTerimaService } from "./modules/serah-terima/serah-terima.service";
import { spCronService } from "./modules/surat-peringatan/sp.cron.service";
import { spkBackdatePolicyService } from "./modules/spk-backdate-policy/spk-backdate-policy.service";
// import { requestIntervensiService } from "./modules/request-intervensi/request-intervensi.service";
import { sendDailyWebPush } from "./modules/task-notification/web-push.service";

const cleanupAuthSessions = async () => {
    const deletedCount = await authSessionRepository.deleteExpiredOlderThan(env.AUTH_SESSION_RETENTION_DAYS);
    if (deletedCount > 0) {
        console.log(`Auth session cleanup: ${deletedCount} session lama dihapus`);
    }
};

/**
 * Hitung millisecond sampai waktu target berikutnya (WIB = UTC+7).
 * @param hour  Jam target WIB (0–23)
 * @param minute Menit target (default 0)
 */
function msUntilNextWibTime(hour: number, minute = 0): number {
    const now = new Date();
    // WIB offset = UTC+7 = 7*60 = 420 menit
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const nowWib = new Date(now.getTime() + wibOffsetMs);

    const next = new Date(nowWib);
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= nowWib) next.setUTCDate(next.getUTCDate() + 1);

    return next.getTime() - nowWib.getTime();
}

/** Jadwalkan fungsi jalan setiap hari pada jam tertentu WIB */
function scheduleDailyWib(hour: number, minute: number, fn: () => Promise<void>, label: string) {
    const startIn = msUntilNextWibTime(hour, minute);
    console.log(`[Scheduler] ${label} akan mulai dalam ${Math.round(startIn / 60000)} menit (jam ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} WIB)`);

    setTimeout(() => {
        fn().catch((e) => console.error(`[Scheduler] ${label} error:`, e));
        setInterval(() => {
            fn().catch((e) => console.error(`[Scheduler] ${label} error:`, e));
        }, 24 * 60 * 60 * 1000).unref();
    }, startIn).unref();
}

/** Jadwalkan fungsi jalan setiap Senin pada jam tertentu WIB */
function scheduleWeeklyMondayWib(hour: number, minute: number, fn: () => Promise<void>, label: string) {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    function msUntilNextMonday(): number {
        const wibOffsetMs = 7 * 60 * 60 * 1000;
        const nowWib = new Date(Date.now() + wibOffsetMs);
        const dayOfWeek = nowWib.getUTCDay(); // 0=Sun, 1=Mon
        const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7 || 7;
        const next = new Date(nowWib);
        next.setUTCDate(next.getUTCDate() + daysUntilMonday);
        next.setUTCHours(hour, minute, 0, 0);
        if (next <= nowWib) next.setUTCDate(next.getUTCDate() + 7);
        return next.getTime() - nowWib.getTime();
    }

    const startIn = msUntilNextMonday();
    console.log(`[Scheduler] ${label} akan mulai dalam ${Math.round(startIn / 3600000)} jam (Senin jam ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} WIB)`);

    setTimeout(() => {
        fn().catch((e) => console.error(`[Scheduler] ${label} error:`, e));
        setInterval(() => {
            fn().catch((e) => console.error(`[Scheduler] ${label} error:`, e));
        }, WEEK_MS).unref();
    }, startIn).unref();
}

const bootstrap = async () => {
    await GoogleProvider.initialize();
    await authSessionRepository.ensureSchema();
    await authOtpRepository.ensureSchema();
    await userCabangRepository.ensureLoginTrackingSchema();
    await systemMaintenanceService.ensureSchema();
    await systemAccessScheduleService.ensureSchema();
    await spkBackdatePolicyService.ensureSchema();
    await serahTerimaService.ensureDateCorrectionAuditSchema();
    // await requestIntervensiService.ensureSchema();
    await cleanupAuthSessions();

    // ── Auth session cleanup: setiap hari ──
    setInterval(() => {
        cleanupAuthSessions().catch((error) => {
            console.warn("Auth session cleanup gagal:", error);
        });
    }, 24 * 60 * 60 * 1000).unref();

    // ── SP Cron: mark expired SP — setiap hari jam 00:05 WIB ──
    scheduleDailyWib(0, 5, async () => {
        console.log("[SP Cron] Auto: markExpiredSp");
        await spCronService.markExpiredSp();
    }, "SP markExpiredSp");

    // ── SP Cron: expiry reminders — setiap hari jam 08:00 WIB ──
    scheduleDailyWib(8, 0, async () => {
        console.log("[SP Cron] Auto: checkAndSendExpiryReminders");
        await spCronService.checkAndSendExpiryReminders();
    }, "SP expiryReminders");

    // ── SP Cron: weekly summary — setiap Senin jam 07:00 WIB ──
    scheduleWeeklyMondayWib(7, 0, async () => {
        console.log("[SP Cron] Auto: generateWeeklySummary");
        await spCronService.generateWeeklySummary();
    }, "SP weeklySummary");

    // ── Web Push: pengingat tugas — 08:00, 10:00, 13:00, 16:00 WIB ──
    const pushHours = [8, 10, 13, 16];
    for (const h of pushHours) {
        scheduleDailyWib(h, 0, async () => {
            console.log(`[Web Push Cron] Auto: sendDailyWebPush (Jam ${h}:00)`);
            await sendDailyWebPush();
        }, `WebPush dailyReminder ${h}:00`);
    }
};

app.listen(env.PORT, () => {
    console.log(`rab-service running on port ${env.PORT}`);

    bootstrap()
        .then(() => {
            console.log("Startup bootstrap selesai");
        })
        .catch((error) => {
            console.error("Startup bootstrap gagal:", error);
        });
});
