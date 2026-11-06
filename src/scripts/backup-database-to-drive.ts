import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import { GoogleProvider } from "../common/google";
import { env } from "../config/env";

type DriveBackupFile = {
    id?: string | null;
    name?: string | null;
    createdTime?: string | null;
};

const BACKUP_PREFIX = "sparta-db-backup-";
const BACKUP_MIME_TYPE = "application/gzip";

function jakartaTimestampForFilename(date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}_${value("hour")}-${value("minute")}-${value("second")}_wib`;
}

function runPgDumpToGzip(outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const pgDump = spawn("pg_dump", [
            "--format=plain",
            "--no-owner",
            "--no-privileges",
            env.DATABASE_URL,
        ], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stderr = "";
        pgDump.stderr.setEncoding("utf8");
        pgDump.stderr.on("data", (chunk) => {
            stderr += chunk;
        });

        const processFinished = new Promise<void>((processResolve, processReject) => {
            pgDump.on("error", (error) => {
                processReject(new Error(`Gagal menjalankan pg_dump: ${error.message}`));
            });
            pgDump.on("close", (code) => {
                if (code === 0) {
                    processResolve();
                    return;
                }
                processReject(new Error(`pg_dump gagal dengan exit code ${code}: ${stderr.trim()}`));
            });
        });

        Promise.all([
            pipeline(pgDump.stdout, createGzip({ level: 9 }), fs.createWriteStream(outputPath)),
            processFinished,
        ]).then(() => resolve()).catch(reject);
    });
}

async function uploadPrivateBackup(folderId: string, filename: string, filePath: string): Promise<string> {
    const drive = GoogleProvider.instance.docDrive;
    if (!drive) throw new Error("Google Drive dokumen belum siap");

    const uploaded = await drive.files.create({
        requestBody: {
            name: filename,
            parents: [folderId],
        },
        media: {
            mimeType: BACKUP_MIME_TYPE,
            body: fs.createReadStream(filePath),
        },
        fields: "id",
        supportsAllDrives: true,
    });

    const fileId = uploaded.data.id;
    if (!fileId) throw new Error("Upload backup ke Google Drive gagal: fileId kosong");
    return fileId;
}

async function pruneOldBackups(folderId: string, keepCount: number): Promise<number> {
    const drive = GoogleProvider.instance.docDrive;
    if (!drive) throw new Error("Google Drive dokumen belum siap");

    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false and name contains '${BACKUP_PREFIX}'`,
        fields: "files(id, name, createdTime)",
        orderBy: "createdTime desc",
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });

    const backups = (res.data.files ?? [])
        .filter((file): file is DriveBackupFile & { id: string; createdTime: string } =>
            Boolean(file.id && file.createdTime && file.name?.startsWith(BACKUP_PREFIX))
        )
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

    const oldBackups = backups.slice(keepCount);
    for (const file of oldBackups) {
        await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
        console.log(`[backup-db] deleted old backup: ${file.name}`);
    }

    return oldBackups.length;
}

async function main() {
    console.log("[backup-db] initializing Google services");
    await GoogleProvider.initialize();

    const rootFolderId = env.DB_BACKUP_DRIVE_ROOT_ID || env.DOC_DRIVE_ROOT_ID;
    const backupFolderId = await GoogleProvider.instance.getOrCreateFolder(env.DB_BACKUP_DRIVE_FOLDER_NAME, rootFolderId);
    const filename = `${BACKUP_PREFIX}${jakartaTimestampForFilename()}.sql.gz`;
    const outputPath = path.join(os.tmpdir(), filename);

    try {
        console.log("[backup-db] running pg_dump");
        await runPgDumpToGzip(outputPath);

        const stats = fs.statSync(outputPath);
        if (stats.size <= 0) throw new Error("File backup kosong");
        console.log(`[backup-db] dump ready: ${filename} (${stats.size} bytes)`);

        const fileId = await uploadPrivateBackup(backupFolderId, filename, outputPath);
        console.log(`[backup-db] uploaded backup to Drive: ${fileId}`);

        const deletedCount = await pruneOldBackups(backupFolderId, env.DB_BACKUP_RETENTION_COUNT);
        console.log(`[backup-db] retention complete: deleted ${deletedCount} old backup(s)`);
    } finally {
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
    }
}

main().catch((error) => {
    console.error("[backup-db] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
