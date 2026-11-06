import { pool } from "../../db/pool";
import { 
    nextBusinessDayAfter, 
    countCalendarDaysAfterFreeDate,
    toIsoDateString 
} from "../../common/national-holidays";

export type DendaKeterlambatanResult = {
    hari_denda: number;
    nilai_denda: number;
    tanggal_akhir_spk: string | null;
    tanggal_serah_terima: string | null;
};

type SpkPenaltySourceRow = {
    waktu_selesai: string | null;
    tanggal_spk_akhir_setelah_perpanjangan: string | null;
    tanggal_akhir_efektif: string | null;
};

type SerahTerimaPenaltyRow = {
    created_at: string | null;
};

type PenaltyScopeRow = {
    id: number;
    nomor_ulok: string | null;
    cabang: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DENDA_TIER_1_DAYS = 5;
export const DENDA_TIER_1_RATE = 1_000_000;
export const DENDA_TIER_2_DAYS = 5;
export const DENDA_TIER_2_RATE = 500_000;
export const DENDA_MAX_NOMINAL = 7_500_000;
export const DENDA_ACTION_THRESHOLD_DAYS = 11;

export const isHeadOfficeCabang = (value?: string | null): boolean =>
    String(value ?? "").trim().toUpperCase() === "HEAD OFFICE";

const startOfLocalDay = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const parseDateValue = (value?: string | null): Date | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        const [, day, month, year] = slashMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateMatch) {
        const [, year, month, day] = isoDateMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    // Convert to Asia/Jakarta timezone date components to prevent server timezone mismatch bugs
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "numeric",
        day: "numeric"
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find(p => p.type === "day")?.value;
    const month = parts.find(p => p.type === "month")?.value;
    const year = parts.find(p => p.type === "year")?.value;

    if (day && month && year) {
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    return startOfLocalDay(date);
};

const toIsoDate = (date: Date | null): string | null => {
    if (!date) return null;
    return toIsoDateString(date);
};

export const calculateDendaNominal = (hariDenda: number): number => {
    if (hariDenda <= 0) return 0;
    const hariPertama = Math.min(hariDenda, DENDA_TIER_1_DAYS);
    const hariBerikutnya = Math.max(0, Math.min(hariDenda - DENDA_TIER_1_DAYS, DENDA_TIER_2_DAYS));
    return Math.min((hariPertama * DENDA_TIER_1_RATE) + (hariBerikutnya * DENDA_TIER_2_RATE), DENDA_MAX_NOMINAL);
};

const resolvePenaltyScopeByTokoId = async (idToko: number): Promise<{ tokoIds: number[]; nomorUlok: string | null }> => {
    const targetResult = await pool.query<PenaltyScopeRow>(
        `
        SELECT id, nomor_ulok, cabang
        FROM toko
        WHERE id = $1
        LIMIT 1
        `,
        [idToko]
    );

    const target = targetResult.rows[0];
    if (isHeadOfficeCabang(target?.cabang)) {
        return { tokoIds: [], nomorUlok: target?.nomor_ulok ?? null };
    }

    if (!target?.nomor_ulok) {
        return { tokoIds: [idToko], nomorUlok: target?.nomor_ulok ?? null };
    }

    const peerResult = await pool.query<PenaltyScopeRow>(
        `
        SELECT id, nomor_ulok, cabang
        FROM toko
        WHERE nomor_ulok = $1
          AND UPPER(TRIM(COALESCE(cabang, ''))) <> 'HEAD OFFICE'
          AND (
              $2::text IS NULL
              OR cabang IS NULL
              OR UPPER(cabang) = UPPER($2::text)
          )
        ORDER BY id ASC
        `,
        [target.nomor_ulok, target.cabang]
    );

    const tokoIds = peerResult.rows.map((row) => row.id);
    return { tokoIds: tokoIds.length > 0 ? tokoIds : [idToko], nomorUlok: target.nomor_ulok };
};

/**
 * BUSINESS LOGIC: Hitung denda dari tanggal akhir SPK dan tanggal serah terima
 * 
 * Logika baru (dengan libur nasional 2026):
 * 1. Hari kerja pertama setelah akhir SPK = grace period (bebas denda)
 * 2. Grace period skip weekend DAN libur nasional yang jatuh di hari kerja
 * 3. Denda dihitung per hari KALENDER setelah grace period
 * 
 * Contoh:
 * - SPK berakhir Jumat 29 Mei 2026
 * - Skip Sabtu 30 Mei, Minggu 31 Mei
 * - Senin 1 Jun 2026 adalah LIBUR NASIONAL (Hari Lahir Pancasila) → skip juga
 * - Grace period = Selasa 2 Jun 2026
 * - ST di Rabu 3 Jun = 1 hari denda
 * - ST di Kamis 4 Jun = 2 hari denda
 */
export const calculateDendaFromDates = (
    tanggalAkhirSpk: Date | null,
    tanggalSerahTerima: Date | null
): DendaKeterlambatanResult => {
    if (!tanggalAkhirSpk || !tanggalSerahTerima) {
        return {
            hari_denda: 0,
            nilai_denda: 0,
            tanggal_akhir_spk: toIsoDate(tanggalAkhirSpk),
            tanggal_serah_terima: toIsoDate(tanggalSerahTerima)
        };
    }

    // Hari kerja pertama setelah akhir SPK = 1 hari bebas (grace period)
    // Sekarang dengan logic libur nasional: skip weekend + libur nasional hari kerja
    const freeDate = nextBusinessDayAfter(tanggalAkhirSpk);
    
    // Denda dihitung per hari KALENDER (termasuk Sabtu & Minggu & libur nasional) setelah freeDate
    const hariDenda = countCalendarDaysAfterFreeDate(freeDate, tanggalSerahTerima);

    console.log(`[DENDA] SPK End: ${toIsoDate(tanggalAkhirSpk)}, Free Date: ${toIsoDate(freeDate)}, ST: ${toIsoDate(tanggalSerahTerima)}, Denda: ${hariDenda} hari`);

    return {
        hari_denda: hariDenda,
        nilai_denda: calculateDendaNominal(hariDenda),
        tanggal_akhir_spk: toIsoDate(tanggalAkhirSpk),
        tanggal_serah_terima: toIsoDate(tanggalSerahTerima)
    };
};

export const calculateSingleTokoDenda = async (idToko: number): Promise<DendaKeterlambatanResult> => {
    const spkResult = await pool.query<SpkPenaltySourceRow>(
        `
        SELECT
            ps.waktu_selesai,
            (
                SELECT MAX(pt.tanggal_spk_akhir_setelah_perpanjangan)
                FROM pertambahan_spk pt
                JOIN pengajuan_spk ps_source ON ps_source.id = pt.id_spk
                JOIN toko t_source ON t_source.id = ps_source.id_toko
                JOIN toko t_target ON t_target.nomor_ulok = t_source.nomor_ulok
                WHERE t_target.id = ps.id_toko
                  AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
            ) AS tanggal_spk_akhir_setelah_perpanjangan,
            GREATEST(
                ps.waktu_selesai::date,
                COALESCE(
                    (
                        SELECT MAX(parsed_end)
                        FROM (
                            SELECT
                                CASE
                                    WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan,'')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                                        THEN to_date(LEFT(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan),10),'YYYY-MM-DD')
                                    WHEN TRIM(COALESCE(pt.tanggal_spk_akhir_setelah_perpanjangan,'')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                                        THEN to_date(TRIM(pt.tanggal_spk_akhir_setelah_perpanjangan),'DD/MM/YYYY')
                                    ELSE NULL
                                END AS parsed_end
                            FROM pertambahan_spk pt
                            JOIN pengajuan_spk ps_source ON ps_source.id = pt.id_spk
                            JOIN toko t_source ON t_source.id = ps_source.id_toko
                            JOIN toko t_target ON t_target.nomor_ulok = t_source.nomor_ulok
                            WHERE t_target.id = ps.id_toko
                              AND UPPER(TRIM(COALESCE(pt.status_persetujuan, ''))) IN ('APPROVED', 'DISETUJUI', 'DISETUJUI BM')
                        ) safe_ext
                        WHERE parsed_end IS NOT NULL
                          AND parsed_end > ps.waktu_selesai::date
                    ),
                    ps.waktu_selesai::date
                )
            )::text AS tanggal_akhir_efektif
        FROM pengajuan_spk ps
        WHERE ps.id_toko = $1
          AND UPPER(TRIM(COALESCE(ps.status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
        `,
        [idToko]
    );

    const latestAkhirSpk = spkResult.rows
        .map((row) => parseDateValue(row.tanggal_akhir_efektif) ?? parseDateValue(row.tanggal_spk_akhir_setelah_perpanjangan) ?? parseDateValue(row.waktu_selesai))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const stResult = await pool.query<SerahTerimaPenaltyRow>(
        `
        SELECT created_at
        FROM berkas_serah_terima
        WHERE id_toko = $1
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        `,
        [idToko]
    );

    const tanggalSerahTerima = parseDateValue(stResult.rows[0]?.created_at ?? null);

    return calculateDendaFromDates(latestAkhirSpk, tanggalSerahTerima);
};

export const calculateDendaByTokoId = async (idToko: number): Promise<DendaKeterlambatanResult> => {
    const scope = await resolvePenaltyScopeByTokoId(idToko);
    console.log(`[DENDA] Toko ${idToko} → scope tokoIds=${JSON.stringify(scope.tokoIds)}, nomorUlok=${scope.nomorUlok}`);

    if (scope.tokoIds.length === 0) {
        return {
            hari_denda: 0,
            nilai_denda: 0,
            tanggal_akhir_spk: null,
            tanggal_serah_terima: null
        };
    }

    const individualDendas: DendaKeterlambatanResult[] = [];

    for (const peerId of scope.tokoIds) {
        // Check if peer has approved SPK
        const hasSpkResult = await pool.query(
            `
            SELECT 1
            FROM pengajuan_spk
            WHERE id_toko = $1
              AND UPPER(TRIM(COALESCE(status, ''))) IN ('SPK_APPROVED', 'APPROVED', 'DISETUJUI', 'AKTIF', 'ACTIVE', 'SELESAI')
            LIMIT 1
            `,
            [peerId]
        );

        if (hasSpkResult.rows.length === 0) {
            console.log(`[DENDA] Peer Toko ${peerId} has no approved SPK, skipping from minimum calculation`);
            continue;
        }

        const denda = await calculateSingleTokoDenda(peerId);
        console.log(`[DENDA] Peer Toko ${peerId} → calculated denda = ${denda.nilai_denda} (${denda.hari_denda} days)`);
        if (!denda.tanggal_serah_terima) {
            console.log(`[DENDA] Peer Toko ${peerId} has no ST date, skipping from minimum calculation`);
            continue;
        }
        individualDendas.push(denda);
    }

    if (individualDendas.length === 0) {
        console.log(`[DENDA] No peers have approved SPK, falling back to target toko ${idToko}`);
        return calculateSingleTokoDenda(idToko);
    }

    // Pick the lightest penalty. When nominal is tied at the cap, keep the smaller day count/date.
    individualDendas.sort((a, b) =>
        (a.nilai_denda - b.nilai_denda)
        || (a.hari_denda - b.hari_denda)
        || String(a.tanggal_serah_terima ?? "").localeCompare(String(b.tanggal_serah_terima ?? ""))
    );
    const minDenda = individualDendas[0];

    console.log(`[DENDA] Toko ${idToko} → final minimum denda among peers = ${minDenda.nilai_denda} (${minDenda.hari_denda} days)`);
    return minDenda;
};
