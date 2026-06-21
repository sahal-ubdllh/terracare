// App.tsx — TERRACARE_APP v4.0
// Fix: CSV export robust + Tab Navigation (Beranda | Riwayat)

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { uploadBatchPengecekan } from "./lib/supabaseClient";
import { SensorCard } from "./components/SensorCard";
import { DataQueueCard } from "./components/DataQueueCard";
import { StatusBadge } from "./components/StatusBadge";
import {
  COLORS,
  GRADIENTS,
  FONT,
  RADIUS,
  SHADOW,
  SPACING,
  ESP32_CONFIG,
  STORAGE_KEYS,
} from "./constants/theme";
import { SensorData, PendingRecord, FormData } from "./types";
import supabase from "./lib/supabaseClient";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiwayatRecord {
  id: string;
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
  nilai_adc: number;
  persentase_kesuburan: number;
  status_lahan: string;
  waktu_pengecekan: string;
  created_at: string;
}

interface EditForm {
  nama_desa: string;
  nama_lahan: string;
  komoditas: string;
}

type TabKey = "beranda" | "riwayat";

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseEsp32Response(raw: string): SensorData | null {
  const parts = raw.trim().split(",");
  if (parts.length < 2) return null;
  const adc = parseInt(parts[0]?.trim() ?? "", 10);
  const persen = parseInt(parts[1]?.trim() ?? "", 10);
  if (isNaN(adc) || isNaN(persen)) return null;
  return {
    nilaiADC: adc,
    persentaseKesuburan: Math.max(0, Math.min(100, persen)),
    timestamp: new Date().toISOString(),
  };
}

function getStatusColor(status: string): string {
  if (status === "Subur") return COLORS.success;
  if (status === "Sedang") return COLORS.warning;
  return COLORS.danger;
}

function getStatusBg(status: string): string {
  if (status === "Subur") return COLORS.successLight;
  if (status === "Sedang") return COLORS.warningLight;
  return COLORS.dangerLight;
}

function escapeCSV(val: any): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function recordsToCSV(records: RiwayatRecord[]): string {
  const headers = [
    "No",
    "Nama Desa",
    "Nama Lahan",
    "Komoditas",
    "Nilai ADC",
    "Kesuburan (%)",
    "Status Lahan",
    "Waktu Pengecekan",
    "Dibuat",
  ];
  const rows = records.map((r, i) =>
    [
      i + 1,
      r.nama_desa,
      r.nama_lahan,
      r.komoditas,
      r.nilai_adc,
      r.persentase_kesuburan,
      r.status_lahan,
      new Date(r.waktu_pengecekan).toLocaleString("id-ID"),
      new Date(r.created_at).toLocaleString("id-ID"),
    ]
      .map(escapeCSV)
      .join(","),
  );
  // BOM UTF-8 agar Excel terbaca dengan benar
  return "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
}

// Dapatkan direktori yang pasti tersedia di Expo Go
async function getWritableDir(): Promise<string> {
  // Ganti dari "expo-file-system" menjadi "expo-file-system/legacy"
  const FileSystem = require("expo-file-system/legacy");

  if (FileSystem.documentDirectory) return FileSystem.documentDirectory;
  if (FileSystem.cacheDirectory) return FileSystem.cacheDirectory;

  if (Platform.OS === "android") {
    return "file:///data/user/0/host.exp.exponent/files/";
  }

  throw new Error(
    "Tidak ada direktori penyimpanan yang tersedia di perangkat ini.",
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function App() {
  // ── Tab Navigation ──
  const [activeTab, setActiveTab] = useState<TabKey>("beranda");
  const tabAnim = useRef(new Animated.Value(0)).current;

  const switchTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      Animated.spring(tabAnim, {
        toValue: tab === "beranda" ? 0 : 1,
        useNativeDriver: true,
        tension: 120,
        friction: 10,
      }).start();
    },
    [tabAnim],
  );

  // ── Sensor ──
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [isEsp32Connected, setIsEsp32Connected] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  // ── Internet ──
  const [isInternetConnected, setIsInternetConnected] = useState(false);
  const [isInternetReachable, setIsInternetReachable] = useState(false);
  // ── Form ──
  const [form, setForm] = useState<FormData>({
    namaDesa: "",
    namaLahan: "",
    komoditas: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({});
  const [isSaving, setIsSaving] = useState(false);
  // ── Queue ──
  const [pendingQueue, setPendingQueue] = useState<PendingRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);
  const [totalSynced, setTotalSynced] = useState(0);
  // ── Riwayat ──
  const [riwayat, setRiwayat] = useState<RiwayatRecord[]>([]);
  const [isLoadingRiwayat, setIsLoadingRiwayat] = useState(false);
  const [filterDesa, setFilterDesa] = useState("");
  const [filterLahan, setFilterLahan] = useState("");
  const [filterKomoditas, setFilterKomoditas] = useState("");
  const [isRefreshingRiwayat, setIsRefreshingRiwayat] = useState(false);
  // ── Modals ──
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterDesaInput, setFilterDesaInput] = useState("");
  const [filterLahanInput, setFilterLahanInput] = useState("");
  const [filterKomoditasInput, setFilterKomoditasInput] = useState("");
  const [editTarget, setEditTarget] = useState<RiwayatRecord | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    nama_desa: "",
    nama_lahan: "",
    komoditas: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [csvMode, setCsvMode] = useState<"all" | "selected">("all");
  // ── Refresh Beranda ──
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const syncLockRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const headerScaleAnim = useRef(new Animated.Value(0.95)).current;
  const saveSuccessAnim = useRef(new Animated.Value(0)).current;

  // ── Queue ──
  const loadQueue = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_QUEUE);
      if (raw && mountedRef.current) setPendingQueue(JSON.parse(raw));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const saveQueue = useCallback(async (q: PendingRecord[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(q));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Riwayat ──
  const loadRiwayat = useCallback(
    async (showLoader = true) => {
      if (showLoader && mountedRef.current) setIsLoadingRiwayat(true);
      try {
        let q = supabase
          .from("riwayat_pengecekan")
          .select("*")
          .order("waktu_pengecekan", { ascending: false })
          .limit(100);
        if (filterDesa.trim())
          q = q.ilike("nama_desa", `%${filterDesa.trim()}%`);
        if (filterLahan.trim())
          q = q.ilike("nama_lahan", `%${filterLahan.trim()}%`);
        if (filterKomoditas.trim())
          q = q.ilike("komoditas", `%${filterKomoditas.trim()}%`);
        const { data, error } = await q;
        if (!error && data && mountedRef.current)
          setRiwayat(data as RiwayatRecord[]);
      } catch (e) {
        console.error(e);
      } finally {
        if (mountedRef.current) setIsLoadingRiwayat(false);
      }
    },
    [filterDesa, filterLahan, filterKomoditas],
  );

  // ── ESP32 Polling ──
  const fetchFromEsp32 = useCallback(async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(
        () => controller.abort(),
        ESP32_CONFIG.FETCH_TIMEOUT_MS,
      );
      const res = await fetch(
        `${ESP32_CONFIG.BASE_URL}${ESP32_CONFIG.DATA_ENDPOINT}`,
        {
          method: "GET",
          signal: controller.signal,
          headers: { "Cache-Control": "no-cache" },
        },
      );
      clearTimeout(tid);
      if (!res.ok) throw new Error();
      const text = await res.text();
      const data = parseEsp32Response(text);
      if (mountedRef.current && data) {
        setSensorData(data);
        setIsEsp32Connected(true);
        setIsPolling(true);
      }
    } catch {
      if (mountedRef.current) {
        setIsEsp32Connected(false);
        setIsPolling(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchFromEsp32();
    pollingIntervalRef.current = setInterval(
      fetchFromEsp32,
      ESP32_CONFIG.POLL_INTERVAL_MS,
    );
    return () => {
      mountedRef.current = false;
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [fetchFromEsp32]);

  // ── NetInfo ──
  useEffect(() => {
    NetInfo.fetch().then((s: NetInfoState) => {
      if (!mountedRef.current) return;
      setIsInternetConnected(s.isConnected ?? false);
      setIsInternetReachable(s.isInternetReachable ?? false);
    });
    const unsub = NetInfo.addEventListener((s: NetInfoState) => {
      if (!mountedRef.current) return;
      setIsInternetConnected(s.isConnected ?? false);
      setIsInternetReachable(s.isInternetReachable ?? false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isInternetConnected && isInternetReachable && pendingQueue.length > 0)
      handleSync();
  }, [isInternetConnected, isInternetReachable]);

  useEffect(() => {
    loadQueue();
    Animated.spring(headerScaleAnim, {
      toValue: 1,
      tension: 80,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (isInternetConnected && isInternetReachable) loadRiwayat();
  }, [
    isInternetConnected,
    isInternetReachable,
    filterDesa,
    filterLahan,
    filterKomoditas,
  ]);

  // ── Pull-to-Refresh Beranda ──
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setSensorData(null);
    setIsEsp32Connected(false);
    await loadQueue();
    fetchFromEsp32();
    setIsRefreshing(false);
  }, [loadQueue, fetchFromEsp32]);

  // ── Pull-to-Refresh Riwayat ──
  const handleRefreshRiwayat = useCallback(async () => {
    setIsRefreshingRiwayat(true);
    await loadRiwayat(false);
    setIsRefreshingRiwayat(false);
  }, [loadRiwayat]);

  // ── Form Validate ──
  const validateForm = useCallback((): boolean => {
    const e: Partial<FormData> = {};
    if (!form.namaDesa.trim()) e.namaDesa = "Wajib diisi";
    if (!form.namaLahan.trim()) e.namaLahan = "Wajib diisi";
    if (!form.komoditas.trim()) e.komoditas = "Wajib diisi";
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!validateForm()) return;
    if (!sensorData) {
      Alert.alert(
        "📡 Data Sensor Tidak Tersedia",
        'Sambungkan ke Wi-Fi "Alat_SmartFarming" terlebih dahulu.',
        [{ text: "OK" }],
      );
      return;
    }
    setIsSaving(true);
    const record: PendingRecord = {
      id: generateId(),
      nama_desa: form.namaDesa.trim(),
      nama_lahan: form.namaLahan.trim(),
      komoditas: form.komoditas.trim(),
      nilai_adc: sensorData.nilaiADC,
      persentase_kesuburan: sensorData.persentaseKesuburan,
      waktu_pengecekan: new Date().toISOString(),
      createdLocal: new Date().toISOString(),
    };
    const updated = [...pendingQueue, record];
    try {
      await saveQueue(updated);
      if (mountedRef.current) {
        setPendingQueue(updated);
        setForm({ namaDesa: "", namaLahan: "", komoditas: "" });
        setFormErrors({});
        Animated.sequence([
          Animated.timing(saveSuccessAnim, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(2000),
          Animated.timing(saveSuccessAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
        if (isInternetConnected && isInternetReachable)
          setTimeout(() => handleSync(), 500);
      }
    } catch {
      Alert.alert("Gagal Menyimpan", "Terjadi kesalahan.");
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }, [
    form,
    sensorData,
    pendingQueue,
    saveQueue,
    isInternetConnected,
    isInternetReachable,
    validateForm,
  ]);

  // ── Sync ──
  const handleSync = useCallback(async () => {
    if (syncLockRef.current || isSyncing || pendingQueue.length === 0) return;
    if (!isInternetConnected || !isInternetReachable) {
      Alert.alert("🌐 Tidak Ada Internet", "Data aman tersimpan lokal.", [
        { text: "OK" },
      ]);
      return;
    }
    syncLockRef.current = true;
    if (mountedRef.current) setIsSyncing(true);
    try {
      const records = pendingQueue.map((item) => ({
        nama_desa: item.nama_desa,
        nama_lahan: item.nama_lahan,
        komoditas: item.komoditas,
        nilai_adc: item.nilai_adc,
        persentase_kesuburan: item.persentase_kesuburan,
        waktu_pengecekan: item.waktu_pengecekan,
      }));
      const result = await uploadBatchPengecekan(records);
      if (mountedRef.current) {
        if (result.success) {
          await saveQueue([]);
          setPendingQueue([]);
          setTotalSynced((p) => p + result.count);
          setLastSyncResult({ success: result.count, failed: 0 });
          setTimeout(() => loadRiwayat(false), 800);
        } else {
          setLastSyncResult({ success: 0, failed: pendingQueue.length });
          Alert.alert(
            "Sinkronisasi Gagal",
            `${result.error ?? "Error"}\n\nData tetap aman.`,
            [
              { text: "Coba Lagi", onPress: () => handleSync() },
              { text: "Nanti" },
            ],
          );
        }
      }
    } catch {
      if (mountedRef.current)
        setLastSyncResult({ success: 0, failed: pendingQueue.length });
    } finally {
      syncLockRef.current = false;
      if (mountedRef.current) setIsSyncing(false);
    }
  }, [
    pendingQueue,
    isSyncing,
    isInternetConnected,
    isInternetReachable,
    saveQueue,
    loadRiwayat,
  ]);

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      "🗑️ Hapus Antrean",
      `Hapus ${pendingQueue.length} data yang belum tersinkronisasi?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            await saveQueue([]);
            if (mountedRef.current) setPendingQueue([]);
          },
        },
      ],
    );
  }, [pendingQueue.length, saveQueue]);

  // ── Delete ──
  const handleDelete = useCallback((item: RiwayatRecord) => {
    Alert.alert(
      "🗑️ Hapus Data",
      `Hapus pengecekan:\n"${item.nama_lahan} — ${item.nama_desa}"?\n\nTidak bisa dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("riwayat_pengecekan")
                .delete()
                .eq("id", item.id);
              if (error) throw new Error(error.message);
              if (mountedRef.current) {
                setRiwayat((prev) => prev.filter((r) => r.id !== item.id));
                setSelectedIds((prev) => {
                  const s = new Set(prev);
                  s.delete(item.id);
                  return s;
                });
              }
            } catch (e: any) {
              Alert.alert("Gagal Menghapus", e.message ?? "Terjadi kesalahan.");
            }
          },
        },
      ],
    );
  }, []);

  // ── Edit ──
  const openEdit = useCallback((item: RiwayatRecord) => {
    setEditTarget(item);
    setEditForm({
      nama_desa: item.nama_desa,
      nama_lahan: item.nama_lahan,
      komoditas: item.komoditas,
    });
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!editTarget) return;
    if (
      !editForm.nama_desa.trim() ||
      !editForm.nama_lahan.trim() ||
      !editForm.komoditas.trim()
    ) {
      Alert.alert("Form Tidak Lengkap", "Semua field wajib diisi.");
      return;
    }
    setIsUpdating(true);
    try {
      const { data, error } = await supabase
        .from("riwayat_pengecekan")
        .update({
          nama_desa: editForm.nama_desa.trim(),
          nama_lahan: editForm.nama_lahan.trim(),
          komoditas: editForm.komoditas.trim(),
        })
        .eq("id", editTarget.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (mountedRef.current && data) {
        setRiwayat((prev) =>
          prev.map((r) => (r.id === editTarget.id ? { ...r, ...data } : r)),
        );
        setEditTarget(null);
      }
    } catch (e: any) {
      Alert.alert("Gagal Update", e.message ?? "Terjadi kesalahan.");
    } finally {
      if (mountedRef.current) setIsUpdating(false);
    }
  }, [editTarget, editForm]);

  // ── CSV Export — FIXED ──
  const openCsvModal = useCallback(() => {
    setSelectedIds(new Set());
    setCsvMode("all");
    setShowCsvModal(true);
  }, []);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === riwayat.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(riwayat.map((r) => r.id)));
  }, [selectedIds.size, riwayat]);

  const handleExportCSV = useCallback(async () => {
    // Ganti dari "expo-file-system" menjadi "expo-file-system/legacy"
    const FileSystem = require("expo-file-system/legacy");
    const Sharing = require("expo-sharing");

    const toExport =
      csvMode === "all"
        ? riwayat
        : riwayat.filter((r) => selectedIds.has(r.id));
    if (toExport.length === 0) {
      Alert.alert("Tidak Ada Data", "Pilih data yang ingin diekspor.");
      return;
    }
    setIsExporting(true);
    try {
      // ── Step 1: Dapatkan direktori yang tersedia ──
      let baseDir: string;
      try {
        baseDir = await getWritableDir();
      } catch (dirErr: any) {
        throw new Error(`Direktori tidak tersedia: ${dirErr.message}`);
      }

      // ── Step 2: Buat nama file ──
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const filename = `TERRACARE_${stamp}.csv`;
      const fileUri = `${baseDir}${filename}`;

      // ── Step 3: Tulis file (encoding UTF8) ──
      const csvContent = recordsToCSV(toExport);

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: "utf8", // Menggunakan string langsung, bukan FileSystem.EncodingType.UTF8
      });

      // ── Step 4: Verifikasi file benar-benar ada ──
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists)
        throw new Error("File berhasil ditulis tapi tidak ditemukan kembali.");

      // ── Step 5: Share / buka dialog simpan ──
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: `Export ${toExport.length} data pengecekan — TERRACARE`,
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "✅ File Tersimpan",
          `CSV berhasil dibuat:\n${fileUri}\n\nGunakan file manager untuk membukanya.`,
        );
      }
      setShowCsvModal(false);
    } catch (e: any) {
      console.error("[TERRACARE CSV]", e);
      Alert.alert(
        "❌ Gagal Export CSV",
        e.message ?? "Terjadi kesalahan tidak diketahui.",
        [{ text: "OK" }],
      );
    } finally {
      if (mountedRef.current) setIsExporting(false);
    }
  }, [csvMode, riwayat, selectedIds]);

  // ── Filter ──
  const applyFilter = useCallback(() => {
    setFilterDesa(filterDesaInput);
    setFilterLahan(filterLahanInput);
    setFilterKomoditas(filterKomoditasInput);
    setShowFilterModal(false);
  }, [filterDesaInput, filterLahanInput, filterKomoditasInput]);

  const resetFilter = useCallback(() => {
    setFilterDesaInput("");
    setFilterLahanInput("");
    setFilterKomoditasInput("");
    setFilterDesa("");
    setFilterLahan("");
    setFilterKomoditas("");
    setShowFilterModal(false);
  }, []);

  const activeFilterCount = useMemo(
    () => [filterDesa, filterLahan, filterKomoditas].filter(Boolean).length,
    [filterDesa, filterLahan, filterKomoditas],
  );

  const internetAvailable = useMemo(
    () => isInternetConnected && isInternetReachable,
    [isInternetConnected, isInternetReachable],
  );

  // ─── SHARED HEADER ────────────────────────────────────────────────────────
  const renderHeader = () => (
    <LinearGradient
      colors={GRADIENTS.header as [string, string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <Animated.View
        style={[styles.headerTop, { transform: [{ scale: headerScaleAnim }] }]}
      >
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🌾</Text>
        </View>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerAppName}>TERRACARE</Text>
          <Text style={styles.headerTagline}>
            Sistem Pemantauan Lahan Pertanian
          </Text>
        </View>
        <TouchableOpacity
          style={styles.reloadBtn}
          onPress={handleRefresh}
          disabled={isRefreshing}
          activeOpacity={0.7}
        >
          {isRefreshing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.reloadIcon}>↻</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.headerDivider} />

      <View style={styles.statusRow}>
        <StatusBadge
          label="Alat ESP32"
          isActive={isEsp32Connected}
          activeLabel="AKTIF"
          inactiveLabel="OFFLINE"
        />
        <StatusBadge
          label="Supabase Cloud"
          isActive={internetAvailable}
          activeLabel="ONLINE"
          inactiveLabel="OFFLINE"
        />
        {pendingQueue.length > 0 && (
          <View style={styles.queueBubble}>
            <Text style={styles.queueBubbleText}>{pendingQueue.length}</Text>
            <Text style={styles.queueBubbleLabel}>pending</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalSynced}</Text>
          <Text style={styles.statLabel}>Tersinkron</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pendingQueue.length}</Text>
          <Text style={styles.statLabel}>Antrean</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {sensorData ? `${sensorData.persentaseKesuburan}%` : "—"}
          </Text>
          <Text style={styles.statLabel}>Kesuburan</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{riwayat.length}</Text>
          <Text style={styles.statLabel}>Riwayat</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "beranda" && styles.tabBtnActive,
          ]}
          onPress={() => switchTab("beranda")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabIcon,
              activeTab === "beranda" && styles.tabIconActive,
            ]}
          >
            🏠
          </Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === "beranda" && styles.tabLabelActive,
            ]}
          >
            Beranda
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "riwayat" && styles.tabBtnActive,
          ]}
          onPress={() => {
            switchTab("riwayat");
            if (internetAvailable) loadRiwayat();
          }}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabIcon,
              activeTab === "riwayat" && styles.tabIconActive,
            ]}
          >
            📜
          </Text>
          <Text
            style={[
              styles.tabLabel,
              activeTab === "riwayat" && styles.tabLabelActive,
            ]}
          >
            Riwayat{riwayat.length > 0 ? ` (${riwayat.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );

  // ─── TAB BERANDA ──────────────────────────────────────────────────────────
  const renderBeranda = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          colors={[COLORS.primaryLight, COLORS.accent]}
          tintColor={COLORS.primaryLight}
          title="Memperbarui..."
          titleColor={COLORS.textSecondary}
        />
      }
    >
      {/* Toast */}
      <Animated.View
        style={[
          styles.saveToast,
          {
            opacity: saveSuccessAnim,
            transform: [
              {
                translateY: saveSuccessAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.saveToastIcon}>✅</Text>
        <Text style={styles.saveToastText}>
          Data tersimpan!{internetAvailable ? " Sedang upload..." : ""}
        </Text>
      </Animated.View>

      {/* Sensor Card */}
      <SensorCard
        sensorData={sensorData}
        isConnected={isEsp32Connected}
        isPolling={isPolling}
      />

      {/* Form Pencatatan */}
      <View style={[styles.formCard, SHADOW.md]}>
        <LinearGradient
          colors={["#E8F5E9", "#F1F8E9"]}
          style={styles.formHeader}
        >
          <Text style={styles.formHeaderIcon}>📋</Text>
          <View>
            <Text style={styles.formHeaderTitle}>Form Pencatatan Lahan</Text>
            <Text style={styles.formHeaderSubtitle}>
              Data Petugas BPP — isi sebelum menyimpan
            </Text>
          </View>
        </LinearGradient>
        <View style={styles.formBody}>
          {/* Desa */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              🏘️ Nama Desa / Wilayah<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={[styles.input, formErrors.namaDesa && styles.inputError]}
              placeholder="Contoh: Desa Sumberejo, Kec. Taman"
              placeholderTextColor={COLORS.textMuted}
              value={form.namaDesa}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, namaDesa: v }));
                if (formErrors.namaDesa)
                  setFormErrors((e) => ({ ...e, namaDesa: undefined }));
              }}
              returnKeyType="next"
              autoCapitalize="words"
            />
            {formErrors.namaDesa ? (
              <Text style={styles.errorText}>⚠ {formErrors.namaDesa}</Text>
            ) : null}
          </View>
          {/* Lahan */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              🌾 Nama Lahan / Blok<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={[styles.input, formErrors.namaLahan && styles.inputError]}
              placeholder="Contoh: Sawah Blok A, Kebun Utara"
              placeholderTextColor={COLORS.textMuted}
              value={form.namaLahan}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, namaLahan: v }));
                if (formErrors.namaLahan)
                  setFormErrors((e) => ({ ...e, namaLahan: undefined }));
              }}
              returnKeyType="next"
              autoCapitalize="words"
            />
            {formErrors.namaLahan ? (
              <Text style={styles.errorText}>⚠ {formErrors.namaLahan}</Text>
            ) : null}
          </View>
          {/* Komoditas */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              🌱 Komoditas / Tanaman<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={[styles.input, formErrors.komoditas && styles.inputError]}
              placeholder="Contoh: Padi, Jagung, Kedelai, Cabai"
              placeholderTextColor={COLORS.textMuted}
              value={form.komoditas}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, komoditas: v }));
                if (formErrors.komoditas)
                  setFormErrors((e) => ({ ...e, komoditas: undefined }));
              }}
              returnKeyType="done"
              autoCapitalize="words"
              onSubmitEditing={handleSave}
            />
            {formErrors.komoditas ? (
              <Text style={styles.errorText}>⚠ {formErrors.komoditas}</Text>
            ) : null}
          </View>
          {/* Preview */}
          {sensorData && (
            <View style={styles.dataPreview}>
              <Text style={styles.dataPreviewTitle}>
                📊 Data yang akan disimpan:
              </Text>
              <View style={styles.dataPreviewRow}>
                <Text style={styles.dataPreviewKey}>ADC Raw</Text>
                <Text style={styles.dataPreviewVal}>{sensorData.nilaiADC}</Text>
              </View>
              <View style={styles.dataPreviewRow}>
                <Text style={styles.dataPreviewKey}>Kesuburan</Text>
                <Text
                  style={[styles.dataPreviewVal, styles.dataPreviewHighlight]}
                >
                  {sensorData.persentaseKesuburan}%
                </Text>
              </View>
              <View style={styles.dataPreviewRow}>
                <Text style={styles.dataPreviewKey}>Waktu</Text>
                <Text style={styles.dataPreviewVal}>
                  {new Date().toLocaleString("id-ID")}
                </Text>
              </View>
            </View>
          )}
          {/* Tombol Simpan */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (isSaving || !sensorData) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving || !sensorData}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={
                isSaving || !sensorData
                  ? ["#B0BEC5", "#90A4AE"]
                  : [COLORS.primaryLight, COLORS.primary]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveButtonGradient}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonIcon}>💾</Text>
              )}
              <Text style={styles.saveButtonText}>
                {isSaving ? "Menyimpan..." : "Simpan ke Antrean"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          {!sensorData && (
            <View style={styles.hintBox}>
              <Text style={styles.hintIcon}>💡</Text>
              <Text style={styles.hintText}>
                Sambungkan HP ke Wi-Fi{" "}
                <Text style={styles.hintBold}>"Alat_SmartFarming"</Text> untuk
                mengaktifkan tombol simpan.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Queue Card */}
      <DataQueueCard
        pendingQueue={pendingQueue}
        isSyncing={isSyncing}
        lastSyncResult={lastSyncResult}
        isInternetAvailable={internetAvailable}
        onManualSync={handleSync}
        onClearQueue={handleClearQueue}
      />

      {/* Panduan */}
      <View style={[styles.guideCard, SHADOW.sm]}>
        <Text style={styles.guideTitle}>📖 Panduan Penggunaan</Text>
        <View style={styles.guideSteps}>
          {[
            {
              step: "1",
              icon: "📡",
              title: "Sambungkan ke Alat",
              desc: 'Wi-Fi → "Alat_SmartFarming" (pw: 12345678)',
            },
            {
              step: "2",
              icon: "🌱",
              title: "Baca Data Sensor",
              desc: "ADC & Kesuburan diperbarui tiap 1 detik",
            },
            {
              step: "3",
              icon: "📋",
              title: "Isi Form & Simpan",
              desc: "Isi nama desa, lahan, komoditas → Simpan",
            },
            {
              step: "4",
              icon: "☁️",
              title: "Upload Otomatis",
              desc: "Kembali bersinyal → data tersinkron ke Supabase",
            },
          ].map((g, idx) => (
            <View key={idx} style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>{g.step}</Text>
              </View>
              <View style={styles.guideStepContent}>
                <Text style={styles.guideStepTitle}>
                  {g.icon} {g.title}
                </Text>
                <Text style={styles.guideStepDesc}>{g.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          TERRACARE_APP v4.0 · BPP Digital · {new Date().getFullYear()}
        </Text>
      </View>
    </ScrollView>
  );

  // ─── TAB RIWAYAT ─────────────────────────────────────────────────────────
  const renderRiwayat = () => (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingRiwayat}
          onRefresh={handleRefreshRiwayat}
          colors={[COLORS.primaryLight, COLORS.accent]}
          tintColor={COLORS.primaryLight}
          title="Memuat riwayat..."
          titleColor={COLORS.textSecondary}
        />
      }
    >
      {/* Toolbar Riwayat */}
      <View style={styles.riwayatToolbar}>
        <View>
          <Text style={styles.riwayatToolbarTitle}>Riwayat Pengecekan</Text>
          <Text style={styles.riwayatToolbarSub}>
            {riwayat.length} data
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} filter aktif`
              : ""}
          </Text>
        </View>
        <View style={styles.riwayatToolbarActions}>
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => loadRiwayat()}
            disabled={isLoadingRiwayat}
            activeOpacity={0.7}
          >
            {isLoadingRiwayat ? (
              <ActivityIndicator color={COLORS.primaryLight} size="small" />
            ) : (
              <Text style={styles.iconActionText}>↻</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.csvBtn,
              (!internetAvailable || riwayat.length === 0) &&
                styles.csvBtnDisabled,
            ]}
            onPress={openCsvModal}
            disabled={!internetAvailable || riwayat.length === 0}
            activeOpacity={0.7}
          >
            <Text style={styles.csvBtnText}>📥 CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterBtn,
              activeFilterCount > 0 && styles.filterBtnActive,
            ]}
            onPress={() => {
              setFilterDesaInput(filterDesa);
              setFilterLahanInput(filterLahan);
              setFilterKomoditasInput(filterKomoditas);
              setShowFilterModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterBtnText,
                activeFilterCount > 0 && styles.filterBtnTextActive,
              ]}
            >
              ⚙ Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tags */}
      {activeFilterCount > 0 && (
        <View style={styles.filterTagsRow}>
          {filterDesa ? (
            <View style={styles.filterTag}>
              <Text style={styles.filterTagText}>📍 {filterDesa}</Text>
            </View>
          ) : null}
          {filterLahan ? (
            <View style={styles.filterTag}>
              <Text style={styles.filterTagText}>🌾 {filterLahan}</Text>
            </View>
          ) : null}
          {filterKomoditas ? (
            <View style={styles.filterTag}>
              <Text style={styles.filterTagText}>🌱 {filterKomoditas}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={resetFilter} style={styles.filterClearTag}>
            <Text style={styles.filterClearTagText}>✕ Reset Filter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Konten Riwayat */}
      {!internetAvailable ? (
        <View style={[styles.riwayatEmpty, SHADOW.sm]}>
          <Text style={styles.riwayatEmptyIcon}>🌐</Text>
          <Text style={styles.riwayatEmptyTitle}>Butuh koneksi internet</Text>
          <Text style={styles.riwayatEmptyDesc}>
            Riwayat diambil dari Supabase Cloud. Sambungkan ke internet untuk
            melihat data.
          </Text>
        </View>
      ) : isLoadingRiwayat ? (
        <View style={styles.riwayatEmpty}>
          <ActivityIndicator color={COLORS.primaryLight} size="large" />
          <Text style={[styles.riwayatEmptyDesc, { marginTop: SPACING.md }]}>
            Memuat riwayat dari Supabase...
          </Text>
        </View>
      ) : riwayat.length === 0 ? (
        <View style={[styles.riwayatEmpty, SHADOW.sm]}>
          <Text style={styles.riwayatEmptyIcon}>📭</Text>
          <Text style={styles.riwayatEmptyTitle}>
            {activeFilterCount > 0
              ? "Tidak ada hasil filter"
              : "Belum ada riwayat"}
          </Text>
          <Text style={styles.riwayatEmptyDesc}>
            {activeFilterCount > 0
              ? "Coba ubah atau hapus filter."
              : "Data muncul setelah sync ke Supabase Cloud."}
          </Text>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.resetFilterBtn}
              onPress={resetFilter}
              activeOpacity={0.8}
            >
              <Text style={styles.resetFilterBtnText}>Hapus Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.riwayatListContainer}>
          {riwayat.map((item, idx) => {
            const sc = getStatusColor(item.status_lahan ?? "");
            const sb = getStatusBg(item.status_lahan ?? "");
            const waktu = new Date(item.waktu_pengecekan);
            return (
              <View key={item.id} style={[styles.riwayatCard, SHADOW.sm]}>
                {/* Top: info + nilai */}
                <View style={styles.riwayatCardTop}>
                  <View
                    style={[styles.riwayatStatusBar, { backgroundColor: sc }]}
                  />
                  <View style={styles.riwayatCardInfo}>
                    <Text style={styles.riwayatLahan} numberOfLines={1}>
                      {item.nama_lahan}
                    </Text>
                    <Text style={styles.riwayatDesa} numberOfLines={1}>
                      📍 {item.nama_desa}
                    </Text>
                    <Text style={styles.riwayatKomoditas}>
                      🌱 {item.komoditas} ·{" "}
                      {waktu.toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      ·{" "}
                      {waktu.toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={styles.riwayatCardRight}>
                    <Text style={[styles.riwayatPersen, { color: sc }]}>
                      {item.persentase_kesuburan}%
                    </Text>
                    <View
                      style={[
                        styles.riwayatStatusBadge,
                        { backgroundColor: sb },
                      ]}
                    >
                      <Text style={[styles.riwayatStatusText, { color: sc }]}>
                        {item.status_lahan}
                      </Text>
                    </View>
                    <Text style={styles.riwayatAdcText}>
                      ADC: {item.nilai_adc}
                    </Text>
                  </View>
                </View>
                {/* Bottom: actions */}
                <View style={styles.riwayatActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => openEdit(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnIcon}>✏️</Text>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <View style={styles.actionDivider} />
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => handleDelete(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionBtnIcon}>🗑️</Text>
                    <Text
                      style={[styles.actionBtnText, { color: COLORS.danger }]}
                    >
                      Hapus
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <View style={styles.riwayatListFooter}>
            <Text style={styles.riwayatListFooterText}>
              Menampilkan {riwayat.length} data terbaru
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.flex}>
          {renderHeader()}
          {activeTab === "beranda" ? renderBeranda() : renderRiwayat()}
        </View>
      </KeyboardAvoidingView>

      {/* ══ EDIT MODAL ══ */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setEditTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>✏️ Edit Data Pengecekan</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {editTarget && (
              <View style={styles.editInfoBox}>
                <Text style={styles.editInfoLabel}>
                  Data Sensor (tidak bisa diubah)
                </Text>
                <View style={styles.editInfoRow}>
                  <Text style={styles.editInfoKey}>ADC Raw</Text>
                  <Text style={styles.editInfoVal}>{editTarget.nilai_adc}</Text>
                </View>
                <View style={styles.editInfoRow}>
                  <Text style={styles.editInfoKey}>Kesuburan</Text>
                  <Text
                    style={[
                      styles.editInfoVal,
                      { color: getStatusColor(editTarget.status_lahan) },
                    ]}
                  >
                    {editTarget.persentase_kesuburan}% ·{" "}
                    {editTarget.status_lahan}
                  </Text>
                </View>
                <View style={styles.editInfoRow}>
                  <Text style={styles.editInfoKey}>Waktu</Text>
                  <Text style={styles.editInfoVal}>
                    {new Date(editTarget.waktu_pengecekan).toLocaleString(
                      "id-ID",
                    )}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>🏘️ Nama Desa / Wilayah</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.nama_desa}
                onChangeText={(v) =>
                  setEditForm((f) => ({ ...f, nama_desa: v }))
                }
                placeholder="Nama desa..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>🌾 Nama Lahan / Blok</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.nama_lahan}
                onChangeText={(v) =>
                  setEditForm((f) => ({ ...f, nama_lahan: v }))
                }
                placeholder="Nama lahan..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>🌱 Komoditas</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.komoditas}
                onChangeText={(v) =>
                  setEditForm((f) => ({ ...f, komoditas: v }))
                }
                placeholder="Jenis tanaman..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={() => setEditTarget(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalResetText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalApplyBtn, isUpdating && { opacity: 0.6 }]}
                onPress={handleUpdate}
                disabled={isUpdating}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[COLORS.primaryLight, COLORS.primary]}
                  style={styles.modalApplyGradient}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : null}
                  <Text style={styles.modalApplyText}>
                    {isUpdating ? "Menyimpan..." : "Simpan Perubahan"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ══ CSV MODAL ══ */}
      <Modal
        visible={showCsvModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCsvModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCsvModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalSheet, styles.csvModalSheet]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>📥 Export ke CSV</Text>
              <TouchableOpacity onPress={() => setShowCsvModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Pilih data mana yang ingin diunduh
            </Text>
            <View style={styles.csvModeRow}>
              <TouchableOpacity
                style={[
                  styles.csvModeBtn,
                  csvMode === "all" && styles.csvModeBtnActive,
                ]}
                onPress={() => setCsvMode("all")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.csvModeBtnText,
                    csvMode === "all" && styles.csvModeBtnTextActive,
                  ]}
                >
                  📊 Semua ({riwayat.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.csvModeBtn,
                  csvMode === "selected" && styles.csvModeBtnActive,
                ]}
                onPress={() => setCsvMode("selected")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.csvModeBtnText,
                    csvMode === "selected" && styles.csvModeBtnTextActive,
                  ]}
                >
                  ☑️ Pilih Manual ({selectedIds.size})
                </Text>
              </TouchableOpacity>
            </View>
            {csvMode === "selected" && (
              <>
                <TouchableOpacity
                  style={styles.selectAllBtn}
                  onPress={toggleSelectAll}
                  activeOpacity={0.7}
                >
                  <Text style={styles.selectAllText}>
                    {selectedIds.size === riwayat.length
                      ? "☑ Batalkan Semua"
                      : "☐ Pilih Semua"}
                  </Text>
                </TouchableOpacity>
                <ScrollView
                  style={styles.csvList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {riwayat.map((item) => {
                    const sel = selectedIds.has(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.csvItem, sel && styles.csvItemSelected]}
                        onPress={() => toggleSelectId(item.id)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.csvCheckbox,
                            sel && styles.csvCheckboxChecked,
                          ]}
                        >
                          {sel && <Text style={styles.csvCheckMark}>✓</Text>}
                        </View>
                        <View style={styles.csvItemInfo}>
                          <Text style={styles.csvItemLahan} numberOfLines={1}>
                            {item.nama_lahan}
                          </Text>
                          <Text style={styles.csvItemMeta} numberOfLines={1}>
                            {item.nama_desa} · {item.komoditas} ·{" "}
                            {item.persentase_kesuburan}%
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.csvStatusDot,
                            {
                              backgroundColor: getStatusColor(
                                item.status_lahan,
                              ),
                            },
                          ]}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <View style={styles.csvPreviewBox}>
              <Text style={styles.csvPreviewText}>
                {csvMode === "all"
                  ? `✅ ${riwayat.length} baris data akan diekspor`
                  : selectedIds.size === 0
                    ? "⚠️ Belum ada data dipilih"
                    : `✅ ${selectedIds.size} baris data akan diekspor`}
              </Text>
              <Text style={styles.csvPreviewSub}>
                Format: CSV UTF-8 · Kolom: No, Desa, Lahan, Komoditas, ADC,
                Kesuburan, Status, Waktu
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.exportBtn,
                (isExporting ||
                  (csvMode === "selected" && selectedIds.size === 0)) &&
                  styles.exportBtnDisabled,
              ]}
              onPress={handleExportCSV}
              disabled={
                isExporting ||
                (csvMode === "selected" && selectedIds.size === 0)
              }
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isExporting ||
                  (csvMode === "selected" && selectedIds.size === 0)
                    ? ["#B0BEC5", "#90A4AE"]
                    : [COLORS.primaryLight, COLORS.primary]
                }
                style={styles.exportBtnGradient}
              >
                {isExporting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.exportBtnIcon}>📥</Text>
                )}
                <Text style={styles.exportBtnText}>
                  {isExporting
                    ? "Membuat file..."
                    : `Download CSV${csvMode === "selected" && selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ══ FILTER MODAL ══ */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>⚙ Filter Riwayat</Text>
            <Text style={styles.modalSubtitle}>
              Kosongkan untuk tampilkan semua
            </Text>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>📍 Nama Desa / Wilayah</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Cari nama desa..."
                placeholderTextColor={COLORS.textMuted}
                value={filterDesaInput}
                onChangeText={setFilterDesaInput}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>🌾 Nama Lahan / Blok</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Cari nama lahan..."
                placeholderTextColor={COLORS.textMuted}
                value={filterLahanInput}
                onChangeText={setFilterLahanInput}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>🌱 Komoditas / Tanaman</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Cari jenis tanaman..."
                placeholderTextColor={COLORS.textMuted}
                value={filterKomoditasInput}
                onChangeText={setFilterKomoditasInput}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={resetFilter}
                activeOpacity={0.8}
              >
                <Text style={styles.modalResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={applyFilter}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[COLORS.primaryLight, COLORS.primary]}
                  style={styles.modalApplyGradient}
                >
                  <Text style={styles.modalApplyText}>Terapkan Filter</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.primary },
  flex: { flex: 1 },

  // Header
  header: {
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logoEmoji: { fontSize: 26 },
  headerTitleBox: { flex: 1 },
  headerAppName: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.extrabold,
    color: "#FFF",
    letterSpacing: 3,
  },
  headerTagline: {
    fontSize: FONT.size.xs,
    color: "rgba(255,255,255,0.75)",
    marginTop: 1,
  },
  reloadBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  reloadIcon: {
    fontSize: 20,
    color: "#fff",
    fontWeight: FONT.weight.bold,
    lineHeight: 24,
  },
  headerDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: "wrap",
  },
  queueBubble: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,165,0,0.25)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,165,0,0.4)",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    minWidth: 60,
  },
  queueBubbleText: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: "#FFE082",
  },
  queueBubbleLabel: { fontSize: 10, color: "rgba(255,224,130,0.8)" },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: "#FFF",
  },
  statLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.65)",
    marginTop: 1,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginVertical: 4,
  },

  // Tab Bar
  tabBar: { flexDirection: "row", gap: SPACING.sm, paddingBottom: SPACING.md },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderColor: "rgba(255,255,255,0.5)",
  },
  tabIcon: { fontSize: 16 },
  tabIconActive: {},
  tabLabel: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: "rgba(255,255,255,0.7)",
  },
  tabLabelActive: { color: "#FFFFFF", fontWeight: FONT.weight.bold },

  // Tab content
  tabContent: { flex: 1, backgroundColor: COLORS.background },
  tabContentContainer: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },

  // Toast
  saveToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
  },
  saveToastIcon: { fontSize: 16 },
  saveToastText: {
    color: "#fff",
    fontWeight: FONT.weight.semibold,
    fontSize: FONT.size.sm,
    flex: 1,
  },

  // Form
  formCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.lg,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  formHeaderIcon: { fontSize: 24 },
  formHeaderTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  formHeaderSubtitle: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  formBody: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  required: { color: COLORS.danger },
  input: {
    borderWidth: 1.5,
    borderColor: "#C8E6C9",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.cardBgAlt,
    minHeight: 50,
  },
  inputError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  errorText: { fontSize: FONT.size.sm, color: COLORS.danger, marginTop: 4 },
  dataPreview: {
    backgroundColor: "#E8F5E9",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  dataPreviewTitle: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.primaryLight,
    marginBottom: SPACING.sm,
  },
  dataPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  dataPreviewKey: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
  dataPreviewVal: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  dataPreviewHighlight: { color: COLORS.primary, fontSize: FONT.size.md },
  saveButton: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  saveButtonIcon: { fontSize: 18 },
  saveButtonText: {
    color: "#fff",
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    letterSpacing: 0.3,
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  hintIcon: { fontSize: 14 },
  hintText: {
    fontSize: FONT.size.sm,
    color: COLORS.info,
    lineHeight: 18,
    flex: 1,
  },
  hintBold: { fontWeight: FONT.weight.bold },

  // Guide
  guideCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  guideTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  guideSteps: { gap: SPACING.md },
  guideStep: {
    flexDirection: "row",
    gap: SPACING.md,
    alignItems: "flex-start",
  },
  guideStepNum: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  guideStepNumText: {
    color: "#fff",
    fontWeight: FONT.weight.bold,
    fontSize: FONT.size.sm,
  },
  guideStepContent: { flex: 1 },
  guideStepTitle: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  guideStepDesc: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  footer: { alignItems: "center", paddingVertical: SPACING.md },
  footerText: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },

  // Riwayat Tab
  riwayatToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  riwayatToolbarTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  riwayatToolbarSub: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  riwayatToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.cardBgAlt,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  iconActionText: {
    fontSize: 20,
    color: COLORS.primaryLight,
    fontWeight: FONT.weight.bold,
  },
  csvBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.successLight,
    borderWidth: 1.5,
    borderColor: "#C8E6C9",
  },
  csvBtnDisabled: { opacity: 0.4 },
  csvBtnText: {
    fontSize: FONT.size.sm,
    color: COLORS.primary,
    fontWeight: FONT.weight.bold,
  },
  filterBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.cardBgAlt,
    borderWidth: 1.5,
    borderColor: "#C8E6C9",
  },
  filterBtnActive: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.primarySoft,
  },
  filterBtnText: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.semibold,
  },
  filterBtnTextActive: { color: COLORS.primary },
  filterTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterTag: {
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  filterTagText: {
    fontSize: FONT.size.xs,
    color: COLORS.primary,
    fontWeight: FONT.weight.semibold,
  },
  filterClearTag: {
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  filterClearTagText: {
    fontSize: FONT.size.xs,
    color: COLORS.danger,
    fontWeight: FONT.weight.semibold,
  },

  // Riwayat List
  riwayatListContainer: { gap: SPACING.md },
  riwayatCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
  },
  riwayatCardTop: { flexDirection: "row", alignItems: "stretch" },
  riwayatStatusBar: { width: 5, flexShrink: 0 },
  riwayatCardInfo: { flex: 1, padding: SPACING.lg },
  riwayatLahan: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  riwayatDesa: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  riwayatKomoditas: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  riwayatCardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    padding: SPACING.lg,
    gap: 4,
  },
  riwayatPersen: {
    fontSize: 28,
    fontWeight: FONT.weight.extrabold,
    lineHeight: 32,
  },
  riwayatStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  riwayatStatusText: { fontSize: 10, fontWeight: FONT.weight.bold },
  riwayatAdcText: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  riwayatActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: SPACING.sm,
    backgroundColor: "#FAFAFA",
  },
  actionBtnDanger: { backgroundColor: "#FFF8F8" },
  actionBtnIcon: { fontSize: 13 },
  actionBtnText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.primaryLight,
  },
  actionDivider: { width: 1, backgroundColor: "#F0F0F0" },
  riwayatListFooter: { alignItems: "center", paddingVertical: SPACING.md },
  riwayatListFooterText: { fontSize: FONT.size.xs, color: COLORS.textMuted },

  // Empty state
  riwayatEmpty: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  riwayatEmptyIcon: { fontSize: 40, marginBottom: SPACING.md },
  riwayatEmptyTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  riwayatEmptyDesc: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  resetFilterBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  resetFilterBtnText: {
    color: COLORS.danger,
    fontWeight: FONT.weight.bold,
    fontSize: FONT.size.sm,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    paddingTop: SPACING.md,
  },
  csvModalSheet: { maxHeight: "88%" },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: RADIUS.full,
    alignSelf: "center",
    marginBottom: SPACING.lg,
  },
  modalTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  modalClose: {
    fontSize: FONT.size.xl,
    color: COLORS.textMuted,
    padding: SPACING.sm,
  },
  modalSubtitle: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
  },
  modalField: { marginBottom: SPACING.lg },
  modalLabel: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: "#C8E6C9",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONT.size.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.cardBgAlt,
    minHeight: 50,
  },
  modalActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  modalResetBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: "#DDD",
    alignItems: "center",
  },
  modalResetText: {
    fontSize: FONT.size.md,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.semibold,
  },
  modalApplyBtn: { flex: 2, borderRadius: RADIUS.md, overflow: "hidden" },
  modalApplyGradient: {
    paddingVertical: SPACING.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  modalApplyText: {
    color: "#fff",
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.bold,
  },
  editInfoBox: {
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  editInfoLabel: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.semibold,
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  editInfoKey: { fontSize: FONT.size.sm, color: COLORS.textSecondary },
  editInfoVal: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  csvModeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  csvModeBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: "#DDD",
    alignItems: "center",
    backgroundColor: COLORS.cardBgAlt,
  },
  csvModeBtnActive: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.primarySoft,
  },
  csvModeBtnText: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.semibold,
    textAlign: "center",
  },
  csvModeBtnTextActive: { color: COLORS.primary },
  selectAllBtn: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
    alignItems: "flex-end",
  },
  selectAllText: {
    fontSize: FONT.size.sm,
    color: COLORS.primary,
    fontWeight: FONT.weight.semibold,
  },
  csvList: { maxHeight: 220, marginBottom: SPACING.md },
  csvItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: 4,
  },
  csvItemSelected: { backgroundColor: COLORS.successLight },
  csvCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#C8E6C9",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.cardBgAlt,
    flexShrink: 0,
  },
  csvCheckboxChecked: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  csvCheckMark: { color: "#fff", fontSize: 13, fontWeight: FONT.weight.bold },
  csvItemInfo: { flex: 1 },
  csvItemLahan: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  csvItemMeta: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  csvStatusDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    flexShrink: 0,
  },
  csvPreviewBox: {
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  csvPreviewText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  csvPreviewSub: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  exportBtn: { borderRadius: RADIUS.md, overflow: "hidden" },
  exportBtnDisabled: { opacity: 0.55 },
  exportBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  exportBtnIcon: { fontSize: 18 },
  exportBtnText: {
    color: "#fff",
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
  },
});
