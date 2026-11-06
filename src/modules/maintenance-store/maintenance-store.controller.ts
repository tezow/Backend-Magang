import type { Request, Response } from "express";
import { maintenanceStoreService } from "./maintenance-store.service";

export const getMaintenanceStores = async (req: Request, res: Response) => {
    try {
        const { branchName } = req.query;
        const stores = await maintenanceStoreService.getStores(branchName as string);
        return res.json({ success: true, data: stores });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Gagal mengambil data toko" });
    }
};
