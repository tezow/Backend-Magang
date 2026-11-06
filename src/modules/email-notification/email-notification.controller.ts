import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { sendEmailNotificationSchema } from "./email-notification.schema";
import { emailNotificationService } from "./email-notification.service";

export const sendEmailNotification = asyncHandler(async (req: Request, res: Response) => {
    const payload = sendEmailNotificationSchema.parse(req.body);
    const result = await emailNotificationService.send(payload);

    res.json({
        status: "success",
        message: "Email notifikasi berhasil dikirim",
        data: result
    });
});
