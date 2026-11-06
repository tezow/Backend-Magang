import { Router } from "express";
import { getData, getDataPriceRab } from "./price-rab.controller";

const priceRabRouter = Router();

priceRabRouter.get("/get-data", getData);
priceRabRouter.get("/get-data-price-rab", getDataPriceRab);

export { priceRabRouter };
