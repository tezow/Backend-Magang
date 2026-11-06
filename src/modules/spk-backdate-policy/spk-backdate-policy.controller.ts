import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { spkBackdatePolicyService } from "./spk-backdate-policy.service";
import { updateSpkBackdatePolicySchema } from "./spk-backdate-policy.schema";

export const listSpkBackdatePolicy = asyncHandler(async (req: Request, res: Response) => {
    const result = await spkBackdatePolicyService.list(req.user);
    const enabledBranches = spkBackdatePolicyService.normalizeBranches(
        result.rows.filter((row) => row.is_enabled).map((row) => row.branch_name)
    );

    res.json({
        status: "success",
        data: {
            branches: result.rows,
            enabled_branches: enabledBranches,
            can_manage: result.can_manage,
        },
    });
});

export const updateSpkBackdatePolicy = asyncHandler(async (req: Request, res: Response) => {
    const payload = updateSpkBackdatePolicySchema.parse(req.body);
    const rows = await spkBackdatePolicyService.replaceEnabledBranches({
        branches: payload.branches,
        actor: req.user,
    });

    res.json({
        status: "success",
        message: "Policy backdate SPK berhasil diperbarui.",
        data: {
            branches: rows,
            enabled_branches: spkBackdatePolicyService.normalizeBranches(
                rows.filter((row) => row.is_enabled).map((row) => row.branch_name)
            ),
            can_manage: true,
        },
    });
});
