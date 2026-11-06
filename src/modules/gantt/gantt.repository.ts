import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool";
import type { GanttStatus } from "./gantt.constants";
import type {
    DayGanttItemInput,
    DependencyItemInput,
    PengawasanItemInput
} from "./gantt.schema";
import { instruksiLapanganRepository, type InstruksiLapanganItemRow } from "../instruksi-lapangan/instruksi-lapangan.repository";
import { calculateEffectiveStDate, toIsoDateString } from "../../common/national-holidays";

// ---------------------------------------------------------------------------
// Row types – sesuai tabel gantt_chart, kategori_pekerjaan_gantt, dll
// ---------------------------------------------------------------------------

export type GanttRow = {
    id: number;
    id_toko: number;
    status: string | null;
    email_pembuat: string | null;
    timestamp: string | null;
};

export type GanttNoteRow = {
    id: number;
    id_gantt: number;
    author_email: string;
    author_name: string;
    author_role: string;
    note: string;
    created_at: string;
};

export type KategoriPekerjaanGanttRow = {
    id: number;
    id_gantt: number;
    kategori_pekerjaan: string;
};

export type DayGanttRow = {
    id: number;
    id_gantt: number;
    id_kategori_pekerjaan_gantt: number;
    h_awal: string | null;
    h_akhir: string | null;
    keterlambatan: string | null;
    kecepatan: string | null;
};

export type PengawasanGanttRow = {
    id: number;
    id_gantt: number;
    id_pic_pengawasan: number | null;
    tanggal_pengawasan: string;
};

export type DependencyGanttRow = {
    id: number;
    id_gantt: number;
    id_kategori: number;
    id_kategori_terikat: number;
};

export type TokoJoinRow = {
    id: number;
    nomor_ulok: string;
    lingkup_pekerjaan: string | null;
    nama_toko: string | null;
    kode_toko: string | null;
    proyek: string | null;
    cabang: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
    takeover_sequence: number;
};

export type TokoStableFields = {
    kode_toko: string | null;
    alamat: string | null;
    nama_kontraktor: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GANTT_COLUMNS = `
    g.id, g.id_toko, g.status, g.email_pembuat, g.timestamp
`;

const normalizeKategoriKey = (value: string) =>
    value
        .trim()
        .replace(/\s*\/\s*/g, "/")
        .replace(/\s+/g, " ")
        .toUpperCase();

const getKategoriId = (kategoriMap: Map<string, number>, kategori: string) =>
    kategoriMap.get(normalizeKategoriKey(kategori));

const shouldLogDebug = process.env.NODE_ENV !== "production";

/**
 * Insert kategori pekerjaan dan return map nama -> id
 */
const insertKategoriPekerjaan = async (
    client: PoolClient,
    ganttId: number,
    kategoriList: string[]
): Promise<Map<string, number>> => {
    const kategoriMap = new Map<string, number>();
    for (const kategori of kategoriList) {
        const kategoriKey = normalizeKategoriKey(kategori);
        if (!kategoriKey || kategoriMap.has(kategoriKey)) continue;

        const res = await client.query<{ id: number }>(
            `INSERT INTO kategori_pekerjaan_gantt (id_gantt, kategori_pekerjaan)
             VALUES ($1, $2)
             RETURNING id`,
            [ganttId, kategori]
        );
        kategoriMap.set(kategoriKey, res.rows[0].id);
    }
    return kategoriMap;
};

/**
 * Insert day gantt chart items
 */
const insertDayItems = async (
    client: PoolClient,
    ganttId: number,
    dayItems: DayGanttItemInput[],
    kategoriMap: Map<string, number>
): Promise<void> => {
    for (const item of dayItems) {
        const kategoriId = getKategoriId(kategoriMap, item.kategori_pekerjaan);
        if (!kategoriId) continue;

        await client.query(
            `INSERT INTO day_gantt_chart (
                id_gantt, id_kategori_pekerjaan_gantt,
                h_awal, h_akhir, keterlambatan, kecepatan
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                ganttId,
                kategoriId,
                item.h_awal,
                item.h_akhir,
                item.keterlambatan ?? null,
                item.kecepatan ?? null
            ]
        );
    }
};

/**
 * Insert pengawasan gantt items
 */
const insertPengawasan = async (
    client: PoolClient,
    ganttId: number,
    pengawasanItems: PengawasanItemInput[]
): Promise<void> => {
    const uniqueDates = Array.from(new Set(
        pengawasanItems
            .map((item) => item.tanggal_pengawasan.trim())
            .filter(Boolean)
    ));

    for (const tanggalPengawasan of uniqueDates) {
        await client.query(
            `
            INSERT INTO pengawasan_gantt (id_gantt, tanggal_pengawasan)
            SELECT $1, $2
            WHERE NOT EXISTS (
                SELECT 1
                FROM pengawasan_gantt
                WHERE id_gantt = $1
                  AND tanggal_pengawasan = $2
            )
            `,
            [ganttId, tanggalPengawasan]
        );
    }
};

/**
 * Insert dependency gantt items
 */
const insertDependencies = async (
    client: PoolClient,
    ganttId: number,
    dependencies: DependencyItemInput[],
    kategoriMap: Map<string, number>
): Promise<void> => {
    for (const dep of dependencies) {
        const idKategori = getKategoriId(kategoriMap, dep.kategori_pekerjaan);
        const idKategoriTerikat = getKategoriId(kategoriMap, dep.kategori_pekerjaan_terikat);
        if (!idKategori || !idKategoriTerikat) continue;

        await client.query(
            `INSERT INTO dependency_gantt (id_gantt, id_kategori, id_kategori_terikat)
             VALUES ($1, $2, $3)`,
            [ganttId, idKategori, idKategoriTerikat]
        );
    }
};

const parseDateOnly = (value?: string | null): Date | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = raw.includes("/")
        ? (() => {
            const [dd, mm, yyyy] = raw.split("/");
            return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        })()
        : new Date(raw.split("T")[0] + "T00:00:00");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildStTargetInfo = (effectiveEnd?: string | null) => {
    const endDate = parseDateOnly(effectiveEnd);
    if (!endDate) {
        return {
            st_target_date: null,
            st_offset_days: 0,
            st_offset_label: null,
            st_offset_explanation: null,
            st_skipped_weekends: 0,
            st_skipped_holidays: 0
        };
    }

    const target = calculateEffectiveStDate(endDate);
    return {
        st_target_date: toIsoDateString(target.effectiveStDate),
        st_offset_days: target.offsetDays,
        st_offset_label: target.label,
        st_offset_explanation: target.explanation,
        st_skipped_weekends: target.skippedWeekends,
        st_skipped_holidays: target.skippedHolidays
    };
};

const effectiveSpkExpression = `
    GREATEST(
        p.waktu_selesai::date,
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
                    JOIN pengajuan_spk ps_scope ON ps_scope.id = pt.id_spk
                    WHERE ps_scope.nomor_ulok = p.nomor_ulok
                      AND UPPER(TRIM(COALESCE(pt.status_persetujuan,''))) IN ('APPROVED','DISETUJUI','DISETUJUI BM')
                ) safe_ext
                WHERE parsed_end IS NOT NULL
                  AND parsed_end > p.waktu_selesai::date
            ),
            p.waktu_selesai::date
        )
    )
`;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const ganttRepository = {
    async findSupervisionWorkspace(nomorUlok: string, takeoverSequence?: number) {
        const values: unknown[] = [nomorUlok];
        let tsFilter = "AND COALESCE(t.takeover_sequence, 0) = (SELECT COALESCE(MAX(takeover_sequence), 0) FROM toko WHERE nomor_ulok = $1)";
        if (takeoverSequence !== undefined) {
            values.push(takeoverSequence);
            tsFilter = "AND COALESCE(t.takeover_sequence, 0) = $2";
        }

        const result = await pool.query(
            `
            WITH scope AS (
                SELECT
                    t.id AS id_toko,
                    t.nomor_ulok,
                    t.lingkup_pekerjaan,
                    t.nama_toko,
                    t.kode_toko,
                    t.cabang,
                    latest_gantt.id AS gantt_id,
                    latest_gantt.status AS gantt_status,
                    latest_pic.id AS pic_id,
                    latest_pic.plc_building_support,
                    latest_opname.id AS opname_final_id,
                    latest_opname.status_opname_final,
                    latest_opname.aksi AS opname_aksi,
                    latest_opname.item_count AS opname_item_count,
                    bst.id AS berkas_serah_terima_id,
                    bst.link_pdf AS link_pdf_serah_terima,
                    spk.waktu_mulai AS spk_start_date,
                    spk.durasi AS spk_duration,
                    spk.durasi_efektif AS spk_effective_duration,
                    spk.tanggal_akhir_efektif AS spk_effective_end_date
                FROM toko t
                LEFT JOIN LATERAL (
                    SELECT g.id, g.status
                    FROM gantt_chart g
                    WHERE g.id_toko = t.id
                    ORDER BY g.id DESC
                    LIMIT 1
                ) latest_gantt ON true
                LEFT JOIN LATERAL (
                    SELECT pic.id, pic.plc_building_support
                    FROM pic_pengawasan pic
                    WHERE pic.id_toko = t.id
                       OR UPPER(TRIM(COALESCE(pic.nomor_ulok, ''))) = UPPER(TRIM(COALESCE(t.nomor_ulok, '')))
                    ORDER BY
                        CASE WHEN pic.id_toko = t.id THEN 0 ELSE 1 END,
                        pic.id DESC
                    LIMIT 1
                ) latest_pic ON true
                LEFT JOIN LATERAL (
                    SELECT
                        ofn.id,
                        ofn.status_opname_final,
                        ofn.aksi,
                        (
                            SELECT COUNT(*)::int
                            FROM opname_item oi_count
                            WHERE oi_count.id_opname_final = ofn.id
                        ) AS item_count
                    FROM opname_final ofn
                    WHERE ofn.id_toko = t.id
                    ORDER BY ofn.id DESC
                    LIMIT 1
                ) latest_opname ON true
                LEFT JOIN LATERAL (
                    SELECT b.id, b.link_pdf
                    FROM berkas_serah_terima b
                    WHERE b.id_toko = t.id
                    ORDER BY b.id DESC
                    LIMIT 1
                ) bst ON true
                LEFT JOIN LATERAL (
                    SELECT
                        p.waktu_mulai,
                        p.durasi,
                        (${effectiveSpkExpression} - p.waktu_mulai::date + 1)::int AS durasi_efektif,
                        (${effectiveSpkExpression})::text AS tanggal_akhir_efektif
                    FROM pengajuan_spk p
                    WHERE p.id_toko = t.id
                    ORDER BY p.id DESC
                    LIMIT 1
                ) spk ON true
                WHERE t.nomor_ulok = $1 ${tsFilter}
            ),
            target_pengawasan_gantt AS (
                SELECT
                    s.id_toko,
                    pg.id AS id_pengawasan_gantt,
                    pg.tanggal_pengawasan
                FROM scope s
                JOIN pengawasan_gantt pg ON pg.id_gantt = s.gantt_id
            ),
            pengawasan_per_date AS (
                SELECT DISTINCT ON (
                    p.id_gantt,
                    p.id_pengawasan_gantt,
                    UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                )
                    p.*,
                    tpg.tanggal_pengawasan AS tpg_tanggal_pengawasan
                FROM pengawasan p
                JOIN target_pengawasan_gantt tpg ON tpg.id_pengawasan_gantt = p.id_pengawasan_gantt
                ORDER BY
                    p.id_gantt,
                    p.id_pengawasan_gantt,
                    UPPER(TRIM(COALESCE(p.kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(p.jenis_pekerjaan, ''))),
                    p.id DESC
            ),
            latest_overall_status AS (
                SELECT DISTINCT ON (
                    id_gantt,
                    UPPER(TRIM(COALESCE(kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(jenis_pekerjaan, '')))
                )
                    id_gantt,
                    status
                FROM pengawasan_per_date
                ORDER BY
                    id_gantt,
                    UPPER(TRIM(COALESCE(kategori_pekerjaan, ''))),
                    UPPER(TRIM(COALESCE(jenis_pekerjaan, ''))),
                    to_date(tpg_tanggal_pengawasan, 'DD/MM/YYYY') DESC,
                    id DESC
            ),
            checkpoint AS (
                SELECT
                    tpg.id_toko,
                    tpg.id_pengawasan_gantt,
                    tpg.tanggal_pengawasan,
                    COUNT(p.id)::int AS total_items,
                    COUNT(p.id) FILTER (WHERE LOWER(TRIM(p.status)) IN ('selesai', 'tidak_dikerjakan'))::int AS selesai_items,
                    COUNT(p.id) FILTER (
                        WHERE LOWER(TRIM(p.status)) IN ('selesai', 'progress', 'terlambat', 'tidak_dikerjakan')
                    )::int AS filled_items,
                    COUNT(p.id) FILTER (
                        WHERE NULLIF(TRIM(COALESCE(p.dokumentasi, '')), '') IS NOT NULL
                    )::int AS documented_items,
                    COUNT(p.id) FILTER (
                        WHERE LOWER(TRIM(p.status)) = 'selesai'
                          AND EXISTS (
                            SELECT 1
                            FROM rab r
                            JOIN rab_item ri ON ri.id_rab = r.id
                            WHERE r.id_toko = tpg.id_toko
                              AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ''))) = UPPER(TRIM(REPLACE(COALESCE(p.kategori_pekerjaan, ''), '[IL] ', '')))
                              AND UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                            UNION ALL
                            SELECT 1
                            FROM instruksi_lapangan il
                            JOIN instruksi_lapangan_item ili ON ili.id_instruksi_lapangan = il.id
                            WHERE il.id_toko = tpg.id_toko
                              AND UPPER(TRIM(COALESCE(ili.kategori_pekerjaan, ''))) = UPPER(TRIM(REPLACE(COALESCE(p.kategori_pekerjaan, ''), '[IL] ', '')))
                              AND UPPER(TRIM(COALESCE(ili.jenis_pekerjaan, ''))) = UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                          )
                          AND NOT EXISTS (
                            SELECT 1
                            FROM opname_item oi
                            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                            WHERE oi.id_toko = tpg.id_toko
                              AND UPPER(TRIM(COALESCE(
                                    ri.kategori_pekerjaan,
                                    ili.kategori_pekerjaan,
                                    ''
                              ))) = UPPER(TRIM(REPLACE(COALESCE(p.kategori_pekerjaan, ''), '[IL] ', '')))
                              AND UPPER(TRIM(COALESCE(
                                    ri.jenis_pekerjaan,
                                    ili.jenis_pekerjaan,
                                    ''
                              ))) = UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                          )
                    )::int AS ready_opname_items,
                    COUNT(p.id) FILTER (
                        WHERE LOWER(TRIM(p.status)) = 'selesai'
                          AND EXISTS (
                            SELECT 1
                            FROM opname_item oi
                            LEFT JOIN rab_item ri ON ri.id = oi.id_rab_item
                            LEFT JOIN instruksi_lapangan_item ili ON ili.id = oi.id_instruksi_lapangan_item
                            WHERE oi.id_toko = tpg.id_toko
                              AND UPPER(TRIM(COALESCE(
                                    ri.kategori_pekerjaan,
                                    ili.kategori_pekerjaan,
                                    ''
                              ))) = UPPER(TRIM(REPLACE(COALESCE(p.kategori_pekerjaan, ''), '[IL] ', '')))
                              AND UPPER(TRIM(COALESCE(
                                    ri.jenis_pekerjaan,
                                    ili.jenis_pekerjaan,
                                    ''
                              ))) = UPPER(TRIM(COALESCE(p.jenis_pekerjaan, '')))
                          )
                    )::int AS opname_items
                FROM target_pengawasan_gantt tpg
                LEFT JOIN pengawasan_per_date p
                    ON p.id_pengawasan_gantt = tpg.id_pengawasan_gantt
                GROUP BY tpg.id_toko, tpg.id_pengawasan_gantt, tpg.tanggal_pengawasan
            )
            SELECT
                s.*,
                COALESCE(SUM(c.total_items), 0)::int AS total_pengawasan_checkpoints,
                COALESCE(SUM(c.selesai_items), 0)::int AS filled_pengawasan_checkpoints,
                (
                    SELECT COUNT(*)::int
                    FROM latest_overall_status los
                    WHERE los.id_gantt = s.gantt_id
                      AND LOWER(TRIM(COALESCE(los.status, ''))) NOT IN ('selesai', 'tidak dikerjakan')
                ) AS missing_pengawasan_checkpoints,
                (
                    SELECT COUNT(*)::int
                    FROM latest_overall_status los
                    WHERE los.id_gantt = s.gantt_id
                      AND LOWER(TRIM(COALESCE(los.status, ''))) = 'selesai'
                ) AS total_selesai_items,
                (
                    SELECT COUNT(*)::int
                    FROM (
                        SELECT DISTINCT
                            UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ''))) AS kat,
                            UPPER(TRIM(COALESCE(ri.jenis_pekerjaan, ''))) AS jen
                        FROM rab_item ri
                        JOIN rab r ON r.id = ri.id_rab
                        WHERE r.id_toko = s.id_toko
                          AND UPPER(TRIM(COALESCE(ri.kategori_pekerjaan, ''))) IN (
                              SELECT UPPER(TRIM(kpg.kategori_pekerjaan))
                              FROM kategori_pekerjaan_gantt kpg
                              WHERE kpg.id_gantt = s.gantt_id
                          )
                        UNION
                        SELECT DISTINCT
                            UPPER(TRIM(COALESCE(ili.kategori_pekerjaan, ''))) AS kat,
                            UPPER(TRIM(COALESCE(ili.jenis_pekerjaan, ''))) AS jen
                        FROM instruksi_lapangan_item ili
                        JOIN instruksi_lapangan il ON il.id = ili.id_instruksi_lapangan
                        WHERE il.id_toko = s.id_toko
                          AND UPPER(TRIM(COALESCE(ili.kategori_pekerjaan, ''))) IN (
                              SELECT UPPER(TRIM(kpg.kategori_pekerjaan))
                              FROM kategori_pekerjaan_gantt kpg
                              WHERE kpg.id_gantt = s.gantt_id
                          )
                    ) AS expected_items
                ) AS total_expected_items,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_pengawasan_gantt', c.id_pengawasan_gantt,
                            'tanggal_pengawasan', c.tanggal_pengawasan,
                            'total_items', c.total_items,
                            'selesai_items', c.selesai_items,
                            'filled_items', c.filled_items,
                            'documented_items', c.documented_items,
                            'missing_documentation_items', GREATEST(c.total_items - c.documented_items, 0),
                            'ready_opname_items', c.ready_opname_items,
                            'opname_items', c.opname_items
                        )
                        ORDER BY to_date(c.tanggal_pengawasan, 'DD/MM/YYYY')
                    ) FILTER (WHERE c.id_pengawasan_gantt IS NOT NULL),
                    '[]'::json
                ) AS checkpoints
            FROM scope s
            LEFT JOIN checkpoint c ON c.id_toko = s.id_toko
            GROUP BY
                s.id_toko, s.nomor_ulok, s.lingkup_pekerjaan, s.nama_toko,
                s.kode_toko, s.cabang, s.gantt_id, s.gantt_status, s.pic_id,
                s.plc_building_support, s.opname_final_id, s.status_opname_final,
                s.opname_aksi, s.opname_item_count, s.berkas_serah_terima_id, s.link_pdf_serah_terima,
                s.spk_start_date, s.spk_duration, s.spk_effective_duration, s.spk_effective_end_date
            ORDER BY
                CASE
                    WHEN UPPER(s.lingkup_pekerjaan) = 'SIPIL' THEN 0
                    WHEN UPPER(s.lingkup_pekerjaan) = 'ME' THEN 1
                    ELSE 2
                END,
                s.id_toko
            `,
            values
        );

        return result.rows.map((row: any) => {
            const stInfo = buildStTargetInfo(row.spk_effective_end_date);
            const normalStTarget = parseDateOnly(stInfo.st_target_date);
            const latestCheckpoint = Array.isArray(row.checkpoints)
                ? row.checkpoints
                    .map((checkpoint: any) => parseDateOnly(checkpoint?.tanggal_pengawasan))
                    .filter((date: Date | null): date is Date => Boolean(date))
                    .sort((left: Date, right: Date) => right.getTime() - left.getTime())[0] ?? null
                : null;

            if (latestCheckpoint && normalStTarget && latestCheckpoint > normalStTarget) {
                const spkEnd = parseDateOnly(row.spk_effective_end_date);
                const offsetDays = spkEnd
                    ? Math.max(1, Math.round((latestCheckpoint.getTime() - spkEnd.getTime()) / (24 * 60 * 60 * 1000)))
                    : stInfo.st_offset_days;

                return {
                    ...row,
                    ...stInfo,
                    st_target_date: toIsoDateString(latestCheckpoint),
                    st_offset_days: offsetDays,
                    st_offset_label: `Denda ${offsetDays} hari`,
                    st_offset_explanation: `ST baru ${toIsoDateString(latestCheckpoint)} karena keterlambatan`
                };
            }

            return {
                ...row,
                ...stInfo
            };
        });
    },
    async findLatestActiveByTokoId(tokoId: number): Promise<GanttRow | null> {
        const result = await pool.query<GanttRow>(
            `SELECT id, id_toko, status, email_pembuat, timestamp
             FROM gantt_chart
             WHERE id_toko = $1
               AND status = 'active'
             ORDER BY id DESC
             LIMIT 1`,
            [tokoId]
        );

        return result.rows[0] ?? null;
    },

    async findLatestByTokoId(tokoId: number): Promise<GanttRow | null> {
        const result = await pool.query<GanttRow>(
            `SELECT id, id_toko, status, email_pembuat, timestamp
             FROM gantt_chart
             WHERE id_toko = $1
             ORDER BY id DESC
             LIMIT 1`,
            [tokoId]
        );

        return result.rows[0] ?? null;
    },

    async listNotes(ganttId: string | number): Promise<GanttNoteRow[]> {
        const result = await pool.query<GanttNoteRow>(
            `SELECT id, id_gantt, author_email, author_name, author_role, note, created_at
             FROM gantt_chart_note
             WHERE id_gantt = $1
             ORDER BY created_at ASC, id ASC`,
            [ganttId]
        );

        return result.rows;
    },

    async createNote(
        ganttId: string | number,
        payload: {
            author_email: string;
            author_name: string;
            author_role: string;
            note: string;
        }
    ): Promise<GanttNoteRow> {
        const result = await pool.query<GanttNoteRow>(
            `INSERT INTO gantt_chart_note (
                id_gantt, author_email, author_name, author_role, note, created_at
             ) VALUES ($1, $2, $3, $4, $5, timezone('Asia/Jakarta', now()))
             RETURNING id, id_gantt, author_email, author_name, author_role, note, created_at`,
            [
                ganttId,
                payload.author_email,
                payload.author_name,
                payload.author_role,
                payload.note.trim()
            ]
        );

        return result.rows[0];
    },

    async updateTokoFieldsById(
        tokoId: number,
        payload: {
            lingkup_pekerjaan?: string | null;
            nama_toko?: string | null;
            kode_toko?: string | null;
            proyek?: string | null;
            cabang?: string | null;
        }
    ): Promise<void> {
        await pool.query(
            `UPDATE toko
             SET lingkup_pekerjaan = COALESCE($1, lingkup_pekerjaan),
                 nama_toko = COALESCE($2, nama_toko),
                 kode_toko = COALESCE($3, kode_toko),
                 proyek = COALESCE($4, proyek),
                 cabang = COALESCE($5, cabang)
             WHERE id = $6`,
            [
                payload.lingkup_pekerjaan ?? null,
                payload.nama_toko ?? null,
                payload.kode_toko ?? null,
                payload.proyek ?? null,
                payload.cabang ?? null,
                tokoId
            ]
        );
    },

    /** Cek gantt chart aktif berdasarkan toko id */
    async existsActiveByTokoId(tokoId: number): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM gantt_chart
                WHERE id_toko = $1
                  AND status = 'active'
            )`,
            [tokoId]
        );
        return result.rows[0]?.exists ?? false;
    },

    /** Buat gantt chart lengkap: upsert toko + header + kategori + day + pengawasan + dependency */
    async createWithDetails(payload: {
        // toko
        nomor_ulok: string;
        takeover_sequence?: number;
        lingkup_pekerjaan?: string | null;
        nama_toko?: string | null;
        kode_toko?: string | null;
        proyek?: string | null;
        cabang?: string | null;
        alamat?: string | null;
        nama_kontraktor?: string | null;
        // gantt
        email_pembuat: string;
        status: GanttStatus;
        gantt_timestamp?: string | null;
        // children
        kategori_pekerjaan: string[];
        day_items: DayGanttItemInput[];
        pengawasan?: PengawasanItemInput[];
        dependencies?: DependencyItemInput[];
    }): Promise<GanttRow & { toko_id: number }> {
        return withTransaction(async (client) => {
            // 1. Upsert toko by kombinasi nomor_ulok + lingkup_pekerjaan + takeover_sequence
            let tsFilter = "";
            let values: unknown[] = [payload.nomor_ulok, payload.lingkup_pekerjaan ?? null];

            if (payload.takeover_sequence !== undefined) {
                values.push(payload.takeover_sequence);
                tsFilter = `AND COALESCE(takeover_sequence, 0) = $3`;
            }

            const existingTokoRes = await client.query<{ id: number }>(
                `SELECT id
                 FROM toko
                 WHERE nomor_ulok = $1
                   AND LOWER(COALESCE(lingkup_pekerjaan, '')) = LOWER(COALESCE($2, ''))
                   ${tsFilter}
                 ORDER BY id DESC
                 LIMIT 1
                 FOR UPDATE`,
                values
            );

            let tokoId: number;
            if ((existingTokoRes.rowCount ?? 0) > 0) {
                tokoId = existingTokoRes.rows[0].id;

                await client.query(
                    `UPDATE toko
                     SET nama_toko = COALESCE($1, nama_toko),
                         kode_toko = COALESCE($2, kode_toko),
                         proyek = COALESCE($3, proyek),
                         cabang = COALESCE($4, cabang),
                         alamat = COALESCE($5, alamat),
                         nama_kontraktor = COALESCE($6, nama_kontraktor)
                     WHERE id = $7`,
                    [
                        payload.nama_toko ?? null,
                        payload.kode_toko ?? null,
                        payload.proyek ?? null,
                        payload.cabang ?? null,
                        payload.alamat ?? null,
                        payload.nama_kontraktor ?? null,
                        tokoId
                    ]
                );
            } else {
                const insertedTokoRes = await client.query<{ id: number }>(
                    `INSERT INTO toko (
                        nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko,
                        proyek, cabang, alamat, nama_kontraktor, takeover_sequence
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    RETURNING id`,
                    [
                        payload.nomor_ulok,
                        payload.lingkup_pekerjaan ?? null,
                        payload.nama_toko ?? null,
                        payload.kode_toko ?? null,
                        payload.proyek ?? null,
                        payload.cabang ?? null,
                        payload.alamat ?? null,
                        payload.nama_kontraktor ?? null,
                        payload.takeover_sequence ?? 0
                    ]
                );

                tokoId = insertedTokoRes.rows[0].id;
            }

            // 2. Insert gantt_chart header
            const tsParam = payload.gantt_timestamp || null;
            const ganttRes = await client.query<GanttRow>(
                `INSERT INTO gantt_chart (id_toko, status, email_pembuat, timestamp)
                 VALUES ($1, $2, $3, COALESCE($4::date, (NOW() AT TIME ZONE 'Asia/Jakarta')::date))
                 RETURNING *`,
                [tokoId, payload.status, payload.email_pembuat, tsParam]
            );
            const gantt = ganttRes.rows[0];

            // 3. Insert kategori pekerjaan
            const kategoriMap = await insertKategoriPekerjaan(
                client,
                gantt.id,
                payload.kategori_pekerjaan
            );

            // 4. Insert day gantt chart items
            await insertDayItems(client, gantt.id, payload.day_items, kategoriMap);

            // 5. Insert pengawasan (if any)
            if (payload.pengawasan && payload.pengawasan.length > 0) {
                await insertPengawasan(client, gantt.id, payload.pengawasan);
            }

            // 6. Insert dependencies (if any)
            if (payload.dependencies && payload.dependencies.length > 0) {
                await insertDependencies(client, gantt.id, payload.dependencies, kategoriMap);
            }

            return { ...gantt, toko_id: tokoId };
        });
    },

    /** Ambil gantt chart lengkap: header + toko + kategori + day + pengawasan + dependency */
    async findById(id: string, idToko?: number): Promise<{
        gantt: GanttRow;
        toko: TokoJoinRow;
        kategori_pekerjaan: KategoriPekerjaanGanttRow[];
        day_items: (DayGanttRow & { kategori_pekerjaan: string })[];
        pengawasan: PengawasanGanttRow[];
        dependencies: (DependencyGanttRow & {
            kategori_pekerjaan: string;
            kategori_pekerjaan_terikat: string;
        })[];
        instruksi_lapangan_items: InstruksiLapanganItemRow[];
    } | null> {
        // Header + toko
        const headerConditions = ["g.id = $1"];
        const headerValues: unknown[] = [id];

        if (idToko !== undefined) {
            headerValues.push(idToko);
            headerConditions.push(`g.id_toko = $${headerValues.length}`);
        }

        const header = await pool.query<GanttRow & TokoJoinRow>(
            `SELECT ${GANTT_COLUMNS},
                    t.id AS toko_id, t.nomor_ulok, t.lingkup_pekerjaan,
                    t.nama_toko, t.kode_toko, t.proyek, t.cabang, t.alamat, t.nama_kontraktor, t.takeover_sequence
             FROM gantt_chart g
            JOIN toko t ON t.id = g.id_toko
            WHERE ${headerConditions.join(" AND ")}`,
            headerValues
        );

        if (header.rowCount === 0) return null;
        const row = header.rows[0];

        // Kategori pekerjaan
        const kategoriRes = await pool.query<KategoriPekerjaanGanttRow>(
            `SELECT id, id_gantt, kategori_pekerjaan
             FROM kategori_pekerjaan_gantt
             WHERE id_gantt = $1
             ORDER BY id ASC`,
            [id]
        );

        // Day items joined with kategori
        const dayRes = await pool.query<DayGanttRow & { kategori_pekerjaan: string }>(
            `SELECT d.id, d.id_gantt, d.id_kategori_pekerjaan_gantt,
                    d.h_awal, d.h_akhir, d.keterlambatan, d.kecepatan,
                    k.kategori_pekerjaan
             FROM day_gantt_chart d
             JOIN kategori_pekerjaan_gantt k ON k.id = d.id_kategori_pekerjaan_gantt
             WHERE d.id_gantt = $1
             ORDER BY d.id ASC`,
            [id]
        );

        // Pengawasan
        const pengawasanRes = await pool.query<PengawasanGanttRow>(
            `SELECT id, id_gantt, id_pic_pengawasan, tanggal_pengawasan
             FROM pengawasan_gantt
             WHERE id_gantt = $1
             ORDER BY id ASC`,
            [id]
        );

        // Dependencies joined with kategori names
        const depRes = await pool.query<
            DependencyGanttRow & {
                kategori_pekerjaan: string;
                kategori_pekerjaan_terikat: string;
            }
        >(
            `SELECT dep.id, dep.id_gantt, dep.id_kategori, dep.id_kategori_terikat,
                    k1.kategori_pekerjaan AS kategori_pekerjaan,
                    k2.kategori_pekerjaan AS kategori_pekerjaan_terikat
             FROM dependency_gantt dep
             JOIN kategori_pekerjaan_gantt k1 ON k1.id = dep.id_kategori
             JOIN kategori_pekerjaan_gantt k2 ON k2.id = dep.id_kategori_terikat
             WHERE dep.id_gantt = $1
             ORDER BY dep.id ASC`,
            [id]
        );

        const gantt: GanttRow = {
            id: row.id,
            id_toko: row.id_toko,
            status: row.status,
            email_pembuat: row.email_pembuat,
            timestamp: row.timestamp
        };

        const toko: TokoJoinRow = {
            id: (row as any).toko_id,
            nomor_ulok: row.nomor_ulok,
            lingkup_pekerjaan: row.lingkup_pekerjaan,
            nama_toko: row.nama_toko,
            kode_toko: row.kode_toko,
            proyek: row.proyek,
            cabang: row.cabang,
            alamat: row.alamat,
            nama_kontraktor: row.nama_kontraktor,
            takeover_sequence: row.takeover_sequence
        };
        const instruksiLapanganItems = await instruksiLapanganRepository.getApprovedItemsByTokoId(gantt.id_toko);

        return {
            gantt,
            toko,
            kategori_pekerjaan: kategoriRes.rows,
            day_items: dayRes.rows,
            pengawasan: pengawasanRes.rows,
            dependencies: depRes.rows,
            instruksi_lapangan_items: instruksiLapanganItems
        };
    },

    /** List gantt chart dengan filter */
    async list(filter: {
        status?: string;
        nomor_ulok?: string;
        email_pembuat?: string;
        cabang_array?: string[];
        nama_kontraktor?: string;
    }): Promise<
        (GanttRow & {
            nomor_ulok: string;
            lingkup_pekerjaan: string | null;
            nama_toko: string | null;
            cabang: string | null;
            proyek: string | null;
        })[]
    > {
        const conditions: string[] = [];
        const values: unknown[] = [];

        // SECURITY: Branch filtering - wajib ada untuk user non-global
        if (filter.cabang_array && filter.cabang_array.length > 0) {
            const normalizedBranches = filter.cabang_array.map((b: string) => b.trim().replace(/_+/g, ' ').replace(/\s+/g, ' ').toUpperCase());
            values.push(normalizedBranches as any);
            conditions.push(`REPLACE(UPPER(TRIM(t.cabang)), '_', ' ') = ANY($${values.length})`);
            if (shouldLogDebug) {
                console.log('[GANTT FILTER] Branch filter applied:', normalizedBranches);
            }
        } else {
            // Jika sampai sini tanpa cabang_array, berarti ada bug di controller/filter logic
            console.warn('[GANTT FILTER] NO BRANCH FILTER! This should not happen for non-global users');
        }

        // SECURITY: Contractor filter - pastikan kontraktor hanya lihat proyek mereka sendiri
        if (filter.nama_kontraktor) {
            const normalizedKontraktor = filter.nama_kontraktor.toLowerCase().replace(/\b(pt|cv)\b/gi, '').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
            values.push(normalizedKontraktor);
            conditions.push(`LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(t.nama_kontraktor, '\\y(pt|cv)\\y|[\\.,]', ' ', 'gi'), '\\s+', ' ', 'g'))) = $${values.length}`);
            if (shouldLogDebug) {
                console.log('[GANTT FILTER] Contractor filter applied:', filter.nama_kontraktor);
            }
        }

        if (filter.status) {
            values.push(filter.status);
            conditions.push(`g.status = $${values.length}`);
        }

        if (filter.nomor_ulok) {
            values.push(filter.nomor_ulok);
            conditions.push(`t.nomor_ulok = $${values.length}`);
        }

        if (filter.email_pembuat) {
            values.push(filter.email_pembuat);
            conditions.push(`g.email_pembuat = $${values.length}`);
        }

        const whereClause =
            conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT ${GANTT_COLUMNS},
                t.nomor_ulok, t.lingkup_pekerjaan, t.nama_toko, t.cabang, t.proyek, t.takeover_sequence
             FROM gantt_chart g
             JOIN toko t ON t.id = g.id_toko
             ${whereClause}
             ORDER BY g.timestamp DESC NULLS LAST, g.id DESC`,
            values
        );

        return result.rows;
    },

    /** Update status gantt chart -> terkunci */
    async updateStatus(ganttId: string, newStatus: GanttStatus): Promise<void> {
        await pool.query(
            `UPDATE gantt_chart SET status = $1 WHERE id = $2`,
            [newStatus, ganttId]
        );
    },

    /** Aktifkan gantt chart terbaru berdasarkan toko */
    async activateLatestByTokoId(tokoId: number): Promise<boolean> {
        const result = await pool.query(
            `UPDATE gantt_chart
             SET status = 'active'
             WHERE id = (
                SELECT id
                FROM gantt_chart
                WHERE id_toko = $1
                ORDER BY id DESC
                LIMIT 1
             )`,
            [tokoId]
        );

        return (result.rowCount ?? 0) > 0;
    },

    /**
     * Pulihkan kolom toko yang wajib stabil setelah proses lock gantt chart.
     * Ini menjadi guard jika ada side-effect trigger saat update status gantt.
     */
    async restoreTokoStableFieldsByGanttId(ganttId: string, fields: TokoStableFields): Promise<void> {
        await pool.query(
            `UPDATE toko t
             SET kode_toko = $1,
                 alamat = $2,
                 nama_kontraktor = $3
             FROM gantt_chart g
             WHERE g.id = $4
               AND t.id = g.id_toko`,
            [fields.kode_toko, fields.alamat, fields.nama_kontraktor, ganttId]
        );
    },

    /** Update gantt chart (replace children data) */
    async updateWithDetails(
        ganttId: string,
        payload: {
            kategori_pekerjaan?: string[];
            day_items?: DayGanttItemInput[];
            pengawasan?: PengawasanItemInput[];
            dependencies?: DependencyItemInput[];
        }
    ): Promise<void> {
        return withTransaction(async (client) => {
            // Jika ada kategori_pekerjaan baru, hapus children lama lalu insert ulang
            if (payload.kategori_pekerjaan && payload.day_items) {
                // Hapus dependency dulu (FK ke kategori)
                await client.query(
                    `DELETE FROM dependency_gantt WHERE id_gantt = $1`,
                    [ganttId]
                );
                // Hapus day items (FK ke kategori)
                await client.query(
                    `DELETE FROM day_gantt_chart WHERE id_gantt = $1`,
                    [ganttId]
                );
                // Hapus kategori
                await client.query(
                    `DELETE FROM kategori_pekerjaan_gantt WHERE id_gantt = $1`,
                    [ganttId]
                );

                // Insert ulang kategori
                const ganttIdNum = Number(ganttId);
                const kategoriMap = await insertKategoriPekerjaan(
                    client,
                    ganttIdNum,
                    payload.kategori_pekerjaan
                );

                // Insert ulang day items
                await insertDayItems(
                    client,
                    ganttIdNum,
                    payload.day_items,
                    kategoriMap
                );

                // Insert ulang dependencies
                if (payload.dependencies && payload.dependencies.length > 0) {
                    await insertDependencies(
                        client,
                        ganttIdNum,
                        payload.dependencies,
                        kategoriMap
                    );
                }
            }

            // Update pengawasan jika ada
            if (payload.pengawasan) {
                const desiredDates = Array.from(new Set(
                    payload.pengawasan
                        .map((item) => item.tanggal_pengawasan.trim())
                        .filter(Boolean)
                ));

                await client.query(
                    `
                    DELETE FROM pengawasan_gantt pg
                    WHERE pg.id_gantt = $1
                      AND NOT (pg.tanggal_pengawasan = ANY($2::text[]))
                      AND NOT EXISTS (
                          SELECT 1
                          FROM pengawasan p
                          WHERE p.id_pengawasan_gantt = pg.id
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM berkas_pengawasan bp
                          WHERE bp.id_pengawasan_gantt = pg.id
                      )
                    `,
                    [ganttId, desiredDates]
                );

                if (desiredDates.length > 0) {
                    await insertPengawasan(
                        client,
                        Number(ganttId),
                        desiredDates.map((tanggalPengawasan) => ({
                            tanggal_pengawasan: tanggalPengawasan
                        }))
                    );
                }
            }
        });
    },

    /** Hapus gantt chart beserta semua children (cascade) */
    async deleteById(id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM gantt_chart WHERE id = $1`,
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },

    /** Ambil status gantt chart by id */
    async findStatusById(id: string): Promise<string | null> {
        const result = await pool.query<{ status: string }>(
            `SELECT status FROM gantt_chart WHERE id = $1`,
            [id]
        );
        return result.rows[0]?.status ?? null;
    },

    /** Ambil mapping kategori_pekerjaan -> id untuk gantt tertentu */
    async getKategoriMap(ganttId: string): Promise<Map<string, number>> {
        const result = await pool.query<{ id: number; kategori_pekerjaan: string }>(
            `SELECT id, kategori_pekerjaan FROM kategori_pekerjaan_gantt WHERE id_gantt = $1`,
            [ganttId]
        );
        const map = new Map<string, number>();
        for (const row of result.rows) {
            map.set(normalizeKategoriKey(row.kategori_pekerjaan), row.id);
        }
        return map;
    },

    /** Tambah day items ke gantt existing */
    async addDayItems(
        ganttId: string,
        dayItems: DayGanttItemInput[]
    ): Promise<number> {
        const kategoriMap = await this.getKategoriMap(ganttId);
        let inserted = 0;

        for (const item of dayItems) {
            const kategoriId = getKategoriId(kategoriMap, item.kategori_pekerjaan);
            if (!kategoriId) continue;

            await pool.query(
                `INSERT INTO day_gantt_chart
                    (id_gantt, id_kategori_pekerjaan_gantt, h_awal, h_akhir, keterlambatan, kecepatan)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    ganttId,
                    kategoriId,
                    item.h_awal,
                    item.h_akhir,
                    item.keterlambatan ?? null,
                    item.kecepatan ?? null
                ]
            );
            inserted++;
        }

        return inserted;
    },

    /** Update keterlambatan semua day item pada kategori tertentu */
    async updateKeterlambatan(
        ganttId: string,
        kategoriPekerjaan: string,
        keterlambatan: string
    ): Promise<{ day_ids: number[] } | null> {
        const result = await pool.query<{ id: number }>(
            `UPDATE day_gantt_chart d
             SET keterlambatan = $1
             FROM kategori_pekerjaan_gantt k
             WHERE d.id_kategori_pekerjaan_gantt = k.id
               AND d.id_gantt = $2
               AND k.id_gantt = $2
               AND k.kategori_pekerjaan ILIKE $3
             RETURNING d.id`,
            [keterlambatan, ganttId, kategoriPekerjaan]
        );

        if (result.rowCount === 0) return null;
        return { day_ids: result.rows.map((row: { id: number }) => row.id) };
    },

    /** Update kecepatan pada day item tertentu */
    async updateKecepatan(
        ganttId: string,
        kategoriPekerjaan: string,
        hAwal: string,
        hAkhir: string,
        kecepatan: string
    ): Promise<{ day_id: number } | null> {
        const result = await pool.query<{ id: number }>(
            `UPDATE day_gantt_chart d
             SET kecepatan = $1
             FROM kategori_pekerjaan_gantt k
             WHERE d.id_kategori_pekerjaan_gantt = k.id
               AND d.id_gantt = $2
               AND k.kategori_pekerjaan ILIKE $3
               AND d.h_awal = $4
               AND d.h_akhir = $5
             RETURNING d.id`,
            [kecepatan, ganttId, kategoriPekerjaan, hAwal, hAkhir]
        );

        if (result.rowCount === 0) return null;
        return { day_id: result.rows[0].id };
    },

    /** Tambah pengawasan (single/bulk) */
    async addPengawasan(
        ganttId: string,
        tanggalPengawasanList: string[],
        idPicPengawasan?: number
    ): Promise<{ inserted: number; ids: number[] }> {
        const ids: number[] = [];

        for (const tanggalPengawasan of tanggalPengawasanList) {
            const existing = await pool.query<{ id: number }>(
                `SELECT id
                 FROM pengawasan_gantt
                 WHERE id_gantt = $1 AND tanggal_pengawasan = $2
                 ORDER BY id ASC
                 LIMIT 1`,
                [ganttId, tanggalPengawasan]
            );

            if (existing.rows[0]) {
                await pool.query(
                    `UPDATE pengawasan_gantt
                     SET id_pic_pengawasan = COALESCE($1, id_pic_pengawasan)
                      WHERE id = $2`,
                    [idPicPengawasan ?? null, existing.rows[0].id]
                );
                ids.push(existing.rows[0].id);
                continue;
            }

            const result = await pool.query<{ id: number }>(
                `INSERT INTO pengawasan_gantt (id_gantt, tanggal_pengawasan, id_pic_pengawasan)
                 VALUES ($1, $2, $3) RETURNING id`,
                [ganttId, tanggalPengawasan, idPicPengawasan ?? null]
            );
            ids.push(result.rows[0].id);
        }

        return { inserted: ids.length, ids };
    },

    async ensureDelayTargetPengawasan(
        sourceGanttId: string,
        requestedTanggalPengawasan?: string | null,
        useStTargetDateAsFallback: boolean = false
    ): Promise<{
        nomor_ulok: string | null;
        tanggal_pengawasan: string | null;
        effective_end_date: string | null;
        st_target_date: string | null;
        inserted_count: number;
    }> {
        const effectiveEndResult = await pool.query<{
            nomor_ulok: string | null;
            effective_end: string | null;
        }>(
            `
            WITH target_ulok AS (
                SELECT t.nomor_ulok
                FROM gantt_chart g
                JOIN toko t ON t.id = g.id_toko
                WHERE g.id = $1
                LIMIT 1
            ),
            scope AS (
                SELECT
                    t.nomor_ulok,
                    (${effectiveSpkExpression})::date AS effective_end
                FROM toko t
                JOIN target_ulok tu ON tu.nomor_ulok = t.nomor_ulok
                LEFT JOIN LATERAL (
                    SELECT g.id, g.status
                    FROM gantt_chart g
                    WHERE g.id_toko = t.id
                    ORDER BY g.id DESC
                    LIMIT 1
                ) latest_gantt ON true
                LEFT JOIN LATERAL (
                    SELECT p.*
                    FROM pengajuan_spk p
                    WHERE p.id_toko = t.id
                    ORDER BY p.id DESC
                    LIMIT 1
                ) p ON true
                WHERE p.id IS NOT NULL
            )
            SELECT nomor_ulok, MAX(effective_end)::text AS effective_end
            FROM scope
            GROUP BY nomor_ulok
            `,
            [sourceGanttId]
        );

        const nomorUlok = effectiveEndResult.rows[0]?.nomor_ulok ?? null;
        const effectiveEnd = effectiveEndResult.rows[0]?.effective_end ?? null;
        if (!nomorUlok || !effectiveEnd) {
            return {
                nomor_ulok: nomorUlok,
                tanggal_pengawasan: null,
                effective_end_date: effectiveEnd,
                st_target_date: null,
                inserted_count: 0
            };
        }

        const stTargetDate = requestedTanggalPengawasan
            ? requestedTanggalPengawasan
            : buildStTargetInfo(effectiveEnd).st_target_date ?? effectiveEnd;
            
        // FIX: Saat Pertambahan SPK, tanggal pengawasan terakhir harusnya Akhir SPK (effectiveEnd),
        // namun untuk keterlambatan, gunakan stTargetDate.
        const dateToInsert = requestedTanggalPengawasan || (useStTargetDateAsFallback ? stTargetDate : effectiveEnd);
        if (!dateToInsert) {
            return {
                nomor_ulok: nomorUlok,
                tanggal_pengawasan: null,
                effective_end_date: effectiveEnd,
                st_target_date: stTargetDate,
                inserted_count: 0
            };
        }

        const formattedDate = await pool.query<{ tanggal_pengawasan: string }>(
            `
            SELECT CASE
                WHEN TRIM($1::text) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                    THEN to_char(to_date(LEFT(TRIM($1::text), 10), 'YYYY-MM-DD'), 'DD/MM/YYYY')
                WHEN TRIM($1::text) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
                    THEN to_char(to_date(TRIM($1::text), 'DD/MM/YYYY'), 'DD/MM/YYYY')
                ELSE TRIM($1::text)
            END AS tanggal_pengawasan
            `,
            [dateToInsert]
        );
        const tanggalPengawasan = formattedDate.rows[0].tanggal_pengawasan;

        // Bersihkan checkpoint ST lama (yang lebih dari effectiveEnd) yang masih kosong agar tidak menumpuk
        if (useStTargetDateAsFallback) {
            await pool.query(
                `
                DELETE FROM pengawasan_gantt pg
                USING gantt_chart g, toko t
                WHERE pg.id_gantt = g.id
                  AND g.id_toko = t.id
                  AND t.nomor_ulok = $1
                  AND to_date(pg.tanggal_pengawasan, 'DD/MM/YYYY') > to_date($2::text, 'YYYY-MM-DD')
                  AND pg.tanggal_pengawasan != $3::text
                  AND NOT EXISTS (
                      SELECT 1 FROM pengawasan p WHERE p.id_pengawasan_gantt = pg.id
                  )
                `,
                [nomorUlok, effectiveEnd, tanggalPengawasan]
            );
        }

        const insertResult = await pool.query(
            `
            INSERT INTO pengawasan_gantt (id_gantt, tanggal_pengawasan)
            SELECT latest_gantt.id, $2::text
            FROM toko t
            JOIN LATERAL (
                SELECT g.id
                FROM gantt_chart g
                WHERE g.id_toko = t.id
                ORDER BY g.id DESC
                LIMIT 1
            ) latest_gantt ON true
            WHERE t.nomor_ulok = $1
              AND NOT EXISTS (
                  SELECT 1
                  FROM pengawasan_gantt pg
                  WHERE pg.id_gantt = latest_gantt.id
                    AND pg.tanggal_pengawasan = $2::text
              )
            `,
            [nomorUlok, tanggalPengawasan]
        );

        return {
            nomor_ulok: nomorUlok,
            tanggal_pengawasan: tanggalPengawasan,
            effective_end_date: effectiveEnd,
            st_target_date: stTargetDate,
            inserted_count: insertResult.rowCount ?? 0
        };
    },

    async removePengawasan(
        ganttId: string,
        tanggalPengawasan: string
    ): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM pengawasan_gantt
             WHERE id_gantt = $1 AND tanggal_pengawasan = $2`,
            [ganttId, tanggalPengawasan]
        );
        return (result.rowCount ?? 0) > 0;
    },

    async getPengawasanGanttByIdGantt(ganttId: string | number): Promise<{ id_pic_pengawasan: number | null, tanggal_pengawasan: string }[]> {
        const result = await pool.query<{ id_pic_pengawasan: number | null, tanggal_pengawasan: string }>(
            `SELECT id_pic_pengawasan, tanggal_pengawasan
             FROM pengawasan_gantt
             WHERE id_gantt = $1`,
            [ganttId]
        );
        return result.rows;
    },

    async ensureLastPengawasanMatchesEffectiveSpkEnd(nomorUlok: string): Promise<{ tanggal_pengawasan: string | null; inserted_count: number }> {
        const ganttResult = await pool.query<{ id: number }>(
            `
            SELECT g.id
            FROM gantt_chart g
            JOIN toko t ON t.id = g.id_toko
            WHERE t.nomor_ulok = $1
            ORDER BY g.id DESC
            LIMIT 1
            `,
            [nomorUlok]
        );

        const ganttId = ganttResult.rows[0]?.id;
        if (!ganttId) {
            return { tanggal_pengawasan: null, inserted_count: 0 };
        }

        const result = await ganttRepository.ensureDelayTargetPengawasan(String(ganttId), null);

        return {
            tanggal_pengawasan: result.tanggal_pengawasan,
            inserted_count: result.inserted_count
        };
    },

    /**
     * Detail Gantt Chart berdasarkan id_toko.
     * - Ambil RAB terbaru → rab_item → unique kategori_pekerjaan (filtered_categories)
     * - Ambil gantt_chart terbaru + children (kategori, day, pengawasan, dependency)
     */
    async findDetailByTokoId(tokoId: number): Promise<{
        toko: TokoJoinRow;
        rab: { id: number; status: string | null } | null;
        filtered_categories: string[];
        gantt: GanttRow | null;
        kategori_pekerjaan: KategoriPekerjaanGanttRow[];
        day_items: (DayGanttRow & { kategori_pekerjaan: string })[];
        pengawasan: PengawasanGanttRow[];
        pengawasan_items?: any[];
        dependencies: (DependencyGanttRow & {
            kategori_pekerjaan: string;
            kategori_pekerjaan_terikat: string;
        })[];
        instruksi_lapangan_items: InstruksiLapanganItemRow[];
    } | null> {
        // 1. Cek toko exists
        const tokoRes = await pool.query<TokoJoinRow>(
            `SELECT id, nomor_ulok, lingkup_pekerjaan, nama_toko, kode_toko,
                    proyek, cabang, alamat, nama_kontraktor, takeover_sequence
             FROM toko WHERE id = $1`,
            [tokoId]
        );
        if (tokoRes.rowCount === 0) return null;
        const toko = tokoRes.rows[0];

        // 2. Ambil RAB relevan untuk toko ini.
        // Prioritaskan RAB yang sudah disetujui; jangan sampai RAB reject terbaru
        // menggantikan item/kategori untuk pengawasan Gantt yang sudah berjalan.
        const rabRes = await pool.query<{ id: number; status: string | null }>(
            `SELECT id, status
             FROM rab
             WHERE id_toko = $1
             ORDER BY
                CASE
                    WHEN status = 'Disetujui' THEN 0
                    WHEN status = 'Menunggu Gantt Chart' THEN 1
                    WHEN status IN (
                        'Menunggu Persetujuan Direktur Kontraktor',
                        'Menunggu Persetujuan Koordinator',
                        'Menunggu Persetujuan Manajer'
                    ) THEN 2
                    ELSE 3
                END,
                created_at DESC,
                id DESC
             LIMIT 1`,
            [tokoId]
        );
        const rab = rabRes.rows[0] ?? null;

        // 3. Ambil unique kategori_pekerjaan dari rab_item (filtered)
        let filteredCategories: string[] = [];
        if (rab) {
            const catRes = await pool.query<{ kategori_pekerjaan: string }>(
                `SELECT DISTINCT kategori_pekerjaan
                 FROM rab_item
                 WHERE id_rab = $1
                 ORDER BY kategori_pekerjaan ASC`,
                [rab.id]
            );
            filteredCategories = catRes.rows.map(
                (r: { kategori_pekerjaan: string }) => r.kategori_pekerjaan
            );
        }
        const instruksiLapanganItems = await instruksiLapanganRepository.getApprovedItemsByTokoId(tokoId);
        const ilCategories = Array.from(new Set(
            instruksiLapanganItems
                .map((item) => String(item.kategori_pekerjaan ?? "").trim())
                .filter(Boolean)
                .map((category) => `[IL] ${category.toUpperCase()}`)
        ));
        filteredCategories = Array.from(new Set([...filteredCategories, ...ilCategories]));

        // 4. Ambil gantt_chart terbaru untuk toko ini
        const ganttRes = await pool.query<GanttRow>(
            `SELECT id, id_toko, status, email_pembuat, timestamp
             FROM gantt_chart
             WHERE id_toko = $1
             ORDER BY timestamp DESC NULLS LAST, id DESC LIMIT 1`,
            [tokoId]
        );
        const gantt = ganttRes.rows[0] ?? null;

        if (!gantt) {
            return {
                toko,
                rab,
                filtered_categories: filteredCategories,
                gantt: null,
                kategori_pekerjaan: [],
                day_items: [],
                pengawasan: [],
                pengawasan_items: [],
                dependencies: [],
                instruksi_lapangan_items: instruksiLapanganItems
            };
        }

        // 5. Kategori pekerjaan gantt
        const kategoriRes = await pool.query<KategoriPekerjaanGanttRow>(
            `SELECT id, id_gantt, kategori_pekerjaan
             FROM kategori_pekerjaan_gantt
             WHERE id_gantt = $1
             ORDER BY id ASC`,
            [gantt.id]
        );

        // 6. Day items
        const dayRes = await pool.query<DayGanttRow & { kategori_pekerjaan: string }>(
            `SELECT d.id, d.id_gantt, d.id_kategori_pekerjaan_gantt,
                    d.h_awal, d.h_akhir, d.keterlambatan, d.kecepatan,
                    k.kategori_pekerjaan
             FROM day_gantt_chart d
             JOIN kategori_pekerjaan_gantt k ON k.id = d.id_kategori_pekerjaan_gantt
             WHERE d.id_gantt = $1
             ORDER BY d.id ASC`,
            [gantt.id]
        );

        // 7. Pengawasan
        const pengawasanRes = await pool.query<PengawasanGanttRow>(
            `SELECT id, id_gantt, id_pic_pengawasan, tanggal_pengawasan
             FROM pengawasan_gantt
             WHERE id_gantt = $1
             ORDER BY id ASC`,
            [gantt.id]
        );

        // 7.1 Pengawasan Items
        const pengawasanItemsRes = await pool.query(
            `SELECT id, id_gantt, kategori_pekerjaan, jenis_pekerjaan, status
             FROM pengawasan
             WHERE id_gantt = $1
             ORDER BY id ASC`,
            [gantt.id]
        );

        // 8. Dependencies
        const depRes = await pool.query<
            DependencyGanttRow & {
                kategori_pekerjaan: string;
                kategori_pekerjaan_terikat: string;
            }
        >(
            `SELECT dep.id, dep.id_gantt, dep.id_kategori, dep.id_kategori_terikat,
                    k1.kategori_pekerjaan AS kategori_pekerjaan,
                    k2.kategori_pekerjaan AS kategori_pekerjaan_terikat
             FROM dependency_gantt dep
             JOIN kategori_pekerjaan_gantt k1 ON k1.id = dep.id_kategori
             JOIN kategori_pekerjaan_gantt k2 ON k2.id = dep.id_kategori_terikat
             WHERE dep.id_gantt = $1
             ORDER BY dep.id ASC`,
            [gantt.id]
        );

        return {
            toko,
            rab,
            filtered_categories: filteredCategories,
            gantt,
            kategori_pekerjaan: kategoriRes.rows,
            day_items: dayRes.rows,
            pengawasan: pengawasanRes.rows,
            pengawasan_items: pengawasanItemsRes.rows,
            dependencies: depRes.rows,
            instruksi_lapangan_items: instruksiLapanganItems
        };
    },

    async syncCategoriesWithRab(tokoId: number, rabId: number): Promise<void> {
        // Find if this toko has a Gantt Chart
        const gantt = await pool.query(`SELECT id FROM gantt_chart WHERE id_toko = $1`, [tokoId]);
        if (gantt.rowCount === 0) return;
        const ganttId = gantt.rows[0].id;

        // Get valid RAB categories
        const rabItems = await pool.query(`SELECT DISTINCT kategori_pekerjaan FROM rab_item WHERE id_rab = $1`, [rabId]);
        const validCategories = rabItems.rows.map(r => r.kategori_pekerjaan.trim().toUpperCase());
        if (validCategories.length === 0) return; // avoid deleting everything if RAB is fully empty somehow

        // Get Gantt categories
        const ganttCategories = await pool.query(`SELECT id, kategori_pekerjaan FROM kategori_pekerjaan_gantt WHERE id_gantt = $1`, [ganttId]);
        
        const invalidCategoryIds: number[] = [];
        for (const gc of ganttCategories.rows) {
            if (!validCategories.includes(gc.kategori_pekerjaan.trim().toUpperCase())) {
                invalidCategoryIds.push(gc.id);
            }
        }

        if (invalidCategoryIds.length === 0) return;

        // Clean up orphaned categories safely (no FK constraints to pengawasan since they link by id_gantt)
        await pool.query('BEGIN');
        try {
            await pool.query(`DELETE FROM day_gantt_chart WHERE id_kategori_pekerjaan_gantt = ANY($1::int[])`, [invalidCategoryIds]);
            await pool.query(`DELETE FROM dependency_gantt WHERE id_kategori = ANY($1::int[]) OR id_kategori_terikat = ANY($1::int[])`, [invalidCategoryIds]);
            await pool.query(`DELETE FROM kategori_pekerjaan_gantt WHERE id = ANY($1::int[])`, [invalidCategoryIds]);
            await pool.query('COMMIT');
        } catch (e) {
            await pool.query('ROLLBACK');
            throw e;
        }
    }
};
