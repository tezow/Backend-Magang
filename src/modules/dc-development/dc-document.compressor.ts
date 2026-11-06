import { PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import zlib from "zlib";

export interface DocumentCompressionResult {
    buffer: Buffer;
    originalSize: number;
    compressedSize: number;
    ratioPercent: number;
    mimeType: string;
}

export interface CompressOptions {
    maxDimension?: number;
    quality?: number;
}

/**
 * Kompresi file gambar (JPEG, PNG, WEBP, TIFF) menggunakan sharp.
 */
export async function compressImageBuffer(
    buffer: Buffer,
    mimeType: string,
    options: CompressOptions = {}
): Promise<DocumentCompressionResult> {
    const originalSize = buffer.length;
    const { maxDimension = 1920, quality = 65 } = options;

    try {
        const compressed = await sharp(buffer)
            .resize({
                width: maxDimension,
                height: maxDimension,
                fit: "inside",
                withoutEnlargement: true
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

        if (compressed.length >= originalSize) {
            return {
                buffer,
                originalSize,
                compressedSize: originalSize,
                ratioPercent: 0,
                mimeType
            };
        }

        const compressedSize = compressed.length;
        const savedBytes = originalSize - compressedSize;
        const ratioPercent = Math.max(1, Math.round((savedBytes / originalSize) * 100));

        return {
            buffer: compressed,
            originalSize,
            compressedSize,
            ratioPercent,
            mimeType: "image/jpeg"
        };
    } catch {
        return {
            buffer,
            originalSize,
            compressedSize: originalSize,
            ratioPercent: 0,
            mimeType
        };
    }
}

/**
 * Kompresi file PDF multi-halaman dengan mengompresi langsung stream gambar internal.
 * Sangat efisien, memangkas dokumen scan (seperti 62.5 MB -> 10.4 MB) tanpa merusak struktur dokumen.
 */
export async function compressPdfBuffer(
    buffer: Buffer,
    options: CompressOptions = {}
): Promise<DocumentCompressionResult> {
    const originalSize = buffer.length;
    const { maxDimension = 1200, quality = 55 } = options;

    try {
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const context = pdfDoc.context;

        const entries: any[] = [];
        context.enumerateIndirectObjects().forEach(([ref, obj]) => {
            if (obj && typeof (obj as any).getContents === "function" && (obj as any).dict) {
                const subtype = (obj as any).dict.get(PDFName.of("Subtype"));
                if (subtype && subtype.toString() === "/Image") {
                    entries.push({ ref, obj });
                }
            }
        });

        if (entries.length > 0) {
            for (const { obj } of entries) {
                const filter = obj.dict.get(PDFName.of("Filter"));
                const filterStr = filter ? filter.toString() : "";
                let rawBytes = obj.getContents();

                if (filterStr.includes("FlateDecode")) {
                    try {
                        rawBytes = zlib.inflateSync(rawBytes);
                    } catch {
                        // Jika gagal inflate, gunakan raw
                    }
                }

                try {
                    const compressedJpeg = await sharp(rawBytes)
                        .resize({
                            width: maxDimension,
                            height: Math.round(maxDimension * 1.42),
                            fit: "inside",
                            withoutEnlargement: true
                        })
                        .jpeg({ quality, mozjpeg: true })
                        .toBuffer();

                    const meta = await sharp(compressedJpeg).metadata();
                    if (meta.width && meta.height && compressedJpeg.length < obj.getContents().length) {
                        obj.dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
                        obj.dict.set(PDFName.of("Width"), context.obj(meta.width));
                        obj.dict.set(PDFName.of("Height"), context.obj(meta.height));
                        obj.dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
                        obj.dict.set(PDFName.of("BitsPerComponent"), context.obj(8));
                        obj.contents = compressedJpeg;
                        obj.dict.set(PDFName.of("Length"), context.obj(compressedJpeg.length));
                    }
                } catch {
                    // Abaikan jika stream gambar tertentu gagal di-decode
                }
            }
        }

        const compressedPdfBytes = await pdfDoc.save();
        const compressedBuffer = Buffer.from(compressedPdfBytes);

        if (compressedBuffer.length >= originalSize) {
            return {
                buffer,
                originalSize,
                compressedSize: originalSize,
                ratioPercent: 0,
                mimeType: "application/pdf"
            };
        }

        const compressedSize = compressedBuffer.length;
        const savedBytes = originalSize - compressedSize;
        const ratioPercent = Math.max(1, Math.round((savedBytes / originalSize) * 100));

        return {
            buffer: compressedBuffer,
            originalSize,
            compressedSize,
            ratioPercent,
            mimeType: "application/pdf"
        };
    } catch {
        return {
            buffer,
            originalSize,
            compressedSize: originalSize,
            ratioPercent: 0,
            mimeType: "application/pdf"
        };
    }
}

/**
 * Controller utama kompresi dokumen di backend.
 */
export async function compressDocumentBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    options: CompressOptions = {}
): Promise<DocumentCompressionResult> {
    const ext = originalName.split(".").pop()?.toLowerCase() || "";

    if (ext === "pdf" || mimeType === "application/pdf") {
        return compressPdfBuffer(buffer, options);
    }

    if (["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"].includes(ext) || mimeType.startsWith("image/")) {
        return compressImageBuffer(buffer, mimeType, options);
    }

    // Untuk jenis file lain yang sudah terkompresi
    return {
        buffer,
        originalSize: buffer.length,
        compressedSize: buffer.length,
        ratioPercent: 0,
        mimeType
    };
}
