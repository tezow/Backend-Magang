/**
 * GANTT CHART DATE CALCULATOR
 * 
 * Module untuk menghitung tanggal efektif pada Gantt Chart dengan mempertimbangkan:
 * - Weekend (Sabtu-Minggu)
 * - Libur Nasional 2026
 * 
 * Business Logic:
 * - Durasi SPK adalah hari KALENDER (termasuk weekend dan libur)
 * - Tanggal ST ideal = hari kerja pertama setelah akhir SPK (skip weekend + libur nasional)
 * - Gantt Chart menampilkan label untuk hari yang diskip
 */

import {
    addDays,
    startOfDay,
    isWeekend,
    isNationalHoliday,
    isNonWorkingDay,
    nextBusinessDayAfter,
    calculateEffectiveStDate,
    toIsoDateString,
    getHolidaysInRange,
    type NationalHoliday
} from "../../common/national-holidays";

export type GanttDateLabel = {
    date: string; // YYYY-MM-DD
    dayNumber: number; // H-1, H-2, etc (relatif dari waktu_mulai)
    isWorkingDay: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayInfo?: NationalHoliday;
    label: string; // "H-20 (Akhir SPK)", "SPK+1 (Sabtu)", "SPK+3 (ST Ideal)"
};

export type GanttScheduleResult = {
    waktu_mulai: string;
    waktu_selesai: string; // Akhir SPK (H-durasi)
    durasi_kalender: number; // Durasi SPK dalam hari kalender
    effective_st_date: string; // Tanggal ST ideal (skip weekend + libur)
    skipped_days: number; // Jumlah hari yang diskip
    skipped_weekends: number;
    skipped_holidays: number;
    st_label: string; // "SPK+3 (Sabtu, Minggu, Senin Libur)"
    schedule: GanttDateLabel[]; // Array tanggal dari H-1 sampai ST ideal
    holidays_in_range: NationalHoliday[]; // Libur nasional dalam range SPK
};

/**
 * Generate schedule Gantt Chart dengan label skip hari
 * 
 * @param waktuMulai - Tanggal mulai SPK (YYYY-MM-DD atau Date)
 * @param durasi - Durasi SPK dalam hari kalender
 * @returns Schedule lengkap dengan label untuk setiap hari
 */
export const calculateGanttSchedule = (
    waktuMulai: string | Date,
    durasi: number
): GanttScheduleResult => {
    const startDate = typeof waktuMulai === "string" ? new Date(waktuMulai) : waktuMulai;
    const normalized = startOfDay(startDate);
    
    // Hitung tanggal akhir SPK (H-durasi, hari kalender)
    const spkEndDate = addDays(normalized, durasi - 1);
    
    // Hitung tanggal ST efektif (skip weekend + libur nasional)
    const stInfo = calculateEffectiveStDate(spkEndDate);
    
    // Generate schedule dari H-1 sampai ST ideal
    const schedule: GanttDateLabel[] = [];
    let currentDate = normalized;
    let dayNumber = 1;
    
    // Fase 1: Hari H-1 sampai H-durasi (hari SPK)
    while (dayNumber <= durasi) {
        const dateStr = toIsoDateString(currentDate);
        const weekend = isWeekend(currentDate);
        const holiday = isNationalHoliday(currentDate);
        
        let label = `H-${dayNumber}`;
        if (dayNumber === durasi) {
            label += " (Akhir SPK)";
        } else if (holiday) {
            const holidayInfo = getHolidaysInRange(currentDate, currentDate)[0];
            label += ` (Libur: ${holidayInfo?.description})`;
        } else if (weekend) {
            label += ` (${currentDate.getDay() === 0 ? "Minggu" : "Sabtu"})`;
        }
        
        schedule.push({
            date: dateStr,
            dayNumber,
            isWorkingDay: !weekend && !holiday,
            isWeekend: weekend,
            isHoliday: holiday,
            holidayInfo: holiday ? getHolidaysInRange(currentDate, currentDate)[0] : undefined,
            label
        });
        
        currentDate = addDays(currentDate, 1);
        dayNumber++;
    }
    
    // Fase 2: Hari setelah SPK sampai ST ideal (hari yang diskip)
    if (stInfo.skippedDays > 0) {
        let skipDay = 1;
        currentDate = addDays(spkEndDate, 1);
        
        while (skipDay <= stInfo.skippedDays) {
            const dateStr = toIsoDateString(currentDate);
            const weekend = isWeekend(currentDate);
            const holiday = isNationalHoliday(currentDate);
            
            let label = `SPK+${skipDay}`;
            if (holiday) {
                const holidayInfo = getHolidaysInRange(currentDate, currentDate)[0];
                label += ` (Libur: ${holidayInfo?.description})`;
            } else if (weekend) {
                label += ` (${currentDate.getDay() === 0 ? "Minggu" : "Sabtu"})`;
            }
            
            schedule.push({
                date: dateStr,
                dayNumber: durasi + skipDay,
                isWorkingDay: false,
                isWeekend: weekend,
                isHoliday: holiday,
                holidayInfo: holiday ? getHolidaysInRange(currentDate, currentDate)[0] : undefined,
                label
            });
            
            currentDate = addDays(currentDate, 1);
            skipDay++;
        }
    }
    
    // Tambahkan tanggal ST ideal
    const stDateStr = toIsoDateString(stInfo.effectiveStDate);
    schedule.push({
        date: stDateStr,
        dayNumber: durasi + stInfo.skippedDays + 1,
        isWorkingDay: true,
        isWeekend: false,
        isHoliday: false,
        label: `${stInfo.explanation} - ST Ideal`
    });
    
    // Cari libur nasional dalam range
    const holidays = getHolidaysInRange(normalized, stInfo.effectiveStDate);
    
    return {
        waktu_mulai: toIsoDateString(normalized),
        waktu_selesai: toIsoDateString(spkEndDate),
        durasi_kalender: durasi,
        effective_st_date: stDateStr,
        skipped_days: stInfo.skippedDays,
        skipped_weekends: stInfo.skippedWeekends,
        skipped_holidays: stInfo.skippedHolidays,
        st_label: stInfo.explanation,
        schedule,
        holidays_in_range: holidays
    };
};

/**
 * Generate description untuk tooltip Gantt Chart
 */
export const generateGanttTooltip = (dateLabel: GanttDateLabel): string => {
    const parts: string[] = [
        `Tanggal: ${dateLabel.date}`,
        `Label: ${dateLabel.label}`
    ];
    
    if (dateLabel.isHoliday && dateLabel.holidayInfo) {
        parts.push(`Libur Nasional: ${dateLabel.holidayInfo.description}`);
    }
    
    if (dateLabel.isWeekend) {
        parts.push("Catatan: Weekend");
    }
    
    if (!dateLabel.isWorkingDay && !dateLabel.isWeekend && !dateLabel.isHoliday) {
        parts.push("Catatan: Hari setelah SPK (menuju ST)");
    }
    
    return parts.join("\n");
};

/**
 * Cek apakah data SPK sudah ST atau belum
 * Jika sudah ST, return actual ST date
 * Jika belum ST, return calculated ideal ST date
 */
export const getActualOrIdealStDate = (
    waktuMulai: string | Date,
    durasi: number,
    actualStDate?: string | null
): {
    stDate: string;
    isActual: boolean;
    isLate: boolean;
    lateDays: number;
    stLabel: string;
} => {
    const schedule = calculateGanttSchedule(waktuMulai, durasi);
    
    if (!actualStDate) {
        return {
            stDate: schedule.effective_st_date,
            isActual: false,
            isLate: false,
            lateDays: 0,
            stLabel: `${schedule.st_label} (Belum ST)`
        };
    }
    
    const actualDate = new Date(actualStDate);
    const idealDate = new Date(schedule.effective_st_date);
    
    const isLate = actualDate > idealDate;
    const lateDays = isLate 
        ? Math.floor((actualDate.getTime() - idealDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
    
    return {
        stDate: actualStDate,
        isActual: true,
        isLate,
        lateDays,
        stLabel: isLate 
            ? `ST Terlambat ${lateDays} hari` 
            : "ST Tepat Waktu"
    };
};

/**
 * Format durasi untuk display di UI
 */
export const formatDurasiWithSkip = (
    durasi: number,
    skippedDays: number,
    skippedWeekends: number,
    skippedHolidays: number
): string => {
    const parts: string[] = [`${durasi} hari SPK`];
    
    if (skippedDays > 0) {
        const skipParts: string[] = [];
        if (skippedWeekends > 0) {
            skipParts.push(`${skippedWeekends} weekend`);
        }
        if (skippedHolidays > 0) {
            skipParts.push(`${skippedHolidays} libur nasional`);
        }
        parts.push(`+ ${skippedDays} hari skip (${skipParts.join(", ")})`);
    }
    
    return parts.join(" ");
};
