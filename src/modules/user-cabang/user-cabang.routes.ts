import { Router } from "express";
import {
    createUserCabang,
    deleteUserCabangById,
    getUserCabangById,
    listUserCabang,
    updateUserCabangById,
    getMyCoverage
} from "./user-cabang.controller";

const userCabangRouter = Router();

userCabangRouter.get("/my-coverage", getMyCoverage);
userCabangRouter.post("/", createUserCabang);
userCabangRouter.get("/", listUserCabang);
userCabangRouter.get("/:id", getUserCabangById);
userCabangRouter.put("/:id", updateUserCabangById);
userCabangRouter.delete("/:id", deleteUserCabangById);

export { userCabangRouter };
