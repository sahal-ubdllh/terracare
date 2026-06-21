// lib/supabaseClient.ts — TERRACARE_APP Supabase Configuration
// Pastikan sudah install: npx expo install @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// PENTING: Isi dengan URL dan KEY dari dashboard Supabase Anda
// Dashboard → Project Settings → API
// ============================================================
const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://hstbxunguzeqcwqfigtf.supabase.co';

const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzdGJ4dW5ndXplcWN3cWZpZ3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcwNjQsImV4cCI6MjA5NzQyMzA2NH0.2p1sbJ-l8nwVaZJTQLIS1E1ZRaOBVoochHtszLu7F6U';

// Validasi konfigurasi saat startup
// if (
//   SUPABASE_URL.includes('hstbxunguzeqcwqfigtf') ||
//   SUPABASE_ANON_KEY.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzdGJ4dW5ndXplcWN3cWZpZ3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcwNjQsImV4cCI6MjA5NzQyMzA2NH0.2p1sbJ-l8nwVaZJTQLIS1E1ZRaOBVoochHtszLu7F6U')
// ) {
//   console.warn(
//     '[TERRACARE] ⚠️  Supabase belum dikonfigurasi!\n' +
//     'Isi EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_ANON_KEY di file .env'
//   );
// }

// Buat Supabase client dengan AsyncStorage sebagai storage adapter
// Ini penting agar session auth (jika digunakan) bisa persisten di React Native
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-App-Name': 'TERRACARE_APP',
      'X-App-Version': '1.0.0',
    },
  },
  // Nonaktifkan realtime untuk hemat baterai di lapangan
  realtime: {
    params: {
      eventsPerSecond: -1,
    },
  },
});

// ============================================================
// Helper: Upload satu record pengecekan ke Supabase
// ============================================================
export async function uploadPengecekan(record: {
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
  nilai_adc: number;
  persentase_kesuburan: number;
  waktu_pengecekan: string;
}): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const { data, error } = await supabase
      .from('riwayat_pengecekan')
      .insert([record])
      .select()
      .single();

    if (error) {
      console.error('[TERRACARE] Supabase insert error:', error.message);
      return { success: false, error: error.message };
    }

    console.log('[TERRACARE] ✅ Upload berhasil, ID:', data?.id);
    return { success: true, data };
  } catch (err: any) {
    console.error('[TERRACARE] Network error ke Supabase:', err.message);
    return { success: false, error: err.message ?? 'Unknown error' };
  }
}

// ============================================================
// Helper: Upload batch record sekaligus (bulk insert)
// ============================================================
export async function uploadBatchPengecekan(records: Array<{
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
  nilai_adc: number;
  persentase_kesuburan: number;
  waktu_pengecekan: string;
}>): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (records.length === 0) {
      return { success: true, count: 0 };
    }

    const { data, error } = await supabase
      .from('riwayat_pengecekan')
      .insert(records)
      .select();

    if (error) {
      console.error('[TERRACARE] Batch upload error:', error.message);
      return { success: false, count: 0, error: error.message };
    }

    const uploadedCount = data?.length ?? 0;
    console.log(`[TERRACARE] ✅ Batch upload berhasil: ${uploadedCount} record`);
    return { success: true, count: uploadedCount };
  } catch (err: any) {
    console.error('[TERRACARE] Network error batch upload:', err.message);
    return { success: false, count: 0, error: err.message ?? 'Unknown error' };
  }
}

// ============================================================
// Helper: Test koneksi ke Supabase (ping)
// ============================================================
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('riwayat_pengecekan')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

export default supabase;