import path from "path";
import sharp from "sharp";
import { GoogleProvider } from "./google";

sharp.concurrency(1);

const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const byIdParam = /[?&]id=([^&]+)/.exec(trimmed);
    if (byIdParam?.[1]) return byIdParam[1];

    const byPath = /\/d\/([^/]+)/.exec(trimmed);
    if (byPath?.[1]) return byPath[1];

    // Fallback: Jika bukan URL dan formatnya mirip raw ID Google Drive
    if (!trimmed.startsWith("http") && /^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
        return trimmed;
    }

    return null;
};

const normalizeDriveDownloadLink = (value: string): string => {
    const fileId = extractDriveFileId(value);
    if (!fileId) return value;
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

const inferImageMimeType = (buffer: Buffer, explicitMime?: string | null, filename?: string | null): string | null => {
    if (buffer.length >= 12) {
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
        if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
        
        const ftyp = buffer.toString("ascii", 4, 8);
        if (ftyp === "ftyp") {
            const brand = buffer.toString("ascii", 8, 12);
            if (["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(brand)) {
                return "image/heic";
            }
        }
    }

    const mime = (explicitMime ?? "").toLowerCase();
    if (mime.startsWith("image/")) {
        // Jangan percaya mime type JPEG/PNG dari Google Drive jika extension-nya bukan itu, 
        // tapi kita biarkan saja karena magic bytes di atas sudah mengecek JPEG/PNG sejati.
        return mime;
    }

    const ext = path.extname(filename ?? "").toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".heic" || ext === ".heif") return "image/heic";

    return null;
};

export const resolveDriveImageDataUrl = async (rawLink?: string | null): Promise<string | null> => {
    const link = (rawLink ?? "").trim();
    if (!link) return null;
    if (/^data:image\//i.test(link)) return link;

    try {
        const fileId = extractDriveFileId(link);
        const gp = GoogleProvider.instance;
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;
        let filename: string | null = null;

        // Coba download via spartaDrive (OAuth)
        if (fileId && gp.spartaDrive) {
            buffer = await gp.getFileBufferById(gp.spartaDrive, fileId, 2500);

            if (buffer) {
                try {
                    const meta = await gp.spartaDrive.files.get(
                        { fileId, fields: "name,mimeType" },
                        { timeout: 3000 }
                    );
                    filename = meta.data.name ?? null;
                    mimeType = meta.data.mimeType ?? null;
                } catch {
                    // Metadata is best-effort; image inference can still use the buffer.
                }
            }
        }

        // Fallback: coba docDrive jika spartaDrive gagal
        if (!buffer && fileId && gp.docDrive) {
            buffer = await gp.getFileBufferById(gp.docDrive, fileId, 2500);
            if (buffer) {
                try {
                    const meta = await gp.docDrive.files.get(
                        { fileId, fields: "name,mimeType" },
                        { timeout: 3000 }
                    );
                    filename = meta.data.name ?? null;
                    mimeType = meta.data.mimeType ?? null;
                } catch {
                    // ignore
                }
            }
        }

        // Fallback terakhir untuk URL non-Drive. File Drive private harus lewat OAuth/proxy backend.
        if (!buffer && !fileId && /^https?:\/\//i.test(link)) {
            try {
                const downloadUrl = normalizeDriveDownloadLink(link);
                const response = await fetch(downloadUrl, {
                    redirect: "follow",
                    signal: AbortSignal.timeout(5000),
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; SPARTA-PDF/1.0)",
                    }
                });
                if (response.ok) {
                    const contentType = response.headers.get("content-type") || "";
                    // Pastikan bukan HTML (halaman error/login Google)
                    if (!contentType.includes("text/html")) {
                        buffer = Buffer.from(await response.arrayBuffer());
                        mimeType = contentType;
                    }
                }
            } catch {
                // ignore, biarkan null
            }
        }

        if (!buffer?.length) return null;

        let imageMime = inferImageMimeType(buffer, mimeType, filename);
        if (!imageMime) return null;

        const convertHeicIfNeeded = async () => {
            console.log(`[drive-image] Mengkonversi HEIC ke JPEG menggunakan heic-convert...`);
            const heicConvert = require("heic-convert");
            const jpegBuffer = await heicConvert({
                buffer: buffer as Buffer,
                format: 'JPEG',
                quality: 0.5 // Kurangi quality agar lebih cepat
            });
            buffer = Buffer.from(jpegBuffer);
            imageMime = "image/jpeg";
        };

        // Jika format HEIC/HEIF, konversi dulu ke JPEG sebelum diproses oleh sharp
        if (imageMime.includes("heic") || imageMime.includes("heif")) {
            try {
                await convertHeicIfNeeded();
            } catch (convErr) {
                console.warn("[drive-image] Konversi HEIC ke JPEG gagal:", convErr instanceof Error ? convErr.message : String(convErr));
                return null; // Skip karena tidak bisa diproses
            }
        }

        try {
            const sharpInstance = sharp(buffer, { failOn: "none" });
            const meta = await sharpInstance.metadata();
            if (meta.width && (meta.width > 800 || (meta.height && meta.height > 800))) {
                buffer = await sharpInstance
                    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();
            } else {
                buffer = await sharpInstance
                    .jpeg({ quality: 80 })
                    .toBuffer();
            }
            return `data:image/jpeg;base64,${buffer.toString("base64")}`;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn("[drive-image] Gagal mengompres gambar menggunakan sharp:", errMsg);
            
            // Jika heic terlewat dari deteksi magic bytes
            if (errMsg.includes("heif:") || errMsg.includes("heic")) {
                try {
                    await convertHeicIfNeeded();
                    return `data:image/jpeg;base64,${buffer!.toString("base64")}`;
                } catch (convErr) {
                    console.warn("[drive-image] Konversi darurat heic-convert gagal:", convErr instanceof Error ? convErr.message : String(convErr));
                    return null;
                }
            }

            // Chromium/Puppeteer tidak mendukung native HEIC/HEIF dalam tag <img>.
            if (imageMime!.includes("heic") || imageMime!.includes("heif")) {
                console.warn(`[drive-image] Format ${imageMime} tidak didukung Chromium, foto di-skip untuk PDF.`);
                return null;
            }

            // Jika gagal kompresi tapi formatnya didukung (JPEG/PNG), kita fallback ke gambar asli
            // HANYA JIKA ukurannya masuk akal (< 2.5 MB) agar tidak menyebabkan WebSocket payload / OOM crash.
            if (buffer!.length > 2.5 * 1024 * 1024) {
                console.warn(`[drive-image] Ukuran gambar terlalu besar (${(buffer!.length/1024/1024).toFixed(2)} MB) setelah gagal kompresi, di-skip untuk mencegah OOM.`);
                return null;
            }

            return `data:${imageMime};base64,${buffer!.toString("base64")}`;
        }
    } catch (error) {
        console.warn("[pdf-image] Gagal memuat foto Drive untuk PDF", {
            message: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
};
