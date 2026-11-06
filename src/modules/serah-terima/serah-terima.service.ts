import { AppError } from "../../common/app-error";
import { GoogleProvider } from "../../common/google";
import { env } from "../../config/env";
import type { AuthenticatedUser } from "../auth/auth-session.service";
import { calculateDendaByTokoId } from "../denda/denda-keterlambatan";
import { opnameFinalService } from "../opname-final/opname-final.service";
import { canManageSystemMaintenance } from "../system-maintenance/system-maintenance.service";
import {
    buildSerahTerimaPdfBuffer,
    buildSerahTerimaUnifiedAssessmentPdfBuffer,
    buildSerahTerimaUnifiedCoverPdfBuffer,
    calculateSerahTerimaAssessmentScore
} from "./serah-terima.pdf";
import { serahTerimaRepository } from "./serah-terima.repository";
import { ganttRepository } from "../gantt/gantt.repository";
import { tokoRepository } from "../toko/toko.repository";
import { PDFDocument } from "pdf-lib";

const sanitizeFilenamePart = (value: string | undefined, fallback: string): string => {
    const normalized = (value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    return normalized || fallback;
};

const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const byIdParam = /[?&]id=([^&]+)/.exec(trimmed);
    if (byIdParam?.[1]) return byIdParam[1];

    const byPath = /\/d\/([^/]+)/.exec(trimmed);
    if (byPath?.[1]) return byPath[1];

    return null;
};

const normalizeDriveDownloadLink = (value: string): string => {
    const fileId = extractDriveFileId(value);
    if (!fileId) return value;
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

const downloadStoredPdfBuffer = async (linkPdf?: string | null): Promise<Buffer | null> => {
    if (!linkPdf) return null;

    const gp = GoogleProvider.instance;
    const fileId = extractDriveFileId(linkPdf);
    let buffer: Buffer | null = null;

    if (fileId) {
        if (gp.spartaDrive) {
            buffer = await gp.getFileBufferById(gp.spartaDrive, fileId);
        }
        if (!buffer && gp.docDrive) {
            buffer = await gp.getFileBufferById(gp.docDrive, fileId);
        }
    }

    if (!buffer && /^https?:\/\//i.test(linkPdf)) {
        const response = await fetch(normalizeDriveDownloadLink(linkPdf));
        if (response.ok) {
            buffer = Buffer.from(await response.arrayBuffer());
        }
    }

    return buffer && buffer.length > 0 ? buffer : null;
};

const dateOnlyKey = (value: unknown): string | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};


const uploadPdfToDrive = async (buffer: Buffer, filename: string, nomorUlok?: string | null, proyek?: string | null): Promise<string> => {
    const gp = GoogleProvider.instance;
    const drive = gp.spartaDrive;
    if (!drive) {
        throw new AppError("Google Drive (Sparta) belum terkonfigurasi", 500);
    }

    const folderId = await gp.getOrCreateProcessFolder("Serah Terima", nomorUlok);

    const result = await gp.uploadFile(
        folderId,
        filename,
        "application/pdf",
        buffer,
        2,
        drive
    );

    return result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`;
};

const buildDetailByTokoId = async (idToko: number) => {
    const toko = await serahTerimaRepository.findTokoById(idToko);
    if (!toko) {
        throw new AppError("Data toko tidak ditemukan", 404);
    }

    const opnameFinal = await serahTerimaRepository.findOpnameFinalByIdToko(idToko);
    if (!opnameFinal) {
        throw new AppError("Data opname_final tidak ditemukan untuk toko ini", 404);
    }

    const items = await serahTerimaRepository.findOpnameItemsByOpnameFinalId(opnameFinal.id);
    return { toko, opnameFinal, items };
};

const mergePdfBuffers = async (buffers: Buffer[]): Promise<Buffer> => {
    const merged = await PDFDocument.create();

    for (const buffer of buffers) {
        const source = await PDFDocument.load(buffer);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
    }

    return Buffer.from(await merged.save());
};

const getSerahTerimaReadiness = async (idToko: number) => {
    const toko = await tokoRepository.findById(idToko);
    if (!toko) {
        return { ready: false, reason: "Data toko tidak ditemukan" };
    }

    const opnameFinal = await serahTerimaRepository.findOpnameFinalByIdToko(idToko);
    if (!opnameFinal) {
        return {
            ready: false,
            reason: "Data opname_final belum tersedia untuk toko ini",
        };
    }

    const scopes = await ganttRepository.findSupervisionWorkspace(toko.nomor_ulok, toko.takeover_sequence || 0);
    if (!scopes || scopes.length === 0) {
        return { ready: false, reason: "Gantt chart belum tersedia untuk toko ini" };
    }

    const activeScopes = scopes.filter((s: any) => Number(s.gantt_id) > 0);
    if (activeScopes.length === 0) {
        return { ready: false, reason: "Belum ada pekerjaan pengawasan yang diaktifkan untuk toko ini" };
    }

    for (const scope of activeScopes) {
        // Escape hatch untuk data migrasi V1: opname_final APPROVED dianggap sudah final.
        if (scope.status_opname_final === 'APPROVED') continue;

        const missingPengawasan = Number(scope.missing_pengawasan_checkpoints || 0);
        if (missingPengawasan > 0) {
            return {
                ready: false,
                reason: `Masih ada ${missingPengawasan} pekerjaan pengawasan yang belum selesai pada lingkup ${scope.lingkup_pekerjaan}`,
            };
        }

        const readyOpnameItems = (scope.checkpoints || []).reduce((sum: number, cp: any) => sum + Number(cp.ready_opname_items || 0), 0);
        if (readyOpnameItems > 0) {
            return {
                ready: false,
                reason: `Masih ada ${readyOpnameItems} pekerjaan selesai yang belum masuk Opname pada lingkup ${scope.lingkup_pekerjaan}`,
            };
        }

        const opnameItems = (scope.checkpoints || []).reduce((sum: number, cp: any) => sum + Number(cp.opname_items || 0), 0);
        if (opnameItems === 0) {
            return {
                ready: false,
                reason: `Belum ada pengawasan yang selesai untuk masuk ke opname pada lingkup ${scope.lingkup_pekerjaan}`,
            };
        }
    }

    return {
        ready: true,
        reason: null,
    };
};

const assertSerahTerimaReady = async (idToko: number) => {
    const readiness = await getSerahTerimaReadiness(idToko);
    if (!readiness.ready) {
        throw new AppError(readiness.reason ?? "Serah Terima belum siap dibuat", 409);
    }
};

const assertSerahTerimaReadyForUnified = async (idToko: number) => {
    const readiness = await getSerahTerimaReadiness(idToko);
    if (readiness.ready) return;

    const existingBerkas = await serahTerimaRepository.findBerkasSerahTerimaByIdToko(idToko);
    if (existingBerkas?.link_pdf) {
        return;
    }

    throw new AppError(readiness.reason ?? "Serah Terima belum siap dibuat", 409);
};

const automaticSerahTerimaInProgress = new Set<number>();
const automaticUnifiedSerahTerimaInProgress = new Set<string>();
const runningBerkasRegenerateJobs = new Set<number>();

export const scheduleAutomaticUnifiedSerahTerimaIfReady = async (nomorUlok?: string | null): Promise<void> => {
    const key = String(nomorUlok || "").trim();
    if (!key || automaticUnifiedSerahTerimaInProgress.has(key)) return;

    const scopes = await serahTerimaRepository.findTokoScopesByNomorUlok(key);
    const activeScopes = scopes.filter((scope) =>
        ["SIPIL", "ME"].includes(String(scope.lingkup_pekerjaan || "").trim().toUpperCase())
    );
    if (activeScopes.length < 2) return;

    const readiness = await Promise.all(activeScopes.map((scope) => getSerahTerimaReadiness(scope.id)));
    if (readiness.some((item) => !item.ready)) return;

    automaticUnifiedSerahTerimaInProgress.add(key);
    setImmediate(() => {
        serahTerimaService
            .createPdfSerahTerimaUnified(key)
            .then((result) => {
                console.log(`[ST][AUTO_UNIFIED] Berhasil generate unified ULOK=${key}, berkas=${result.id}`);
            })
            .catch((error) => {
                console.error("[ST][AUTO_UNIFIED] Gagal generate unified", {
                    nomorUlok: key,
                    error: error instanceof Error ? error.message : String(error)
                });
            })
            .finally(() => {
                automaticUnifiedSerahTerimaInProgress.delete(key);
            });
    });
};

export const scheduleAutomaticSerahTerimaIfReady = async (idToko: number, referenceTimestamp?: string): Promise<void> => {
    if (automaticSerahTerimaInProgress.has(idToko)) return;

    const existing = await serahTerimaRepository.findBerkasSerahTerimaByIdToko(idToko);
    if (existing?.link_pdf) return;

    const readiness = await getSerahTerimaReadiness(idToko);
    if (!readiness.ready) return;

    automaticSerahTerimaInProgress.add(idToko);
    setImmediate(() => {
        serahTerimaService
            .createPdfSerahTerima(idToko, referenceTimestamp)
            .then((result) => {
                console.log(`[ST][AUTO] Berhasil generate otomatis id_toko=${idToko}, berkas=${result.id}`);
            })
            .catch((error) => {
                console.error("[ST][AUTO] Gagal generate otomatis", {
                    idToko,
                    error: error instanceof Error ? error.message : String(error)
                });
            })
            .finally(() => {
                automaticSerahTerimaInProgress.delete(idToko);
            });
    });
};

export const serahTerimaService = {
    ensureDateCorrectionAuditSchema: () => serahTerimaRepository.ensureDateCorrectionAuditSchema(),

    async list(filter: { id_toko?: number; nomor_ulok?: string; cabang_array?: string[]; nama_kontraktor?: string } = {}) {
        const rows = await serahTerimaRepository.listBerkasSerahTerima({
            id_toko: filter.id_toko,
            nomor_ulok: filter.nomor_ulok,
            cabang_array: filter.cabang_array,
            nama_kontraktor: filter.nama_kontraktor,
        });

        // Compute denda on-the-fly when no official denda exists or when the ST date
        // was corrected but the denormalized opname_final denda fields are stale.
        // This ensures the serah terima list stays in sync with the dashboard's denda display.
        const enriched = await Promise.all(
            rows.map(async (row) => {
                let hariDenda = row.hari_denda;
                let nilaiDenda = row.nilai_denda;
                let tanggalAkhirSpkDenda = row.tanggal_akhir_spk_denda;
                let tanggalSerahTerimaDenda = row.tanggal_serah_terima_denda;

                const storedStDate = dateOnlyKey(tanggalSerahTerimaDenda);
                const actualStDate = dateOnlyKey(row.created_at);
                const shouldRecalculateDenda =
                    (hariDenda === null && tanggalAkhirSpkDenda === null)
                    || Boolean(storedStDate && actualStDate && storedStDate !== actualStDate);

                if (shouldRecalculateDenda) {
                    try {
                        const denda = await calculateDendaByTokoId(row.id_toko);
                        hariDenda = denda.hari_denda;
                        nilaiDenda = String(denda.nilai_denda);
                        tanggalAkhirSpkDenda = denda.tanggal_akhir_spk;
                        tanggalSerahTerimaDenda = denda.tanggal_serah_terima;
                    } catch {
                        // Silently keep null values if calculation fails
                    }
                }

                return {
                    id: row.id,
                    id_toko: row.id_toko,
                    link_pdf: row.link_pdf,
                    created_at: row.created_at,
                    toko: {
                        id: row.id_toko,
                        nomor_ulok: row.nomor_ulok,
                        lingkup_pekerjaan: row.lingkup_pekerjaan,
                        nama_toko: row.nama_toko,
                        kode_toko: row.kode_toko,
                        proyek: row.proyek,
                        cabang: row.cabang,
                        alamat: row.alamat,
                        nama_kontraktor: row.nama_kontraktor,
                    },
                    nilai_penawaran: row.nilai_penawaran,
                    nilai_spk: row.nilai_spk,
                    nilai_opname: row.nilai_opname,
                    hari_denda: hariDenda,
                    nilai_denda: nilaiDenda,
                    tanggal_akhir_spk_denda: tanggalAkhirSpkDenda,
                    tanggal_serah_terima_denda: tanggalSerahTerimaDenda,
                    nomor_spk: row.nomor_spk,
                };
            })
        );

        return enriched;
    },

    async correctDate(input: {
        nomor_ulok: string;
        cabang?: string | null;
        tanggal_serah_terima: string;
        catatan?: string | null;
        actor?: AuthenticatedUser | null;
    }) {
        // Koreksi tanggal diizinkan untuk Super Human dan Store & Branch Controlling Specialist
        const actorRoles = input.actor?.roles ?? [];
        const canCorrect = actorRoles.some((role) => {
            const r = String(role).trim().toUpperCase();
            return r.includes("SUPER HUMAN")
                || r.includes("STORE & BRANCH CONTROLLING");
        });
        if (!canCorrect) {
            throw new AppError("Anda tidak memiliki akses untuk mengubah tanggal serah terima.", 403);
        }

        await serahTerimaRepository.ensureDateCorrectionAuditSchema();

        const targets = await serahTerimaRepository.findDateCorrectionTargets({
            nomor_ulok: input.nomor_ulok,
            cabang: input.cabang ?? null,
        });

        if (targets.length === 0) {
            throw new AppError("Berkas Serah Terima pada scope tersebut tidak ditemukan.", 404);
        }

        const updatedRows = await serahTerimaRepository.updateBerkasSerahTerimaDate({
            ids: targets.map((target) => target.id),
            tanggal: input.tanggal_serah_terima,
        });

        await serahTerimaRepository.insertDateCorrectionAudit({
            targets,
            updatedRows,
            actorEmail: input.actor?.email_sat ?? null,
            actorRole: input.actor?.jabatan ?? input.actor?.roles.join(", ") ?? null,
            catatan: input.catatan ?? null,
        });

        const uniqueTokoIds = Array.from(new Set(updatedRows.map((row) => row.id_toko)));
        let refreshedDendaCount = 0;
        for (const idToko of uniqueTokoIds) {
            const refreshResult = await opnameFinalService.refreshDendaByTokoId(idToko);
            refreshedDendaCount += Number(refreshResult.updated_count ?? 0);
        }

        const refreshCorrectedDendaScope = () =>
            Promise.allSettled(uniqueTokoIds.map((idToko) => opnameFinalService.refreshDendaByTokoId(idToko)));

        setImmediate(() => {
            setTimeout(() => {
                refreshCorrectedDendaScope().catch((error) => {
                    console.error("[ST][DATE_CORRECTION] Refresh denda tertunda gagal", {
                        nomorUlok: input.nomor_ulok,
                        cabang: input.cabang ?? null,
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
            }, 10_000);

            const hasUnifiedScopes = updatedRows.length > 1;
            const regenerateJob = hasUnifiedScopes
                ? serahTerimaService.createPdfSerahTerimaUnified(input.nomor_ulok, {
                    createdAt: updatedRows[0]?.created_at ?? input.tanggal_serah_terima,
                })
                : Promise.allSettled(updatedRows.map((row) => serahTerimaService.regeneratePdfByBerkasId(row.id)));

            Promise.resolve(regenerateJob)
                .then((results) => {
                    const settledResults = Array.isArray(results) ? results : [];
                    const failed = settledResults.filter((result) => result.status === "rejected");
                    if (failed.length > 0) {
                        console.error(`[ST][DATE_CORRECTION] ${failed.length} PDF gagal diregenerasi`, {
                            nomorUlok: input.nomor_ulok,
                            cabang: input.cabang ?? null,
                        });
                    }
                    return refreshCorrectedDendaScope();
                })
                .catch((error) => {
                    console.error("[ST][DATE_CORRECTION] Regenerate PDF background gagal", {
                        nomorUlok: input.nomor_ulok,
                        cabang: input.cabang ?? null,
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
        });

        const refreshed = await serahTerimaService.list({ nomor_ulok: input.nomor_ulok });

        return {
            nomor_ulok: input.nomor_ulok,
            cabang: input.cabang ?? null,
            tanggal_serah_terima: input.tanggal_serah_terima,
            affected_count: updatedRows.length,
            refreshed_denda_count: refreshedDendaCount,
            pdf_refresh_queued_count: updatedRows.length,
            items: refreshed.filter((item) => {
                if (!input.cabang) return true;
                return String(item.toko.cabang ?? "").trim().toUpperCase() === String(input.cabang).trim().toUpperCase();
            }),
        };
    },

    async listDateCorrectionHistory(input: {
        nomor_ulok: string;
        cabang?: string | null;
        actor?: AuthenticatedUser | null;
    }) {
        const actorRoles = input.actor?.roles ?? [];
        const canView = actorRoles.some((role) => {
            const r = String(role).trim().toUpperCase();
            return r.includes("SUPER HUMAN")
                || r.includes("STORE & BRANCH CONTROLLING");
        });
        if (!canView) {
            throw new AppError("Anda tidak memiliki akses untuk melihat riwayat koreksi tanggal serah terima.", 403);
        }

        return serahTerimaRepository.listDateCorrectionAudit({
            nomor_ulok: input.nomor_ulok,
            cabang: input.cabang ?? null,
        });
    },


    async createPdfSerahTerima(idToko: number, referenceTimestamp?: string) {
        const readiness = await getSerahTerimaReadiness(idToko);
        if (!readiness.ready) {
            throw new AppError(readiness.reason ?? "Serah Terima belum siap dibuat", 409);
        }

        // Validate the required opname data before writing a serah-terima placeholder.
        // Previously, a failed generation could leave a row with link_pdf = NULL.
        await assertSerahTerimaReady(idToko);
        await buildDetailByTokoId(idToko);

        const placeholder = referenceTimestamp
            ? await serahTerimaRepository.ensureBerkasSerahTerimaWithTimestamp(idToko, referenceTimestamp)
            : await serahTerimaRepository.ensureBerkasSerahTerima(idToko);

        // 1. Refresh denda dengan timestamp resmi ST yang ditentukan server.
        await opnameFinalService.refreshDendaByTokoId(idToko);

        const { toko, opnameFinal, items } = await buildDetailByTokoId(idToko);
        const detail = { toko, opname_final: opnameFinal, items };
        const pdfBuffer = await buildSerahTerimaPdfBuffer(detail, placeholder.created_at);

        // 2. Upload ke Google Drive
        const proyek = sanitizeFilenamePart(toko.proyek ?? undefined, "PROYEK");
        const nomorUlok = sanitizeFilenamePart(toko.nomor_ulok ?? undefined, "ULOK");
        const filename = `SERAH_TERIMA_${proyek}_${nomorUlok}_${opnameFinal.id}.pdf`;

        const linkPdf = await uploadPdfToDrive(pdfBuffer, filename, toko.nomor_ulok, toko.proyek);

        // 3. Simpan link di tabel berkas_serah_terima
        const berkas = await serahTerimaRepository.updateBerkasSerahTerimaLink(placeholder.id, linkPdf);

        // 4. Regenerate Opname Final PDF di background.
        //    Proses ini berat karena memuat ulang seluruh foto dan merender PDF kedua.
        //    Berkas Serah Terima sudah aman tersimpan, jadi response client tidak perlu
        //    menunggu proses tambahan ini dan berisiko diputus oleh timeout proxy Render.
        setImmediate(() => {
            opnameFinalService
                .refreshDendaAndPdfById(String(opnameFinal.id))
                .then(() => {
                    console.log(`[ST][OPNAME_PDF_BACKGROUND] Berhasil regenerate opname final id=${opnameFinal.id}`);
                })
                .catch((err) => {
                    console.error("[ST][OPNAME_PDF_BACKGROUND] Gagal regenerate opname final", {
                        opnameFinalId: opnameFinal.id,
                        idToko,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
        });

        // 5. Auto-cascade: generate ST untuk toko saudara (nomor_ulok sama, lingkup berbeda)
        //    yang seluruh pengawasannya terisi, sudah punya Opname Final, dan belum punya berkas.
        //    Jalankan di background — tidak memblok response ke client.
        if (toko.nomor_ulok) {
            serahTerimaRepository
                .findSiblingTokosReadyForST(toko.nomor_ulok, idToko)
                .then(async (siblings) => {
                    for (const sibling of siblings) {
                        try {
                            await serahTerimaService.createPdfSerahTerima(sibling.id);
                            console.log(
                                `[ST Cascade] Berhasil generate ST untuk toko id=${sibling.id}` +
                                ` (${sibling.lingkup_pekerjaan ?? "?"}) dari ULOK ${toko.nomor_ulok}`
                            );
                        } catch (err: any) {
                            // Jangan sampai error sibling menggagalkan response utama
                            console.error(
                                `[ST Cascade] Gagal generate ST untuk toko id=${sibling.id}` +
                                ` (${sibling.lingkup_pekerjaan ?? "?"}): ${err?.message ?? err}`
                            );
                        }
                    }
                    await scheduleAutomaticUnifiedSerahTerimaIfReady(toko.nomor_ulok);
                })
                .catch((err) => {
                    console.error(`[ST Cascade] Gagal query sibling tokos: ${err?.message ?? err}`);
                });
            scheduleAutomaticUnifiedSerahTerimaIfReady(toko.nomor_ulok).catch((err) => {
                console.error(`[ST][AUTO_UNIFIED] Gagal schedule ULOK ${toko.nomor_ulok}: ${err?.message ?? err}`);
            });
        }

        return {
            id: berkas.id,
            id_toko: idToko,
            link_pdf: linkPdf,
            opname_final_id: opnameFinal.id,
            link_pdf_opname: opnameFinal.link_pdf_opname,
            item_count: items.length,
            created_at: berkas.created_at,
            toko,
        };
    },

    async createPdfSerahTerimaUnified(nomorUlok: string, options?: { createdAt?: string | null, takeoverSequence?: number }) {
        const scopes = await serahTerimaRepository.findTokoScopesByNomorUlok(nomorUlok, options?.takeoverSequence);
        if (scopes.length === 0) {
            throw new AppError("ULOK tidak ditemukan", 404);
        }

        const activeScopes = scopes.filter((scope) =>
            ["SIPIL", "ME"].includes(String(scope.lingkup_pekerjaan || "").trim().toUpperCase())
        );
        const targetScopes = activeScopes.length > 0 ? activeScopes : scopes;
        const masterScope = targetScopes.find((scope) =>
            String(scope.lingkup_pekerjaan || "").trim().toUpperCase() === "SIPIL"
        ) ?? targetScopes[0];

        for (const scope of targetScopes) {
            await assertSerahTerimaReadyForUnified(scope.id);
        }

        const placeholder = await serahTerimaRepository.ensureBerkasSerahTerima(masterScope.id);
        const existingScopeBerkas = await Promise.all(
            targetScopes.map((scope) => serahTerimaRepository.findBerkasSerahTerimaByIdToko(scope.id))
        );
        const existingCreatedAt = existingScopeBerkas
            .map((row) => dateOnlyKey(row?.created_at) ? row?.created_at : null)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
        const effectiveCreatedAt = options?.createdAt ?? existingCreatedAt ?? placeholder.created_at;
        const pdfBuffers: Buffer[] = [];
        const details: Array<{
            id_toko: number;
            lingkup_pekerjaan: string | null;
            opname_final_id: number;
            item_count: number;
            kode_toko?: string | null;
            nama_kontraktor?: string | null;
            nilai_opname?: string | number | null;
            nilai_toko: number;
        }> = [];

        for (const [index, scope] of targetScopes.entries()) {
            const readiness = await getSerahTerimaReadiness(scope.id);

            if (readiness.ready) {
                await opnameFinalService.refreshDendaByTokoId(scope.id);
                const { toko, opnameFinal, items } = await buildDetailByTokoId(scope.id);
                const buffer = await buildSerahTerimaPdfBuffer(
                    { toko, opname_final: opnameFinal, items },
                    effectiveCreatedAt,
                    { unifiedPartIndex: index + 1, unifiedPartTotal: targetScopes.length }
                );

                pdfBuffers.push(buffer);
                details.push({
                    id_toko: scope.id,
                    lingkup_pekerjaan: scope.lingkup_pekerjaan,
                    opname_final_id: opnameFinal.id,
                    item_count: items.length,
                    kode_toko: toko.kode_toko,
                    nama_kontraktor: toko.nama_kontraktor,
                    nilai_opname: opnameFinal.grand_total_opname,
                    nilai_toko: calculateSerahTerimaAssessmentScore(items).nilaiToko,
                });
            } else {
                // Fallback to V1
                const bst = await serahTerimaRepository.findBerkasSerahTerimaByIdToko(scope.id);
                if (!bst?.link_pdf) {
                    throw new AppError(`Toko (Scope: ${scope.lingkup_pekerjaan}) gagal di-generate dan tidak memiliki PDF V1: ${readiness.reason}`, 409);
                }
                const buffer = await downloadStoredPdfBuffer(bst.link_pdf);
                if (!buffer) {
                    throw new AppError(`Gagal mengunduh dokumen V1 untuk scope ${scope.lingkup_pekerjaan}`, 500);
                }
                pdfBuffers.push(buffer);
                
                const toko = await serahTerimaRepository.findTokoById(scope.id);
                details.push({
                    id_toko: scope.id,
                    lingkup_pekerjaan: scope.lingkup_pekerjaan,
                    opname_final_id: 0,
                    item_count: 0,
                    kode_toko: toko?.kode_toko,
                    nama_kontraktor: toko?.nama_kontraktor,
                    nilai_opname: 0,
                    nilai_toko: 0,
                });
            }
        }

        if (pdfBuffers.length === 0) {
            throw new AppError("Tidak ada scope yang siap dibuat Serah Terima", 409);
        }

        const coverBuffer = await buildSerahTerimaUnifiedCoverPdfBuffer({
            nomor_ulok: nomorUlok,
            nama_toko: masterScope.nama_toko,
            cabang: masterScope.cabang,
            proyek: masterScope.proyek,
            created_at: effectiveCreatedAt,
            scopes: details,
        });
        const assessmentBuffer = await buildSerahTerimaUnifiedAssessmentPdfBuffer({
            nomor_ulok: nomorUlok,
            nama_toko: masterScope.nama_toko,
            created_at: effectiveCreatedAt,
            scopes: details.map((detail) => ({
                lingkup_pekerjaan: detail.lingkup_pekerjaan,
                nilai_toko: detail.nilai_toko,
            })),
        });

        const mergedBuffer = await mergePdfBuffers([coverBuffer, ...pdfBuffers, assessmentBuffer]);

        const proyek = sanitizeFilenamePart(masterScope.proyek ?? undefined, "PROYEK");
        const safeNomorUlok = sanitizeFilenamePart(nomorUlok, "ULOK");
        const filename = `SERAH_TERIMA_UNIFIED_${proyek}_${safeNomorUlok}.pdf`;
        const linkPdf = await uploadPdfToDrive(mergedBuffer, filename, nomorUlok, masterScope.proyek);
        const berkasRows = await Promise.all(
            targetScopes.map(async (scope) => {
                const row = scope.id === masterScope.id
                    ? placeholder
                    : await serahTerimaRepository.ensureBerkasSerahTerima(scope.id);

                return serahTerimaRepository.updateBerkasSerahTerimaLinkAndDate({
                    id: row.id,
                    linkPdf,
                    createdAt: effectiveCreatedAt,
                });
            })
        );
        const berkas = berkasRows.find((row) => row.id_toko === masterScope.id) ?? berkasRows[0];

        setImmediate(() => {
            Promise.allSettled(
                details.map((detail) => opnameFinalService.refreshDendaAndPdfById(String(detail.opname_final_id)))
            ).then((results) => {
                const rejected = results.filter((result) => result.status === "rejected").length;
                if (rejected > 0) {
                    console.error(`[ST][UNIFIED][OPNAME_PDF_BACKGROUND] ${rejected} regenerate opname final gagal`, {
                        nomorUlok,
                    });
                }
            });
        });

        return {
            id: berkas.id,
            id_toko: masterScope.id,
            nomor_ulok: nomorUlok,
            link_pdf: linkPdf,
            scopes: details,
            item_count: details.reduce((sum, detail) => sum + detail.item_count, 0),
            created_at: berkas.created_at,
            toko: masterScope,
        };
    },

    async createPdfSerahTerimaForMigration(idToko: number) {
        const { toko, opnameFinal, items } = await buildDetailByTokoId(idToko);
        if (items.length === 0) {
            throw new AppError("Data opname_item kosong untuk toko ini", 409);
        }

        const placeholder = await serahTerimaRepository.ensureBerkasSerahTerima(idToko);

        await opnameFinalService.refreshDendaByTokoId(idToko);

        const detail = { toko, opname_final: opnameFinal, items };
        const pdfBuffer = await buildSerahTerimaPdfBuffer(detail, placeholder.created_at);

        const proyek = sanitizeFilenamePart(toko.proyek ?? undefined, "PROYEK");
        const nomorUlok = sanitizeFilenamePart(toko.nomor_ulok ?? undefined, "ULOK");
        const filename = `SERAH_TERIMA_MIGRASI_${proyek}_${nomorUlok}_${opnameFinal.id}.pdf`;

        const linkPdf = await uploadPdfToDrive(pdfBuffer, filename);
        const berkas = await serahTerimaRepository.updateBerkasSerahTerimaLink(placeholder.id, linkPdf);

        await opnameFinalService.refreshDendaAndPdfById(String(opnameFinal.id));

        return {
            id: berkas.id,
            id_toko: idToko,
            link_pdf: linkPdf,
            opname_final_id: opnameFinal.id,
            link_pdf_opname: opnameFinal.link_pdf_opname,
            item_count: items.length,
            created_at: berkas.created_at,
            toko,
        };
    },

    async downloadPdfByBerkasId(id: number) {
        const berkas = await serahTerimaRepository.findBerkasSerahTerimaById(id);
        if (!berkas) {
            throw new AppError("Berkas serah terima tidak ditemukan", 404);
        }

        const toko = await serahTerimaRepository.findTokoById(berkas.id_toko);
        if (!toko) {
            throw new AppError("Data toko tidak ditemukan", 404);
        }

        const proyek = sanitizeFilenamePart(toko.proyek ?? undefined, "PROYEK");
        const nomorUlok = sanitizeFilenamePart(toko.nomor_ulok ?? undefined, "ULOK");
        const opnameFinal = await serahTerimaRepository.findOpnameFinalByIdToko(berkas.id_toko);

        if (toko.nomor_ulok) {
            const scopes = await serahTerimaRepository.findTokoScopesByNomorUlok(toko.nomor_ulok);
            const activeScopes = scopes.filter((scope) =>
                ["SIPIL", "ME"].includes(String(scope.lingkup_pekerjaan || "").trim().toUpperCase())
            );
            const hasSipil = activeScopes.some((scope) => String(scope.lingkup_pekerjaan || "").trim().toUpperCase() === "SIPIL");
            const hasMe = activeScopes.some((scope) => String(scope.lingkup_pekerjaan || "").trim().toUpperCase() === "ME");

            if (hasSipil && hasMe) {
                const activeBerkasRows = await Promise.all(
                    activeScopes.map((scope) => serahTerimaRepository.findBerkasSerahTerimaByIdToko(scope.id))
                );
                const sharedLinks = new Set(
                    activeBerkasRows
                        .map((row) => row?.link_pdf ?? null)
                        .filter((link): link is string => Boolean(link))
                );

                if (
                    activeBerkasRows.length === activeScopes.length
                    && activeBerkasRows.every((row) => Boolean(row?.link_pdf))
                    && sharedLinks.size === 1
                ) {
                    const unifiedBuffer = await downloadStoredPdfBuffer(activeBerkasRows[0]?.link_pdf);
                    if (unifiedBuffer) {
                        return {
                            buffer: unifiedBuffer,
                            filename: `SERAH_TERIMA_UNIFIED_${proyek}_${nomorUlok}.pdf`,
                        };
                    }
                }

                const readiness = await Promise.all(activeScopes.map((scope) => getSerahTerimaReadiness(scope.id)));
                if (readiness.every((item) => item.ready)) {
                    const regenerated = await serahTerimaService.createPdfSerahTerimaUnified(toko.nomor_ulok);
                    const unifiedBuffer = await downloadStoredPdfBuffer(regenerated.link_pdf);
                    if (unifiedBuffer) {
                        return {
                            buffer: unifiedBuffer,
                            filename: `SERAH_TERIMA_UNIFIED_${proyek}_${nomorUlok}.pdf`,
                        };
                    }
                }
            }
        }

        if (opnameFinal) {
            const items = await serahTerimaRepository.findOpnameItemsByOpnameFinalId(opnameFinal.id);
            const buffer = await buildSerahTerimaPdfBuffer({ toko, opname_final: opnameFinal, items }, berkas.created_at);

            return {
                buffer,
                filename: `SERAH_TERIMA_${proyek}_${nomorUlok}_${opnameFinal.id}.pdf`,
            };
        }

        if (!berkas.link_pdf) {
            throw new AppError("Data opname_final tidak ditemukan dan link PDF tidak tersedia", 404);
        }

        const buffer = await downloadStoredPdfBuffer(berkas.link_pdf);

        if (!buffer || buffer.length === 0) {
            throw new AppError("Gagal mengunduh file PDF Serah Terima dari Google Drive", 500);
        }

        return {
            buffer,
            filename: `SERAH_TERIMA_${proyek}_${nomorUlok}_MIGRATED.pdf`,
        };
    },

    async regeneratePdfByBerkasId(id: number) {
        const berkas = await serahTerimaRepository.findBerkasSerahTerimaById(id);
        if (!berkas) {
            throw new AppError("Berkas serah terima tidak ditemukan", 404);
        }

        const opnameFinal = await serahTerimaRepository.findOpnameFinalByIdToko(berkas.id_toko);
        if (!opnameFinal) {
            throw new AppError("Dokumen hasil migrasi tidak dapat diregenerasi karena tidak memiliki data transaksi digital", 400);
        }

        const { toko, items } = await buildDetailByTokoId(berkas.id_toko);

        // Jika toko memiliki nomor_ulok, periksa apakah ini perlu Unified PDF (SIPIL + ME)
        if (toko.nomor_ulok) {
            const scopes = await serahTerimaRepository.findTokoScopesByNomorUlok(toko.nomor_ulok);
            const activeScopes = scopes.filter((scope) =>
                ["SIPIL", "ME"].includes(String(scope.lingkup_pekerjaan || "").trim().toUpperCase())
            );
            
            const hasSipil = activeScopes.some((scope) => String(scope.lingkup_pekerjaan || "").trim().toUpperCase() === "SIPIL");
            const hasMe = activeScopes.some((scope) => String(scope.lingkup_pekerjaan || "").trim().toUpperCase() === "ME");

            if (hasSipil && hasMe) {
                // Generate ulang versi Unified yang akan otomatis meng-update link_pdf kedua scope
                await module.exports.serahTerimaService.createPdfSerahTerimaUnified(toko.nomor_ulok);
                
                // Ambil ulang berkas yang sudah terupdate link-nya
                const updatedBerkas = await serahTerimaRepository.findBerkasSerahTerimaById(id);
                return {
                    ...updatedBerkas,
                    opname_final_id: opnameFinal.id,
                    item_count: items.length,
                };
            }
        }

        await opnameFinalService.refreshDendaByTokoId(berkas.id_toko);

        const pdfBuffer = await buildSerahTerimaPdfBuffer(
            { toko, opname_final: opnameFinal, items },
            berkas.created_at
        );
        const proyek = sanitizeFilenamePart(toko.proyek ?? undefined, "PROYEK");
        const nomorUlok = sanitizeFilenamePart(toko.nomor_ulok ?? undefined, "ULOK");
        const filename = `SERAH_TERIMA_${proyek}_${nomorUlok}_${opnameFinal.id}.pdf`;
        const linkPdf = await uploadPdfToDrive(pdfBuffer, filename);
        const updated = await serahTerimaRepository.updateBerkasSerahTerimaLink(berkas.id, linkPdf);
        await opnameFinalService.refreshDendaAndPdfById(String(opnameFinal.id));

        return {
            ...updated,
            opname_final_id: opnameFinal.id,
            item_count: items.length,
        };
    },

    async queueRegeneratePdfByBerkasId(id: number) {
        const berkas = await serahTerimaRepository.findBerkasSerahTerimaById(id);
        if (!berkas) {
            throw new AppError("Berkas serah terima tidak ditemukan", 404);
        }

        if (runningBerkasRegenerateJobs.has(id)) {
            return {
                id,
                queued: false,
                message: "Generate ulang PDF Serah Terima sudah berjalan",
            };
        }

        runningBerkasRegenerateJobs.add(id);
        setImmediate(() => {
            serahTerimaService
                .regeneratePdfByBerkasId(id)
                .then((result) => {
                    console.log(`[ST][PDF_BACKGROUND] Berhasil regenerate berkas id=${id}`, {
                        link_pdf: result?.link_pdf,
                    });
                })
                .catch((error) => {
                    console.error("[ST][PDF_BACKGROUND] Gagal regenerate berkas", {
                        id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                })
                .finally(() => {
                    runningBerkasRegenerateJobs.delete(id);
                });
        });

        return {
            id,
            queued: true,
            message: "Generate ulang PDF Serah Terima sedang diproses di background",
        };
    },
};
