export function sanitizeFilename(name: string): string {
    if (!name) return "Unknown";
    // Hapus karakter ilegal windows/linux: \ / : * ? " < > |
    // Ganti dengan spasi atau dash, lalu rapikan multiple spasi.
    return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Generate nama file standar:
 * [Tipe Dokumen] - [nomor ulok] - [nama toko] - [lingkup].[ext]
 */
export function generateStandardFilename(
    tipeDokumen: string,
    nomorUlok: string | null | undefined,
    namaToko: string | null | undefined,
    lingkup: string | null | undefined,
    ext: string
): string {
    const safeTipe = tipeDokumen.trim();
    const safeUlok = sanitizeFilename(nomorUlok || "NO_ULOK");
    const safeToko = sanitizeFilename(namaToko || "NO_TOKO");
    const safeLingkup = sanitizeFilename(lingkup || "NO_LINGKUP");
    
    // Pastikan ekstensi punya awalan titik
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;

    return `${safeTipe} - ${safeUlok} - ${safeToko} - ${safeLingkup}${safeExt}`;
}
