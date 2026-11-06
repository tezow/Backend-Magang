import { AppError } from "../../common/app-error";
import type { AuthenticatedUser } from "../auth/auth-session.service";
import {
    spkBackdatePolicyRepository,
    type SpkBackdatePolicyRow,
} from "./spk-backdate-policy.repository";

const hasSuperHumanRole = (user?: AuthenticatedUser | null): boolean =>
    Boolean(user?.roles.some((role) => role.trim().toUpperCase().includes("SUPER HUMAN")));

export const spkBackdatePolicyService = {
    ensureSchema: () => spkBackdatePolicyRepository.ensureSchema(),
    normalizeBranches: (branches: string[]) => spkBackdatePolicyRepository.normalizeBranches(branches),

    async list(actor?: AuthenticatedUser | null): Promise<{ rows: SpkBackdatePolicyRow[]; can_manage: boolean }> {
        const rows = await spkBackdatePolicyRepository.list();
        return {
            rows,
            can_manage: hasSuperHumanRole(actor),
        };
    },

    async listEnabledBranches(): Promise<string[]> {
        return spkBackdatePolicyRepository.listEnabledBranches();
    },

    async canBackdateBranch(branchName?: string | null): Promise<boolean> {
        return spkBackdatePolicyRepository.isBranchEnabled(branchName);
    },

    async replaceEnabledBranches(input: { branches: string[]; actor?: AuthenticatedUser | null }): Promise<SpkBackdatePolicyRow[]> {
        if (!hasSuperHumanRole(input.actor)) {
            throw new AppError("Hanya Super Human yang dapat mengubah policy backdate SPK.", 403);
        }

        return spkBackdatePolicyRepository.replaceEnabledBranches({
            branches: input.branches,
            actor_email: input.actor?.email_sat ?? null,
            actor_role: input.actor?.jabatan ?? input.actor?.roles.join(", ") ?? null,
        });
    },
};
