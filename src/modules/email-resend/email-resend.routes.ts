import { Router } from "express";
import {
    debugOAuthClients,
    getCabangList,
    getLingkupByUlok,
    getUlokByCabang,
    resendRabEmail,
    resendSpkEmail,
} from "./email-resend.controller";

const emailResendRouter = Router();

emailResendRouter.get("/debug/oauth-clients", debugOAuthClients);
emailResendRouter.post("/resend-email", resendRabEmail);
emailResendRouter.post("/resend-email-spk", resendSpkEmail);
emailResendRouter.get("/ulok-by-cabang", getUlokByCabang);
emailResendRouter.get("/lingkup-by-ulok", getLingkupByUlok);
emailResendRouter.get("/cabang-list", getCabangList);

export { emailResendRouter };
