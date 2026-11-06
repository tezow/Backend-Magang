/**
 * NATIONAL HOLIDAYS 2026 - Indonesia
 * Sumber: SKB 3 Menteri (Menag, Menaker, Menpan-RB) - 19 September 2025
 * 
 * Logika Bisnis:
 * - Libur nasional yang jatuh di hari kerja (Senin-Jumat) TIDAK dihitung sebagai hari denda
 * - Weekend (Sabtu-Minggu) + libur nasional di hari Senin = total 3 hari bebas denda
 * - Contoh: SPK berakhir Jumat, weekend aman, Senin libur nasional = ST bisa Selasa tanpa denda
 */

export type NationalHoliday = {
    date: string; // Format: YYYY-MM-DD
    dayOfWeek: string;
    description: string;
    affectsWorkday: boolean; // True jika libur jatuh di hari kerja (Senin-Jumat)
};

/**
 * Daftar Hari Libur Nasional 2026
 * Total: 17 hari libur nasional
 * Berdampak ke hari kerja: 13 hari
 */
export const NATIONAL_HOLIDAYS_2026: NationalHoliday[] = [
    {
        date: "2026-01-01",
        dayOfWeek: "Kamis",
        description: "Tahun Baru 2026 Masehi",
        affectsWorkday: true
    },
    {
        date: "2026-01-16",
        dayOfWeek: "Jumat",
        description: "Isra Mikraj Nabi Muhammad SAW",
        affectsWorkday: true
    },
    {
        date: "2026-02-17",
        dayOfWeek: "Selasa",
        description: "Tahun Baru Imlek 2577 Kongzili",
        affectsWorkday: true
    },
    {
        date: "2026-03-19",
        dayOfWeek: "Kamis",
        description: "Hari Suci Nyepi (Tahun Baru Saka 1948)",
        affectsWorkday: true
    },
    {
        date: "2026-03-21",
        dayOfWeek: "Sabtu",
        description: "Idulfitri 1447 H (Hari 1)",
        affectsWorkday: false
    },
    {
        date: "2026-03-22",
        dayOfWeek: "Minggu",
        description: "Idulfitri 1447 H (Hari 2)",
        affectsWorkday: false
    },
    {
        date: "2026-04-03",
        dayOfWeek: "Jumat",
        description: "Wafat Yesus Kristus",
        affectsWorkday: true
    },
    {
        date: "2026-04-05",
        dayOfWeek: "Minggu",
        description: "Kebangkitan Yesus Kristus (Paskah)",
        affectsWorkday: false
    },
    {
        date: "2026-05-01",
        dayOfWeek: "Jumat",
        description: "Hari Buruh Internasional",
        affectsWorkday: true
    },
    {
        date: "2026-05-14",
        dayOfWeek: "Kamis",
        description: "Kenaikan Yesus Kristus",
        affectsWorkday: true
    },
    {
        date: "2026-05-27",
        dayOfWeek: "Rabu",
        description: "Iduladha 1447 H",
        affectsWorkday: true
    },
    {
        date: "2026-05-31",
        dayOfWeek: "Minggu",
        description: "Hari Raya Waisak 2570 BE",
        affectsWorkday: false
    },
    {
        date: "2026-06-01",
        dayOfWeek: "Senin",
        description: "Hari Lahir Pancasila",
        affectsWorkday: true
    },
    {
        date: "2026-06-16",
        dayOfWeek: "Selasa",
        description: "1 Muharam Tahun Baru Islam 1448 H",
        affectsWorkday: true
    },
    {
        date: "2026-08-17",
        dayOfWeek: "Senin",
        description: "Proklamasi Kemerdekaan RI",
        affectsWorkday: true
    },
    {
        date: "2026-08-25",
        dayOfWeek: "Selasa",
        description: "Maulid Nabi Muhammad SAW",
        affectsWorkday: true
    },
    {
        date: "2026-12-25",
        dayOfWeek: "Jumat",
        description: "Hari Raya Natal",
        affectsWorkday: true
    }
];

/**
 * Cek apakah tanggal adalah libur nasional (yang berdampak ke hari kerja)
 */
export const isNationalHoliday = (date: Date): boolean => {
    const dateStr = toIsoDateString(date);
    const holiday = NATIONAL_HOLIDAYS_2026.find(h => h.date === dateStr);
    return holiday?.affectsWorkday ?? false;
};

/**
 * Cek apakah tanggal adalah weekend (Sabtu atau Minggu)
 */
export const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Minggu, 6 = Sabtu
};

/**
 * Cek apakah tanggal adalah hari non-kerja (weekend ATAU libur nasional)
 */
export const isNonWorkingDay = (date: Date): boolean => {
    return isWeekend(date) || isNationalHoliday(date);
};

/**
 * Tambah hari ke tanggal
 */
export const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

/**
 * Normalisasi tanggal ke awal hari (00:00:00)
 */
export const startOfDay = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Convert Date ke ISO date string (YYYY-MM-DD)
 */
export const toIsoDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/**
 * BUSINESS LOGIC: Hitung hari kerja berikutnya setelah tanggal tertentu
 * 
 * Logika:
 * - Skip weekend (Sabtu-Minggu)
 * - Skip libur nasional yang jatuh di hari kerja
 * 
 * Contoh:
 * - SPK berakhir Jumat 25 Des 2026 (Natal)
 *   → Skip Sabtu 26, Minggu 27
 *   → Senin 28 Des = hari kerja pertama
 * 
 * - SPK berakhir Jumat 31 Mei 2026
 *   → Skip Sabtu 1 Jun (tapi ini Senin dan libur nasional!)
 *   → Skip Minggu 2 Jun
 *   → Senin 1 Jun LIBUR NASIONAL → skip
 *   → Selasa 2 Jun = hari kerja pertama
 */
export const nextBusinessDayAfter = (date: Date): Date => {
    let current = addDays(startOfDay(date), 1);
    
    // Loop hingga menemukan hari kerja (bukan weekend dan bukan libur nasional)
    while (isNonWorkingDay(current)) {
        current = addDays(current, 1);
    }
    
    return current;
};

/**
 * BUSINESS LOGIC: Hitung jumlah hari KALENDER antara dua tanggal
 * (termasuk weekend dan libur nasional)
 * 
 * Sesuai aturan bisnis Alfamart:
 * - Denda dihitung per hari KALENDER, bukan hari kerja
 * - Weekend (Sabtu-Minggu) tetap dihitung sebagai hari denda
 * - Libur nasional tetap dihitung sebagai hari denda
 * 
 * @param freeDate - Tanggal bebas denda (eksklusif)
 * @param stDate - Tanggal serah terima (inklusif)
 * @returns Jumlah hari kalender
 */
export const countCalendarDaysAfterFreeDate = (freeDate: Date, stDate: Date): number => {
    const normalizedFreeDate = startOfDay(freeDate);
    const normalizedStDate = startOfDay(stDate);
    
    if (normalizedStDate <= normalizedFreeDate) return 0;
    
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.round((normalizedStDate.getTime() - normalizedFreeDate.getTime()) / MS_PER_DAY);
};

/**
 * BUSINESS LOGIC: Hitung tanggal ST efektif untuk Gantt Chart
 * 
 * Logika:
 * - Dari tanggal akhir SPK, hitung hari kerja berikutnya (skip weekend + libur nasional)
 * - Ini adalah tanggal ST yang "ideal" tanpa denda
 * 
 * Contoh:
 * - Durasi SPK: 20 hari, mulai Senin 11 Mei 2026
 * - Akhir SPK: Jumat 29 Mei 2026
 * - Weekend: Sabtu 30, Minggu 31 Mei
 * - Senin 1 Jun 2026 LIBUR NASIONAL (Hari Lahir Pancasila)
 * - Tanggal ST ideal: Selasa 2 Jun 2026
 * - Label Gantt: "SPK+3 (Sabtu, Minggu, Senin Libur)"
 * 
 * @param spkEndDate - Tanggal akhir SPK (H-durasi)
 * @returns Tanggal ST efektif dan informasi tambahan untuk Gantt
 */
export const calculateEffectiveStDate = (spkEndDate: Date): {
    effectiveStDate: Date;
    skippedDays: number;
    offsetDays: number;
    skippedWeekends: number;
    skippedHolidays: number;
    label: string;
    explanation: string;
} => {
    const normalized = startOfDay(spkEndDate);
    let current = addDays(normalized, 1);
    let skippedWeekends = 0;
    let skippedHolidays = 0;
    
    // Hitung hari yang diskip
    while (isNonWorkingDay(current)) {
        if (isWeekend(current)) {
            skippedWeekends++;
        } else if (isNationalHoliday(current)) {
            skippedHolidays++;
        }
        current = addDays(current, 1);
    }
    
    const totalSkipped = skippedWeekends + skippedHolidays;
    const offsetDays = Math.max(0, Math.round((current.getTime() - normalized.getTime()) / (24 * 60 * 60 * 1000)));
    
    // Build explanation untuk Gantt Chart
    const parts: string[] = [];
    if (skippedWeekends > 0) {
        parts.push(`${skippedWeekends} weekend`);
    }
    if (skippedHolidays > 0) {
        parts.push(`${skippedHolidays} libur nasional`);
    }
    
    const label = `SPK +${offsetDays} hari`;
    const explanation = parts.length > 0 
        ? `${label} (${parts.join(", ")})`
        : label;
    
    return {
        effectiveStDate: current,
        skippedDays: totalSkipped,
        offsetDays,
        skippedWeekends,
        skippedHolidays,
        label,
        explanation
    };
};

/**
 * Get daftar semua libur nasional dalam range tertentu
 */
export const getHolidaysInRange = (startDate: Date, endDate: Date): NationalHoliday[] => {
    const start = startOfDay(startDate);
    const end = startOfDay(endDate);
    
    return NATIONAL_HOLIDAYS_2026.filter(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate >= start && holidayDate <= end;
    });
};
