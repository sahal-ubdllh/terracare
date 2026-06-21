// types/index.ts — TERRACARE_APP Type Definitions

export interface SensorData {
  nilaiADC: number;
  persentaseKesuburan: number;
  timestamp: string;
}

export interface PendingRecord {
  id: string;
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
  nilai_adc: number;
  persentase_kesuburan: number;
  waktu_pengecekan: string;
  createdLocal: string;
}

export interface RiwayatPengecekan {
  id?: string;
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
  nilai_adc: number;
  persentase_kesuburan: number;
  waktu_pengecekan: string;
  synced_at?: string;
}

export type StatusKesuburan = 'Subur' | 'Sedang' | 'Kurang Subur' | 'Tidak Diketahui';

export interface ConnectionStatus {
  esp32Connected: boolean;
  internetConnected: boolean;
  isInternetReachable: boolean;
  lastEsp32Check: string | null;
}

export interface FormData {
  namaDesa: string;
  namaLahan: string;
  komoditas: string;
}