// hooks/useConnectivity.ts — TERRACARE_APP Connectivity Hook
// Mendeteksi: (1) koneksi ke ESP32 lokal, (2) koneksi internet seluler

import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, {
  NetInfoState,
  NetInfoSubscription,
} from '@react-native-community/netinfo';
import { ESP32_CONFIG } from '../constants/theme';

export interface ConnectivityState {
  // Status koneksi internet (seluler/Wi-Fi dengan internet)
  isInternetConnected: boolean;
  isInternetReachable: boolean;
  // Status koneksi ke alat ESP32 lokal
  isEsp32Connected: boolean;
  // Loading state
  isCheckingEsp32: boolean;
  // Waktu terakhir berhasil dapat data dari ESP32
  lastEsp32Success: Date | null;
  // Refresh manual
  recheckEsp32: () => void;
}

/**
 * Custom hook untuk memantau:
 * 1. Status internet via @react-native-community/netinfo
 * 2. Status koneksi ESP32 via HTTP fetch ke endpoint /data
 */
export function useConnectivity(): ConnectivityState {
  const [isInternetConnected, setIsInternetConnected] = useState<boolean>(false);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean>(false);
  const [isEsp32Connected, setIsEsp32Connected] = useState<boolean>(false);
  const [isCheckingEsp32, setIsCheckingEsp32] = useState<boolean>(false);
  const [lastEsp32Success, setLastEsp32Success] = useState<Date | null>(null);

  // Ref untuk track apakah component masih mounted
  const mountedRef = useRef<boolean>(true);

  // ── 1. Monitor koneksi internet via NetInfo ──
  useEffect(() => {
    // Cek kondisi awal
    NetInfo.fetch().then((state: NetInfoState) => {
      if (!mountedRef.current) return;
      setIsInternetConnected(state.isConnected ?? false);
      setIsInternetReachable(state.isInternetReachable ?? false);
    });

    // Subscribe perubahan
    const unsubscribe: NetInfoSubscription = NetInfo.addEventListener(
      (state: NetInfoState) => {
        if (!mountedRef.current) return;
        setIsInternetConnected(state.isConnected ?? false);
        setIsInternetReachable(state.isInternetReachable ?? false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // ── 2. Cek koneksi ESP32 via HTTP ──
  const checkEsp32 = useCallback(async () => {
    if (isCheckingEsp32) return;
    setIsCheckingEsp32(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        ESP32_CONFIG.FETCH_TIMEOUT_MS
      );

      const response = await fetch(
        `${ESP32_CONFIG.BASE_URL}${ESP32_CONFIG.DATA_ENDPOINT}`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'text/plain' },
        }
      );

      clearTimeout(timeoutId);

      if (mountedRef.current) {
        const isOk = response.ok;
        setIsEsp32Connected(isOk);
        if (isOk) setLastEsp32Success(new Date());
      }
    } catch (_err) {
      if (mountedRef.current) {
        setIsEsp32Connected(false);
      }
    } finally {
      if (mountedRef.current) {
        setIsCheckingEsp32(false);
      }
    }
  }, [isCheckingEsp32]);

  // Cek ESP32 setiap 3 detik (terpisah dari polling data 1 detik)
  useEffect(() => {
    checkEsp32();
    const interval = setInterval(checkEsp32, 3000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    isInternetConnected,
    isInternetReachable,
    isEsp32Connected,
    isCheckingEsp32,
    lastEsp32Success,
    recheckEsp32: checkEsp32,
  };
}