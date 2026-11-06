import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { taskNotificationRepository } from "./task-notification.repository";
import { saveSubscription } from "./web-push.repository";

export const getTaskNotifications = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
        res.status(401).json({
            status: "error",
            message: "Sesi tidak valid atau sudah berakhir."
        });
        return;
    }

    const groups = await taskNotificationRepository.getGroups(user);

    res.json({
        status: "success",
        data: {
            total: groups.reduce((sum, group) => sum + group.count, 0),
            groups
        }
    });
});

export const getVapidPublicKey = (req: Request, res: Response) => {
    res.json({
        status: "success",
        data: {
            publicKey: process.env.VAPID_PUBLIC_KEY
        }
    });
};

export const subscribeToWebPush = asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user || !user.email_sat) {
        res.status(401).json({
            status: "error",
            message: "Sesi tidak valid atau email tidak ditemukan."
        });
        return;
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
        res.status(400).json({
            status: "error",
            message: "Data subscription tidak valid."
        });
        return;
    }

    await saveSubscription(user.email_sat, subscription);

    res.status(201).json({
        status: "success",
        message: "Berhasil berlangganan notifikasi web push."
    });
});
