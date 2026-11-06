import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { AppError } from "../../common/app-error";
import { cleanUpBranchGroups } from "../toko/toko.service";
import { tokoRepository } from "../toko/toko.repository";
import { authSessionService } from "./auth-session.service";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import { userBranchCoverageRepository } from "../user-branch-coverage/user-branch-coverage.repository";
import { pool } from "../../db/pool";

import { env } from "../../config/env";
import jwt from "jsonwebtoken";

const SSO_EXCHANGE_URL = process.env.SSO_EXCHANGE_URL || "http://localhost:10000/v1/sso/exchange";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";
const SSO_JWT_SECRET = env.SSO_JWT_SECRET;

export const ssoCallback = asyncHandler(async (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token) {
        res.redirect(`${FRONTEND_URL}/auth?error=invalid_sso_token`);
        return;
    }

    try {
        const exchangeRes = await fetch(SSO_EXCHANGE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moduleId: "building", launchToken: token })
        });

        if (!exchangeRes.ok) {
            console.error("SSO Exchange failed:", await exchangeRes.text());
            res.redirect(`${FRONTEND_URL}/auth?error=sso_exchange_failed`);
            return;
        }

        const exchangeData = await exchangeRes.json();
        const email = exchangeData.data?.user?.email;

        if (!email) {
            res.redirect(`${FRONTEND_URL}/auth?error=sso_no_email`);
            return;
        }

        const registeredUsers = await tokoRepository.findUserCabangByEmailSatAll(email);

        if (registeredUsers.length === 0) {
            res.redirect(`${FRONTEND_URL}/auth?error=user_not_found`);
            return;
        }

        const payload = jwt.sign({ email }, SSO_JWT_SECRET, { expiresIn: "5m" });
        res.redirect(`${FRONTEND_URL}/auth?sso_payload=${payload}`);
    } catch (error) {
        console.error("SSO Callback Error:", error);
        res.redirect(`${FRONTEND_URL}/auth?error=sso_server_error`);
    }
});

export const ssoResolve = asyncHandler(async (req: Request, res: Response) => {
    const { payload, cabang, user_cabang_id } = req.body;

    if (!payload) throw new AppError("Payload missing", 400);

    let decoded: string | object;
    try {
        decoded = jwt.verify(payload, SSO_JWT_SECRET);
    } catch {
        throw new AppError("Token tidak valid atau kedaluwarsa", 401);
    }

    if (typeof decoded !== "object" || !("email" in decoded) || typeof decoded.email !== "string") {
        throw new AppError("Payload SSO tidak valid", 401);
    }

    const email = decoded.email;
    let registeredUsers = await tokoRepository.findUserCabangByEmailSatAll(email);
    registeredUsers = cleanUpBranchGroups(registeredUsers);

    if (registeredUsers.length === 0) {
        throw new AppError("email belum terdaftar", 404);
    }

    if (!cabang) {
        if (registeredUsers.length === 1) {
            const matchedUser = registeredUsers[0];
            const response = await buildLoginResponse({ matchedUser });
            res.json({ status: "success", data: response });
            return;
        }

        res.json({
            status: "success",
            data: {
                requires_account_selection: true,
                available_roles: registeredUsers
            }
        });
        return;
    }

    const branchCandidates = registeredUsers.filter(
        (user) => user.cabang.toLowerCase() === cabang.toLowerCase()
    );

    if (branchCandidates.length === 0) {
        throw new AppError("cabang tidak valid", 400);
    }

    let matchedUser = branchCandidates[0];
    if (branchCandidates.length > 1) {
        if (!user_cabang_id) {
            res.json({
                status: "success",
                data: {
                    requires_account_selection: true,
                    available_roles: branchCandidates
                }
            });
            return;
        }
        const specific = branchCandidates.find((user) => user.id === Number(user_cabang_id));
        if (!specific) throw new AppError("role tidak valid", 400);
        matchedUser = specific;
    }

    const response = await buildLoginResponse({ matchedUser });
    res.json({ status: "success", data: response });
});

const buildLoginResponse = async (input: { matchedUser: any }) => {
    const alamatCabangRow = await tokoRepository.findAlamatCabangByCabang(input.matchedUser.cabang);
    const alamat_cabang = alamatCabangRow?.alamat ?? null;
    const coverage = await userBranchCoverageRepository.findCoveredBranchesByUserCabangId(input.matchedUser.id);
    const session = await authSessionService.createForUser({
        email_sat: input.matchedUser.email_sat,
        cabang: input.matchedUser.cabang,
        nama_lengkap: input.matchedUser.nama_lengkap,
        jabatan: input.matchedUser.jabatan,
        roles: [input.matchedUser.jabatan],
        nama_pt: input.matchedUser.nama_pt
    });
    await userCabangRepository.updateLastLoginById(input.matchedUser.id);

    return { ...input.matchedUser, coverage, alamat_cabang, ...session };
};

export const ssoWebhookEmail = asyncHandler(async (req: Request, res: Response) => {
    const internalKey = req.headers["x-sparta-internal-key"];
    const expectedKey = env.SPARTA_INTERNAL_API_KEY;

    if (internalKey !== expectedKey) {
        throw new AppError("Akses ditolak", 401);
    }

    const { oldEmail, newEmail } = req.body;

    if (!oldEmail || !newEmail) {
        throw new AppError("Missing oldEmail or newEmail", 400);
    }

    await pool.query("UPDATE user_cabang SET email_sat = $1 WHERE LOWER(email_sat) = LOWER($2)", [newEmail, oldEmail]);

    res.json({ status: "success", data: { ok: true } });
});