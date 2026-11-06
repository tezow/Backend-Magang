import { Router } from "express";
import {
    listSpkBackdatePolicy,
    updateSpkBackdatePolicy,
} from "./spk-backdate-policy.controller";

const spkBackdatePolicyRouter = Router();

spkBackdatePolicyRouter.get("/", listSpkBackdatePolicy);
spkBackdatePolicyRouter.put("/branches", updateSpkBackdatePolicy);

export { spkBackdatePolicyRouter };
