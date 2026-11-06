import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateEffectiveInstruksiLapanganAmount,
    calculateOpnameFinalFinancials,
} from "./opname-final.financial";

test("menghitung RAB + IL + tambah - kurang - denda dengan aturan PPN", () => {
    const result = calculateOpnameFinalFinancials({
        rab: 30_025_500,
        instruksiLapangan: 0,
        kerjaTambah: 0,
        kerjaKurang: -999_000,
        denda: 0,
    });

    assert.equal(result.rab.grand_total, 33_322_200);
    assert.equal(result.kerjaKurang.grand_total, -1_098_900);
    assert.equal(result.totalFinal, 32_223_300);
});

test("area tanpa PPN tidak menambahkan sebelas persen", () => {
    const result = calculateOpnameFinalFinancials({
        rab: 30_025_500,
        instruksiLapangan: 1_000,
        kerjaTambah: 999_000,
        kerjaKurang: -500_000,
        denda: 100_000,
        noPpn: true,
    });

    assert.equal(result.totalFinal, 30_410_000);
});

test("nilai instruksi lapangan di opname mengikuti volume akhir opname", () => {
    const result = calculateEffectiveInstruksiLapanganAmount(
        {
            volume: 101.34,
            harga_material: 33_000,
            harga_upah: 9_500,
            total_harga: 4_306_950,
        },
        {
            volume_akhir: 0,
            total_harga_opname: 0,
        }
    );

    assert.equal(result.volume, 0);
    assert.equal(result.totalMaterial, 0);
    assert.equal(result.totalUpah, 0);
    assert.equal(result.totalHarga, 0);
});

test("nilai instruksi lapangan tanpa opname tetap memakai nominal IL asli", () => {
    const result = calculateEffectiveInstruksiLapanganAmount({
        volume: 18,
        harga_material: 10_900,
        harga_upah: 4_500,
        total_harga: 277_200,
    });

    assert.equal(result.volume, 18);
    assert.equal(result.totalMaterial, 196_200);
    assert.equal(result.totalUpah, 81_000);
    assert.equal(result.totalHarga, 277_200);
});
