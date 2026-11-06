import { Router } from "express";
import { getDendaByTokoId } from "./denda.controller";
import { spRouter } from "../surat-peringatan/sp.routes";

const dendaRouter = Router();

// Mount Surat Peringatan routes
dendaRouter.use("/actions", spRouter);

// Legacy denda calculation route
dendaRouter.get("/:id_toko", getDendaByTokoId);

export { dendaRouter };
