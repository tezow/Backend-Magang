import { Router } from "express";
import { createToko, getTokoByNomorUlok, getTokoDetail, listToko, updateTokoById } from "./toko.controller";

const tokoRouter = Router();

tokoRouter.post("/", createToko);
tokoRouter.put("/:id", updateTokoById);
tokoRouter.get("/", listToko);
tokoRouter.get("/detail", getTokoDetail);
tokoRouter.get("/:nomorUlok", getTokoByNomorUlok);

export { tokoRouter };
