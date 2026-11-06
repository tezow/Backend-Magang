import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { createPicPengawasanSchema, listPicPengawasanQuerySchema } from "./pic-pengawasan.schema";
import { picPengawasanService } from "./pic-pengawasan.service";

export const createPicPengawasan = asyncHandler(async (req: Request, res: Response) => {
    const payload = createPicPengawasanSchema.parse(req.body);
    const data = await picPengawasanService.create(payload);

    res.status(201).json({
        status: "success",
        message: "Data pic_pengawasan berhasil disimpan",
        data
    });
});

export const listPicPengawasan = asyncHandler(async (req: Request, res: Response) => {
    const query = listPicPengawasanQuerySchema.parse(req.query);
    const data = await picPengawasanService.list(query);

    res.json({ status: "success", data });
});

export const getPicPengawasanById = asyncHandler(async (req: Request, res: Response) => {
    const data = await picPengawasanService.getById(req.params.id);
    res.json({ status: "success", data });
});