export const RENOVATION_PROJECT_LABEL = "Renovasi";

export const isRenovationUlok = (nomorUlok?: string | null): boolean =>
    /-R$/i.test(String(nomorUlok ?? "").trim());

export const normalizeProjectByUlok = (
    nomorUlok?: string | null,
    proyek?: string | null
): string | null => {
    const trimmedProyek = String(proyek ?? "").trim();
    if (isRenovationUlok(nomorUlok)) {
        // Jika sudah berupa varian renovasi (misal "Renovasi Perluasan"), biarkan spesifik.
        // Jika tidak, fallback ke "Renovasi".
        if (trimmedProyek.toLowerCase().startsWith("renovasi") || 
            trimmedProyek.toLowerCase() === "perpanjangan" || 
            trimmedProyek.toLowerCase() === "perluasan") {
            return trimmedProyek;
        }
        return RENOVATION_PROJECT_LABEL;
    }

    return trimmedProyek || null;
};
