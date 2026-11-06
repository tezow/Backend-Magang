import { Router } from "express";
import { sendEmailNotification } from "./email-notification.controller";

const emailNotificationRouter = Router();

emailNotificationRouter.post("/send-email-notification", sendEmailNotification);

export { emailNotificationRouter };
