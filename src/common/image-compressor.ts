import sharp from "sharp";

export async function compressImage(file: Express.Multer.File): Promise<{ buffer: Buffer; mimetype: string; originalname: string }> {
    if (!file.mimetype.startsWith("image/")) {
        return { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname };
    }

    try {
        const compressedBuffer = await sharp(file.buffer)
            .resize({ width: 1920, withoutEnlargement: true }) // Limit width to 1920px max
            .jpeg({ quality: 75 }) // Compress aggressively but safely (75% quality JPEG)
            .toBuffer();
        
        let newName = file.originalname;
        if (!newName.toLowerCase().endsWith('.jpg') && !newName.toLowerCase().endsWith('.jpeg')) {
            newName = newName.replace(/\.[^/.]+$/, "") + ".jpg";
        }

        return { buffer: compressedBuffer, mimetype: "image/jpeg", originalname: newName };
    } catch (error) {
        console.error("Failed to compress image:", error);
        return { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname };
    }
}
