export type FinancialDirection = "down" | "up";

export type FinancialSummary = {
    total: number;
    pembulatan: number;
    ppn: number;
    grand_total: number;
};

export type OpnameFinalFinancialInput = {
    rab: number;
    instruksiLapangan: number;
    kerjaTambah: number;
    kerjaKurang: number;
    denda: number;
    noPpn?: boolean;
};

const finiteNumber = (value: number): number => Number.isFinite(value) ? value : 0;

const numericValue = (value: string | number | null | undefined): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export type EffectiveInstruksiLapanganSource = {
    volume?: string | number | null;
    harga_material?: string | number | null;
    harga_upah?: string | number | null;
    total_harga?: string | number | null;
};

export type EffectiveInstruksiLapanganOpname = {
    volume_akhir?: string | number | null;
    total_harga_opname?: string | number | null;
};

export const calculateEffectiveInstruksiLapanganAmount = (
    source: EffectiveInstruksiLapanganSource,
    opname?: EffectiveInstruksiLapanganOpname
) => {
    const volume = opname ? numericValue(opname.volume_akhir) : numericValue(source.volume);
    const hargaMaterial = numericValue(source.harga_material);
    const hargaUpah = numericValue(source.harga_upah);
    const totalMaterial = Math.round(volume * hargaMaterial);
    const totalUpah = Math.round(volume * hargaUpah);
    const totalHarga = opname
        ? numericValue(opname.total_harga_opname)
        : numericValue(source.total_harga);

    return {
        volume,
        totalMaterial,
        totalUpah,
        totalHarga,
    };
};

export const buildFinancialSummary = (
    rawTotal: number,
    direction: FinancialDirection,
    noPpn = false
): FinancialSummary => {
    const total = finiteNumber(rawTotal);
    const sign = total < 0 ? -1 : 1;
    const absolute = Math.abs(total);
    const roundedAbsolute = direction === "down"
        ? Math.floor(absolute / 10_000) * 10_000
        : (absolute === 0 ? 0 : Math.ceil(absolute / 10_000) * 10_000);
    const pembulatan = sign * roundedAbsolute;
    const ppn = noPpn ? 0 : Math.round(pembulatan * 0.11);

    return {
        total,
        pembulatan,
        ppn,
        grand_total: pembulatan + ppn,
    };
};

export const calculateOpnameFinalFinancials = (input: OpnameFinalFinancialInput) => {
    const rab = buildFinancialSummary(input.rab, "down", input.noPpn);
    const instruksiLapangan = buildFinancialSummary(input.instruksiLapangan, "down", input.noPpn);
    const kerjaTambah = buildFinancialSummary(input.kerjaTambah, "down", input.noPpn);
    const kerjaKurang = buildFinancialSummary(input.kerjaKurang, "down", input.noPpn);
    const denda = finiteNumber(input.denda);

    return {
        rab,
        instruksiLapangan,
        kerjaTambah,
        kerjaKurang,
        denda,
        selisihKerjaTambahKurang: kerjaTambah.grand_total - Math.abs(kerjaKurang.grand_total),
        totalFinal: rab.grand_total
            + instruksiLapangan.grand_total
            + kerjaTambah.grand_total
            - Math.abs(kerjaKurang.grand_total)
            - denda,
    };
};

export const isNoPpnArea = (toko: {
    cabang?: string | null;
    nama_toko?: string | null;
    alamat?: string | null;
}): boolean => {
    const identity = [toko.cabang, toko.nama_toko, toko.alamat]
        .map((value) => String(value ?? "").trim().toUpperCase());

    return identity.some(
        (value) => value === "BATAM"
            || value === "BINTAN"
            || /\bBATAM\b|\bBINTAN\b/.test(value)
    );
};
