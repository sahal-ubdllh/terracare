// components/SensorCard.tsx — TERRACARE_APP
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../constants/theme';
import { SensorData, StatusKesuburan } from '../types';

interface SensorCardProps {
  sensorData: SensorData | null;
  isConnected: boolean;
  isPolling: boolean;
}

function getStatusKesuburan(persen: number): StatusKesuburan {
  if (persen >= 70) return 'Subur';
  if (persen >= 40) return 'Sedang';
  if (persen >= 0) return 'Kurang Subur';
  return 'Tidak Diketahui';
}

function getStatusColor(status: StatusKesuburan): string {
  switch (status) {
    case 'Subur': return COLORS.success;
    case 'Sedang': return COLORS.warning;
    case 'Kurang Subur': return COLORS.danger;
    default: return COLORS.textMuted;
  }
}

function getStatusBgColor(status: StatusKesuburan): string {
  switch (status) {
    case 'Subur': return COLORS.successLight;
    case 'Sedang': return COLORS.warningLight;
    case 'Kurang Subur': return COLORS.dangerLight;
    default: return '#F5F5F5';
  }
}

export function SensorCard({ sensorData, isConnected, isPolling }: SensorCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation saat polling aktif
  useEffect(() => {
    if (isPolling && isConnected) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isPolling, isConnected]);

  // Fade in saat data pertama kali masuk
  useEffect(() => {
    if (sensorData) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [sensorData !== null]);

  const status: StatusKesuburan = sensorData
    ? getStatusKesuburan(sensorData.persentaseKesuburan)
    : 'Tidak Diketahui';

  const statusColor = getStatusColor(status);
  const statusBg = getStatusBgColor(status);
  const persen = sensorData?.persentaseKesuburan ?? 0;
  const progressWidth = `${Math.max(0, Math.min(100, persen))}%` as any;

  return (
    <View style={[styles.card, SHADOW.md]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.cardIcon}>🌱</Text>
          <View>
            <Text style={styles.cardTitle}>Data Sensor Lahan</Text>
            <Text style={styles.cardSubtitle}>
              {isConnected ? 'Pembaruan setiap 1 detik' : 'Menunggu koneksi alat...'}
            </Text>
          </View>
        </View>
        {isConnected && isPolling && (
          <Animated.View style={[styles.liveBadge, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </Animated.View>
        )}
      </View>

      {/* Sensor Readings */}
      {sensorData ? (
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Main Metric: Kesuburan */}
          <View style={[styles.mainMetric, { backgroundColor: statusBg }]}>
            <View style={styles.metricRow}>
              <View style={styles.metricLeft}>
                <Text style={styles.metricLabel}>Tingkat Kesuburan</Text>
                <Text style={[styles.metricValue, { color: statusColor }]}>
                  {persen}
                  <Text style={styles.metricUnit}>%</Text>
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                <Text style={styles.statusBadgeText}>{status}</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: progressWidth, backgroundColor: statusColor },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>0%</Text>
              <Text style={[styles.progressLabel, { color: COLORS.warning }]}>40%</Text>
              <Text style={[styles.progressLabel, { color: COLORS.success }]}>70%</Text>
              <Text style={styles.progressLabel}>100%</Text>
            </View>
          </View>

          {/* Secondary: ADC Raw */}
          <View style={styles.secondaryRow}>
            <View style={styles.secondaryMetric}>
              <Text style={styles.secondaryLabel}>📊 ADC Raw</Text>
              <Text style={styles.secondaryValue}>{sensorData.nilaiADC}</Text>
              <Text style={styles.secondaryUnit}>dari 4095</Text>
            </View>
            <View style={styles.dividerV} />
            <View style={styles.secondaryMetric}>
              <Text style={styles.secondaryLabel}>🕐 Diperbarui</Text>
              <Text style={styles.secondaryValue}>
                {new Date(sensorData.timestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Text>
              <Text style={styles.secondaryUnit}>
                {new Date(sensorData.timestamp).toLocaleDateString('id-ID')}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>
            {isConnected ? 'Mengambil data...' : 'Alat belum terhubung'}
          </Text>
          <Text style={styles.emptyDesc}>
            {isConnected
              ? 'Data sensor sedang dimuat dari ESP32'
              : `Sambungkan HP ke Wi-Fi "${'\u201c'}Alat_SmartFarming"\u201d`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  cardIcon: { fontSize: 24 },
  cardTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.successLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.success,
  },
  liveText: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    color: COLORS.success,
    letterSpacing: 0.8,
  },
  mainMetric: {
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.md,
  },
  metricLeft: {},
  metricLabel: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.medium,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 52,
    fontWeight: FONT.weight.extrabold,
    lineHeight: 56,
  },
  metricUnit: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  statusBadgeText: {
    color: '#fff',
    fontWeight: FONT.weight.bold,
    fontSize: FONT.size.md,
  },
  progressTrack: {
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.medium,
  },
  secondaryRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    backgroundColor: COLORS.cardBgAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  secondaryMetric: {
    flex: 1,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  secondaryValue: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  secondaryUnit: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  dividerV: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  emptyDesc: {
    fontSize: FONT.size.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});