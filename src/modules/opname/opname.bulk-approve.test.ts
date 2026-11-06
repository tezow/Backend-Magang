import test from "node:test";
import assert from "node:assert/strict";
import { bulkApproveOpnameSchema } from "./opname.schema";

test("bulkApproveOpnameSchema: validates positive integer id_toko", () => {
    const valid = bulkApproveOpnameSchema.parse({ id_toko: "123" });
    assert.equal(valid.id_toko, 123);

    assert.throws(() => {
        bulkApproveOpnameSchema.parse({ id_toko: -1 });
    });
    assert.throws(() => {
        bulkApproveOpnameSchema.parse({ id_toko: "invalid" });
    });
});

test("opnameRepository.bulkApproveByTokoId exists as a function", async () => {
    const { opnameRepository } = await import("./opname.repository");
    assert.equal(typeof opnameRepository.bulkApproveByTokoId, "function");
});

test("opnameService.bulkApprove exists as a function", async () => {
    const { opnameService } = await import("./opname.service");
    assert.equal(typeof opnameService.bulkApprove, "function");
});

test("opnameService.bulkApprove returns updated_count 0 for non-existent toko", async () => {
    const { opnameService } = await import("./opname.service");
    const result = await opnameService.bulkApprove(999999999);
    assert.equal(result.updated_count, 0);
});

test.after(async () => {
    const { pool } = await import("../../db/pool");
    await pool.end();
});
