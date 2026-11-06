import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import {
    cabangLookupSchema,
    lingkupByUlokSchema,
    resendEmailSchema,
    ulokByCabangSchema,
} from "./email-resend.schema";
import { emailResendService } from "./email-resend.service";

export const debugOAuthClients = asyncHandler(async (_req: Request, res: Response) => {
    const data = await emailResendService.debugOAuthClients();
    res.json(data);
});

export const resendRabEmail = asyncHandler(async (req: Request, res: Response) => {
    const payload = resendEmailSchema.parse(req.body);
    const data = await emailResendService.resendRabEmail(payload);
    res.json(data);
});

export const resendSpkEmail = asyncHandler(async (req: Request, res: Response) => {
    const payload = resendEmailSchema.parse(req.body);
    const data = await emailResendService.resendSpkEmail(payload);
    res.json(data);
});

export const getUlokByCabang = asyncHandler(async (req: Request, res: Response) => {
    const query = ulokByCabangSchema.parse(req.query);
    const data = await emailResendService.getUlokByCabang(query);
    res.json(data);
});

export const getLingkupByUlok = asyncHandler(async (req: Request, res: Response) => {
    const query = lingkupByUlokSchema.parse(req.query);
    const data = await emailResendService.getLingkupByUlok(query);
    res.json(data);
});

export const getCabangList = asyncHandler(async (req: Request, res: Response) => {
    const query = cabangLookupSchema.parse(req.query);
    const data = await emailResendService.getCabangList(query);
    res.json(data);
});
