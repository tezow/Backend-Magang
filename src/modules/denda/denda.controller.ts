import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { calculateDendaByTokoId } from "./denda-keterlambatan";
import { z } from "zod";

const dendaParamsSchema = z.object({
    id_toko: z.coerce.number().positive(),
});

export const getDendaByTokoId = asyncHandler(async (req: Request, res: Response) => {
    const { id_toko } = dendaParamsSchema.parse(req.params);
    const data = await calculateDendaByTokoId(id_toko);

    res.json({ status: "success", data });
});
