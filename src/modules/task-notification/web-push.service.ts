import webpush from 'web-push';
import { getAllSubscribedEmails, getSubscriptionsByEmail, deleteSubscription } from './web-push.repository';
import { taskNotificationRepository } from './task-notification.repository';
import { pool } from '../../db/pool';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:building_development@sat.co.id',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

export const sendDailyWebPush = async () => {
    console.log('[Web Push] Memulai pengiriman Web Push harian...');
    if (!process.env.VAPID_PUBLIC_KEY) {
        console.warn('[Web Push] VAPID keys not configured. Skipping push.');
        return;
    }

    try {
        const emails = await getAllSubscribedEmails();

        for (const email of emails) {
            const res = await pool.query(
                `SELECT email_sat, cabang, jabatan, 
                 COALESCE(nama_lengkap, '') as nama_lengkap, 
                 COALESCE(nama_pt, '') as nama_pt
                 FROM user_cabang 
                 WHERE email_sat = $1`,
                [email]
            );

            if ((res.rowCount ?? 0) === 0) continue;

            const subs = await getSubscriptionsByEmail(email);
            if (subs.length === 0) continue; // Skip jika user tidak punya subscription aktif

            for (const userData of res.rows) {
                const mockUser = {
                    id: 0,
                    email_sat: userData.email_sat,
                    cabang: userData.cabang,
                    jabatan: userData.jabatan,
                    nama_lengkap: userData.nama_lengkap,
                    nama_pt: userData.nama_pt,
                    roles: userData.jabatan ? userData.jabatan.split(',').map((r: string) => r.trim()) : [],
                };

                const groups = await taskNotificationRepository.getGroups(mockUser as any);
                const roleCount = groups.reduce((sum, group) => sum + group.count, 0);

                if (roleCount > 0) {
                    const payload = JSON.stringify({
                        title: `Tugas SPARTA (${userData.jabatan} - ${userData.cabang})`,
                        body: `Anda memiliki ${roleCount} tugas menunggu tindakan hari ini.`,
                        url: "/"
                    });

                    for (const subRow of subs) {
                        if ((subRow as any).isDeleted) continue; // Skip jika endpoint sudah mati

                        const pushSub = {
                            endpoint: subRow.endpoint,
                            keys: {
                                p256dh: subRow.p256dh,
                                auth: subRow.auth
                            }
                        };

                        try {
                            await webpush.sendNotification(pushSub, payload);
                        } catch (error: any) {
                            if (error.statusCode === 410 || error.statusCode === 404) {
                                await deleteSubscription(subRow.endpoint);
                                (subRow as any).isDeleted = true; // Tandai agar tidak dikirimi lagi di iterasi role berikutnya
                            } else {
                                console.error("[Web Push] Gagal mengirim ke", email, error);
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("[Web Push] Error executing daily push", err);
    }
};
