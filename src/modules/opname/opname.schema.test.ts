import assert from "node:assert/strict";
import test from "node:test";
import { bulkCreateOpnameSchema } from "./opname.schema";

const basePayload = {
    id_toko: 1,
    email_pembuat: "tester@example.com",
    tipe_opname: "OPNAME",
    grand_total_opname: "1000",
    grand_total_rab: "1000",
};

test("menerima Tidak Sesuai dan Tidak Baik pada submit opname", () => {
    const parsed = bulkCreateOpnameSchema.parse({
        ...basePayload,
        items: [{
            id_rab_item: 1,
            volume_akhir: 1,
            selisih_volume: 0,
            total_selisih: 0,
            desain: "Tidak Sesuai",
            kualitas: "Tidak Baik",
            spesifikasi: "Tidak Sesuai",
        }],
    });

    assert.equal(parsed.items[0].desain, "Tidak Sesuai");
    assert.equal(parsed.items[0].kualitas, "Tidak Baik");
    assert.equal(parsed.items[0].spesifikasi, "Tidak Sesuai");
});

test("menormalkan kapital dan spasi nilai verifikasi", () => {
    const parsed = bulkCreateOpnameSchema.parse({
        ...basePayload,
        items: [{
            id_rab_item: 1,
            volume_akhir: 1,
            selisih_volume: 0,
            total_selisih: 0,
            desain: " tidak   sesuai ",
            kualitas: "tidak baik",
            spesifikasi: "sesuai",
        }],
    });

    assert.deepEqual(
        [parsed.items[0].desain, parsed.items[0].kualitas, parsed.items[0].spesifikasi],
        ["Tidak Sesuai", "Tidak Baik", "Sesuai"]
    );
});
