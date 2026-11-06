import { AppError } from "../../common/app-error";
import { picPengawasanRepository } from "./pic-pengawasan.repository";
import type { CreatePicPengawasanInput, ListPicPengawasanQueryInput } from "./pic-pengawasan.schema";

type PgError = {
    code?: string;
    constraint?: string;
};

const toPgError = (error: unknown): PgError => {
    if (typeof error === "object" && error !== null) {
        return error as PgError;
    }

    return {};
};

export const picPengawasanService = {
    async create(input: CreatePicPengawasanInput) {
        try {
            return await picPengawasanRepository.create(input);
        } catch (error: unknown) {
            const pgError = toPgError(error);

            if (pgError.code === "23505") {
                if (pgError.constraint === "pic_pengawasan_id_rab_key") {
                    try {
                        return await picPengawasanRepository.createWithLegacyRabRepair(input);
                    } catch (repairError: unknown) {
                        const repairMessage = repairError instanceof Error ? repairError.message : "";
                        if (repairMessage === "PIC_REFERENCE_SCOPE_MISMATCH") {
                            throw new AppError("Relasi toko, RAB, dan SPK tidak berada pada lingkup yang sama.", 409);
                        }
                        if (
                            repairMessage === "PIC_LEGACY_RAB_CONFLICT_NOT_REPAIRABLE" ||
                            repairMessage === "PIC_LEGACY_REPLACEMENT_RAB_NOT_FOUND"
                        ) {
                            throw new AppError(
                                "RAB sudah dipakai oleh data PIC lama dan tidak dapat diperbaiki otomatis.",
                                409
                            );
                        }
                        throw repairError;
                    }
                }
                throw new AppError("Relasi 1:1 sudah terpakai. Pastikan nomor_ulok, id_rab, dan id_spk belum pernah dipakai.", 409);
            }

            if (pgError.code === "23503") {
                if (pgError.constraint === "fk_pic_pengawasan_toko_id") {
                    throw new AppError("id_toko tidak ditemukan di tabel toko", 404);
                }

                if (pgError.constraint === "fk_pic_pengawasan_toko_ulok") {
                    throw new AppError("nomor_ulok tidak ditemukan di tabel toko", 404);
                }

                if (pgError.constraint === "fk_pic_pengawasan_rab") {
                    throw new AppError("id_rab tidak ditemukan di tabel rab", 404);
                }

                if (pgError.constraint === "fk_pic_pengawasan_spk") {
                    throw new AppError("id_spk tidak ditemukan di tabel pengajuan_spk", 404);
                }

                throw new AppError("Relasi data tidak valid", 400);
            }

            throw error;
        }
    },

    async getById(id: string) {
        const data = await picPengawasanRepository.findById(id);
        if (!data) {
            throw new AppError("Data pic_pengawasan tidak ditemukan", 404);
        }

        return data;
    },

    async list(query: ListPicPengawasanQueryInput) {
        return picPengawasanRepository.findAll(query);
    }
};
