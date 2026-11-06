import type { Request, Response } from "express";
import { AppError } from "../../common/app-error";
import { priceRabService } from "./price-rab.service";

async function handleGetData(req: Request, res: Response) {
    const cabang = String(req.query.cabang ?? "");
    const lingkup = String(req.query.lingkup ?? "");

    if (!cabang || !lingkup) {
        return res.status(400).json({ error: "Missing 'cabang' or 'lingkup' parameter" });
    }

    try {
        const data = await priceRabService.getData(cabang, lingkup);
        return res.json(data);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json({ error: error.message });
        }

        console.error(error);
        return res.status(500).json({ error: `An internal server error occurred: ${String(error)}` });
    }
}

export const getData = handleGetData;
export const getDataPriceRab = handleGetData;
