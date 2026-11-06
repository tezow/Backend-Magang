import { AppError } from "../../common/app-error";
import { getDriveBranchParent } from "../../common/branch-scope";
import { authOtpService } from "../auth/auth-otp.service";
import { authSessionService } from "../auth/auth-session.service";
import { userBranchCoverageRepository } from "../user-branch-coverage/user-branch-coverage.repository";
import { userCabangRepository } from "../user-cabang/user-cabang.repository";
import { tokoRepository } from "./toko.repository";
import type { UserCabangRow } from "./toko.repository";
import type {
    CreateTokoInput,
    ListTokoQueryInput,
    LoginUserCabangInput,
    VerifyOtpInput,
    GetTokoDetailQueryInput,
    UpdateTokoByIdBodyInput
} from "./toko.schema";

const isHeadOfficeCabang = (cabang: string) => cabang.trim().toLowerCase() === "head office";
const OTP_CHALLENGE_JABATAN = "BUILDING & MAINTENANCE SUPER HUMAN";
const isOtpChallengeJabatan = (jabatan?: string | null) =>
    (jabatan ?? "").trim().toLowerCase() === OTP_CHALLENGE_JABATAN.toLowerCase();

const buildLoginResponse = async (input: {
    matchedUser: UserCabangRow;
}) => {
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

const resolveLoginCandidate = (input: {
    registeredUsers: UserCabangRow[];
    cabang: string;
    userCabangId?: number;
}) => {
    const branchCandidates = input.registeredUsers.filter(
        (user) => user.cabang.toLowerCase() === input.cabang.toLowerCase()
    );

    if (branchCandidates.length === 0) {
        throw new AppError("password salah", 401);
    }

    if (input.userCabangId) {
        const selected = branchCandidates.find((user) => user.id === input.userCabangId);
        if (!selected) {
            throw new AppError("akun yang dipilih tidak cocok dengan email/cabang", 400);
        }
        return selected;
    }

    if (branchCandidates.length > 1) {
        return {
            requires_account_selection: true,
            accounts: branchCandidates
        };
    }

    return branchCandidates[0];
};

export const cleanUpBranchGroups = (users: UserCabangRow[]): UserCabangRow[] => {
    const uniqueUsers: UserCabangRow[] = [];
    const seenGroup = new Set<string>();
    
    for (const u of users) {
        const parentBranch = getDriveBranchParent(u.cabang);
        const groupKey = `${parentBranch}-${u.jabatan}`;
        if (!seenGroup.has(groupKey)) {
            seenGroup.add(groupKey);
            uniqueUsers.push({
                ...u,
                cabang: parentBranch
            });
        }
    }
    return uniqueUsers;
};

export const tokoService = {
    async create(input: CreateTokoInput) {
        return tokoRepository.create(input);
    },

    async getByNomorUlok(nomorUlok: string) {
        const toko = await tokoRepository.findByNomorUlok(nomorUlok);
        if (!toko) {
            throw new AppError("Data toko tidak ditemukan", 404);
        }

        return toko;
    },

    async getDetail(query: GetTokoDetailQueryInput) {
        const toko = await tokoRepository.findDetail(query);
        if (!toko) {
            throw new AppError("Data toko tidak ditemukan", 404);
        }
        return toko;
    },

    async updateById(id: number, input: UpdateTokoByIdBodyInput) {
        const toko = await tokoRepository.updateById(id, input);
        if (!toko) {
            throw new AppError("Data toko tidak ditemukan", 404);
        }

        return toko;
    },

    async list(query: ListTokoQueryInput) {
        return tokoRepository.findAll(query);
    },

    async loginUserCabang(input: LoginUserCabangInput) {
        const emailSat = input.email_sat.trim();
        const cabang = input.cabang.trim();

        let registeredUsers = await tokoRepository.findUserCabangByEmailSatAll(emailSat);
        registeredUsers = cleanUpBranchGroups(registeredUsers);
        
        if (registeredUsers.length === 0) {
            throw new AppError("email belum terdaftar", 404);
        }

        const loginCandidate = resolveLoginCandidate({
            registeredUsers,
            cabang,
            userCabangId: input.user_cabang_id
        });
        if ("requires_account_selection" in loginCandidate) {
            return loginCandidate;
        }
        const matchedUser = loginCandidate;

        if (isHeadOfficeCabang(matchedUser.cabang) && isOtpChallengeJabatan(matchedUser.jabatan)) {
            const otp = await authOtpService.createAndSend({
                email_sat: matchedUser.email_sat,
                cabang: matchedUser.cabang,
                nama_lengkap: matchedUser.nama_lengkap
            });

            return {
                requires_otp: true,
                otp_token: otp.otp_token,
                otp_expires_at: otp.otp_expires_at,
                email_sat: matchedUser.email_sat,
                cabang: matchedUser.cabang,
                user_cabang_id: matchedUser.id
            };
        }

        return buildLoginResponse({ matchedUser });
    },

    async verifyLoginOtp(input: VerifyOtpInput) {
        const emailSat = input.email_sat.trim();
        const cabang = input.cabang.trim();

        let registeredUsers = await tokoRepository.findUserCabangByEmailSatAll(emailSat);
        registeredUsers = cleanUpBranchGroups(registeredUsers);
        
        if (registeredUsers.length === 0) {
            throw new AppError("email belum terdaftar", 404);
        }

        const loginCandidate = resolveLoginCandidate({
            registeredUsers,
            cabang,
            userCabangId: input.user_cabang_id
        });
        if ("requires_account_selection" in loginCandidate) {
            throw new AppError("pilih akun pengguna terlebih dahulu", 400);
        }
        const matchedUser = loginCandidate;

        if (!isHeadOfficeCabang(matchedUser.cabang) || !isOtpChallengeJabatan(matchedUser.jabatan)) {
            throw new AppError("OTP tidak diperlukan", 400);
        }

        await authOtpService.verify({
            email_sat: emailSat,
            cabang,
            otp_token: input.otp_token.trim(),
            otp_code: input.otp_code.trim()
        });

        return buildLoginResponse({ matchedUser });
    }
};
