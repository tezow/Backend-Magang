import { Router } from "express";
import { createPicPengawasan, getPicPengawasanById, listPicPengawasan } from "./pic-pengawasan.controller";

const picPengawasanRouter = Router();

picPengawasanRouter.post("/", createPicPengawasan);
picPengawasanRouter.get("/", listPicPengawasan);
picPengawasanRouter.get("/:id", getPicPengawasanById);

export { picPengawasanRouter };