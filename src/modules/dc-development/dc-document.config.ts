export interface DocumentUploadSlot {
  type: 'PDF/JPEG' | 'AUTOCAD' | 'WORD' | 'EXCEL' | 'PPT';
  label: string;
}

export interface JenisDokumen {
  key: string;
  title: string;
  slots: DocumentUploadSlot[];
}

export interface DetailDokumen {
  no: string;
  title: string;
  jenis: JenisDokumen[];
}

export interface DokumenUtama {
  id: string; // A, B, C... or SITEPLAN
  title: string;
  details: DetailDokumen[];
}

// Data from List Dok sheet
export const DC_DOCUMENT_CONFIG: DokumenUtama[] = [
  {
    id: 'SITEPLAN',
    title: 'SITEPLAN',
    details: [
      {
        no: '1',
        title: 'Tata letak lahan dan bangunan office branch',
        jenis: [
          {
            key: 'SITEPLAN_1',
            title: 'Siteplan dan Office Branch',
            slots: [
              { type: 'PDF/JPEG', label: 'Upload PDF/JPEG' },
              { type: 'AUTOCAD', label: 'Upload AUTOCAD' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'A',
    title: 'DATA LEGALITAS',
    details: [
      {
        no: 'A_DETAIL',
        title: 'Perizinan dan sertifikasi legal proyek',
        jenis: [
          { key: 'A_1', title: 'Sertifikat Tanah', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_2', title: 'IMB atau PPG', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_3', title: 'AMDAL atau UKL-UPL', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_4', title: 'SLO PLN', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_5', title: 'NIDI PLN', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_6', title: 'SLF Hydrant System', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_7', title: 'SLF Penyalur Petir', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'A_8', title: 'SIPA', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'B',
    title: 'SOIL INVESTIGATION & TOPOGRAFI',
    details: [
      {
        no: 'B_DETAIL',
        title: 'Hasil uji tanah dan elevasi kontur permukaan',
        jenis: [
          { key: 'B_1', title: 'Titik Sondir dan Boring', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'B_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'B_3', title: 'SPK Kontraktor', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'B_4', title: 'BAST', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'B_5', title: 'Final Report Soil Investigation', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'B_6', title: 'Final Report Topografi (Data Kontur dan Elevasi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }, { type: 'EXCEL', label: 'Upload EXCEL' }] }
        ]
      }
    ]
  },
  {
    id: 'C',
    title: 'KONSULTAN PERENCANA',
    details: [
      {
        no: 'C_DETAIL',
        title: 'Perencanaan arsitektur, struktur, dan MEP',
        jenis: [
          { key: 'C_1', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'C_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'C_3', title: 'SPK Konsultan Perencana', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'C_4', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'C_5', title: 'OE', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'C_6', title: 'Gambar Forcont (Grading, Struktur, Arsitektur, dan MEP)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'C_7', title: 'Laporan Analisa Perhitungan Struktur', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'C_8', title: 'Rekap Pembayaran Termin Progress Pekerjaan (Cost Controle)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'D',
    title: 'KONSULTAN PENGAWAS / MK',
    details: [
      {
        no: 'D_DETAIL',
        title: 'Pengawasan mutu dan progres lapangan',
        jenis: [
          { key: 'D_1', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'D_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'D_3', title: 'SPK Konsultan Pengawas / MK', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'D_4', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'D_5', title: 'Laporan Bulanan', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'D_6', title: 'Rekap Pembayaran Termin Progress Pekerjaan (Cost Controle)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'E',
    title: 'KONTRAKTOR TIANG PANCANG',
    details: [
      {
        no: 'E_DETAIL',
        title: 'Pekerjaan pondasi dan tiang pancang',
        jenis: [
          { key: 'E_1', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'E_2', title: 'SPK Kontraktor Pancang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'E_3', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'E_4', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'E_5', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'E_6', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'F',
    title: 'KONTRAKTOR GRADING (CUT AND FILL)',
    details: [
      {
        no: 'F_DETAIL',
        title: 'Pekerjaan perataan tanah dan galian',
        jenis: [
          { key: 'F_1', title: 'Proposal Peserta Tender', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_2', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_3', title: 'Absensi dan Notulen Aanwijzing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_4', title: 'Resume Dokumen Pelaksanaan Tender', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_5', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'F_6', title: 'SPK Kontraktor Grading', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_7', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_8', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_9', title: 'Rekap Pembayaran Termin Progress Pekerjaan (Cost Controle)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_10', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_11', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'F_12', title: 'Dokumen Kerja Tambah/Kurang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'F_13', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'G',
    title: 'KONTRAKTOR UTAMA',
    details: [
      {
        no: 'G_DETAIL',
        title: 'Pekerjaan konstruksi utama bangunan',
        jenis: [
          { key: 'G_1', title: 'Proposal Peserta Tender', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_2', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_3', title: 'Absensi dan Notulen Aanwijzing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_4', title: 'Resume Dokumen Pelaksanaan Tender', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_5', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'G_6', title: 'SPK Kontraktor Utama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_7', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_8', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_9', title: 'Rekap Pembayaran Termin Progress Pekerjaan (Cost Controle)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_10', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_11', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'G_12', title: 'Dokumen Kerja Tambah/Kurang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'G_13', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'H',
    title: 'PEKERJAAN HYDRANT',
    details: [
      {
        no: 'H_DETAIL',
        title: 'Instalasi sistem pemadam kebakaran hydrant',
        jenis: [
          { key: 'H_1', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'H_3', title: 'Gambar Shopdrawing (Approval MK/Planner)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'H_4', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_5', title: 'SPK Kontraktor Hydrant', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_6', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_7', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_8', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'H_9', title: 'Dokumen Kerja Tambah/Kurang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_10', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'H_11', title: 'Test Commisioning', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'I',
    title: 'PEKERJAAN MEZANIN',
    details: [
      {
        no: 'I_DETAIL',
        title: 'Konstruksi struktur lantai mezanin',
        jenis: [
          { key: 'I_1', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'I_3', title: 'Gambar Shopdrawing (Approval MK/Planner)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'I_4', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_5', title: 'SPK Kontraktor Mezanin', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_6', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_7', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_8', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'I_9', title: 'Dokumen Kerja Tambah/Kurang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'I_10', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'J',
    title: 'COLD STORAGE',
    details: [
      {
        no: 'J_DETAIL',
        title: 'Instalasi ruang pendingin / cold storage',
        jenis: [
          { key: 'J_1', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_2', title: 'SPK Suplier Cold Storage', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_3', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_4', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_5', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_6', title: 'Test Commisioning', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'J_7', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'L',
    title: 'PEKERJAAN KONTRAKTOR',
    details: [
      {
        no: 'L_DETAIL',
        title: 'Pekerjaan tambahan kontraktor renovasi',
        jenis: [
          { key: 'L_1', title: 'KAK & TOR', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_2', title: 'Penawaran Harga (Pemenang)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'EXCEL', label: 'Upload EXCEL' }] },
          { key: 'L_3', title: 'Gambar Shopdrawing (Approval MK/Planner)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'L_4', title: 'Dokumen Tagihan Termin/Progress', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_5', title: 'SPK Kontraktor', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_6', title: 'Kontrak PKS', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_7', title: 'BAST Pertama', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_8', title: 'As-Built Drawing', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'AUTOCAD', label: 'Upload AUTOCAD' }] },
          { key: 'L_9', title: 'Dokumen Kerja Tambah/Kurang', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_10', title: 'BAST Kedua (Retensi)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'L_11', title: 'Test Commisioning', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  },
  {
    id: 'K',
    title: 'DATA PENTING LAINNYA',
    details: [
      {
        no: 'K_DETAIL',
        title: 'Dokumentasi progres, rapat, dan arsip pendukung',
        jenis: [
          { key: 'K_1', title: 'Foto 0%', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'PPT', label: 'Upload PPT' }] },
          { key: 'K_2', title: 'Foto Progress Mingguan', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'PPT', label: 'Upload PPT' }] },
          { key: 'K_3', title: 'Foto 100%', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }, { type: 'PPT', label: 'Upload PPT' }] },
          { key: 'K_4', title: 'Risalah Rapat Mingguan', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] },
          { key: 'K_5', title: 'Keterangan Kerja Tambah Kurang / Instruksi Lapangan (Jika Ada)', slots: [{ type: 'PDF/JPEG', label: 'Upload PDF/JPEG' }] }
        ]
      }
    ]
  }
];

export const DC_DOCUMENT_LEGENDS = [
  { abbrev: 'IMB', meaning: 'Izin Mendirikan Bangunan' },
  { abbrev: 'AMDAL', meaning: 'Analisis Mengenai Dampak Lingkungan' },
  { abbrev: 'UKL - UPL', meaning: 'Upaya Pengelolaan Lingkungan Hidup dan Upaya Pemantauan Lingkungan Hidup' },
  { abbrev: 'PPG', meaning: 'Persetujuan Bangunan Gedung' },
  { abbrev: 'NIDI', meaning: 'Nomor Identitas Instalasi Tenaga Listrik' },
  { abbrev: 'SLF', meaning: 'Sertifikat Layak Fungsi' },
  { abbrev: 'SLO', meaning: 'Sertifikat Layak Operasional' },
  { abbrev: 'SIPA', meaning: 'Surat Izin Pengusahaan Air Tanah' },
  { abbrev: 'SPK', meaning: 'Surat Perintah Kerja' },
  { abbrev: 'BAST', meaning: 'Berita Acara Serah Terima' },
  { abbrev: 'KAK', meaning: 'Kerangka Acuan Kerja' },
  { abbrev: 'TOR', meaning: 'Term of Reference' },
  { abbrev: 'PKS', meaning: 'Perjanjian Kerja Sama' },
  { abbrev: 'OE', meaning: 'Owner Estimate' },
  { abbrev: 'RAB', meaning: 'Rencanan Anggaran Biaya' },
  { abbrev: 'MK', meaning: 'Manajemen Konstruksi' }
];

export const RENOVASI_ALLOWED_UTAMA = [
  'DATA PENTING LAINNYA',
  'COLD STORAGE',
  'PEKERJAAN MEZANIN',
  'PEKERJAAN HYDRANT',
  'PEKERJAAN KONTRAKTOR'
];

export const PEMBANGUNAN_EXCLUDED_UTAMA = [
  'COLD STORAGE',
  'PEKERJAAN MEZANIN',
  'PEKERJAAN HYDRANT',
  'PEKERJAAN KONTRAKTOR'
];

export const getDcDocumentConfigForStage = (tipe: "Renovasi" | "Pembangunan" | "Perluasan" | string): DokumenUtama[] => {
  const normalizedTipe = String(tipe).toUpperCase();
  if (normalizedTipe === "RENOVASI") {
    return DC_DOCUMENT_CONFIG.filter(utama => RENOVASI_ALLOWED_UTAMA.includes(utama.title));
  }
  if (normalizedTipe === "PEMBANGUNAN") {
    return DC_DOCUMENT_CONFIG.filter(utama => !PEMBANGUNAN_EXCLUDED_UTAMA.includes(utama.title));
  }
  return DC_DOCUMENT_CONFIG;
};
