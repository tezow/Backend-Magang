import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { getBranchScopeCandidates } from "../../common/branch-scope";
import { GoogleProvider } from "../../common/google";
import {
    createTokoSchema,
    listTokoQuerySchema,
    loginUserCabangSchema,
    verifyOtpSchema,
    getTokoDetailQuerySchema,
    updateTokoByIdBodySchema,
    updateTokoByIdParamSchema
} from "./toko.schema";
import { tokoService } from "./toko.service";

export const createToko = asyncHandler(async (req: Request, res: Response) => {
    const payload = createTokoSchema.parse(req.body);
    const data = await tokoService.create(payload);

    res.status(201).json({ status: "success", data });
});

export const getTokoByNomorUlok = asyncHandler(async (req: Request, res: Response) => {
    const data = await tokoService.getByNomorUlok(req.params.nomorUlok);
    res.json({ status: "success", data });
});

export const getTokoDetail = asyncHandler(async (req: Request, res: Response) => {
    const query = getTokoDetailQuerySchema.parse(req.query);
    const data = await tokoService.getDetail(query);
    res.json({ status: "success", data });
});

export const updateTokoById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = updateTokoByIdParamSchema.parse(req.params);
    const payload = updateTokoByIdBodySchema.parse(req.body);
    const data = await tokoService.updateById(id, payload);
    res.json({ status: "success", data });
});

export const listToko = asyncHandler(async (req: Request, res: Response) => {
    const query = listTokoQuerySchema.parse(req.query);
    const data = await tokoService.list(query);
    res.json({ status: "success", data });
});

export const loginUserCabang = asyncHandler(async (req: Request, res: Response) => {
    const payload = loginUserCabangSchema.parse(req.body);
    const data = await tokoService.loginUserCabang(payload);
    res.json({ status: "success", data });
});

export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response) => {
    const payload = verifyOtpSchema.parse(req.body);
    const data = await tokoService.verifyLoginOtp(payload);
    res.json({ status: "success", data });
});

export const getKontraktor = async (req: Request, res: Response) => {
    const userCabang = String(req.query.cabang ?? "").trim();

    if (!userCabang) {
        return res.status(400).json({ error: "Cabang parameter is missing" });
    }

    try {
        const merged = new Set<string>();
        const candidates = getBranchScopeCandidates(userCabang);

        for (const candidate of candidates.length ? candidates : [userCabang]) {
            const candidateList = await GoogleProvider.instance.getKontraktorByCabang(candidate);
            candidateList.forEach((name) => merged.add(name));
        }

        return res.status(200).json(Array.from(merged).sort());
    } catch (error: unknown) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: errorMessage });
    }
};
