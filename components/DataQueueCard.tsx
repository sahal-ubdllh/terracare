// components/DataQueueCard.tsx — TERRACARE_APP
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '../constants/theme';
import { PendingRecord } from '../types';

interface DataQueueCardProps {
  pendingQueue: PendingRecord[];
  isSyncing: boolean;
  lastSyncResult: { success: number; failed: number } | null;
  isInternetAvailable: boolean;
  onManualSync: () => void;
  onClearQueue: () => void;
}

export function DataQueueCard({
  pendingQueue,
  isSyncing,
  lastSyncResult,
  isInternetAvailable,
  onManualSync,
  onClearQueue,
}: DataQueueCardProps) {
  const hasQueue = pendingQueue.length > 0;
  const hasInternet = isInternetAvailable;

  return (
    <View style={[styles.card, SHADOW.md]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>☁️</Text>
          <View>
            <Text style={styles.headerTitle}>Antrean Sinkronisasi</Text>
            <Text style={styles.headerSubtitle}>Data tersimpan lokal</Text>
          </View>
        </View>
        <View style={[styles.countBadge, !hasQueue && styles.countBadgeEmpty]}>
          <Text style={[styles.countText, !hasQueue && styles.countTextEmpty]}>
            {pendingQueue.length}
          </Text>
        </View>
      </View>

      {/* Status Internet */}
      <View style={[styles.internetRow, hasInternet ? styles.internetOnline : styles.internetOffline]}>
        <Text style={styles.internetIcon}>{hasInternet ? '🌐' : '📵'}</Text>
        <Text style={[styles.internetText, { color: hasInternet ? COLORS.success : COLORS.warning }]}>
          {hasInternet
            ? 'Koneksi internet tersedia — siap sinkronisasi'
            : 'Tidak ada internet — data akan dikirim saat online'}
        </Text>
      </View>

      {/* Queue Items Preview */}
      {hasQueue ? (
        <View style={styles.queueList}>
          {pendingQueue.slice(0, 3).map((item, idx) => (
            <View key={item.id} style={[styles.queueItem, idx === 0 && styles.queueItemFirst]}>
              <View style={styles.queueItemLeft}>
                <Text style={styles.queueDot}>•</Text>
                <View>
                  <Text style={styles.queueItemTitle}>
                    {item.nama_lahan} — {item.nama_desa}
                  </Text>
                  <Text style={styles.queueItemMeta}>
                    {item.komoditas} · {item.persentase_kesuburan}% ·{' '}
                    {new Date(item.waktu_pengecekan).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            </View>
          ))}
          {pendingQueue.length > 3 && (
            <Text style={styles.moreItems}>
              + {pendingQueue.length - 3} data lainnya menunggu...
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.emptyQueue}>
          <Text style={styles.emptyQueueIcon}>✅</Text>
          <Text style={styles.emptyQueueText}>Semua data telah tersinkronisasi</Text>
        </View>
      )}

      {/* Last Sync Result */}
      {lastSyncResult && (
        <View style={styles.syncResult}>
          <Text style={styles.syncResultText}>
            Sinkronisasi terakhir:{' '}
            <Text style={styles.syncSuccess}>{lastSyncResult.success} berhasil</Text>
            {lastSyncResult.failed > 0 && (
              <Text style={styles.syncFailed}> · {lastSyncResult.failed} gagal</Text>
            )}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.syncBtn,
            (!hasQueue || !hasInternet || isSyncing) && styles.syncBtnDisabled,
          ]}
          onPress={onManualSync}
          disabled={!hasQueue || !hasInternet || isSyncing}
          activeOpacity={0.75}
        >
          {isSyncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.syncBtnIcon}>⬆</Text>
          )}
          <Text style={styles.syncBtnText}>
            {isSyncing ? 'Mengirim...' : 'Sync Sekarang'}
          </Text>
        </TouchableOpacity>

        {hasQueue && !isSyncing && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={onClearQueue}
            activeOpacity={0.75}
          >
            <Text style={styles.clearBtnText}>Bersihkan</Text>
          </TouchableOpacity>
        )}
      </View>
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
  header: {
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
  headerIcon: { fontSize: 22 },
  headerTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  countBadge: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeEmpty: {
    backgroundColor: COLORS.successLight,
  },
  countText: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.bold,
    color: '#fff',
  },
  countTextEmpty: {
    color: COLORS.success,
  },
  internetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  internetOnline: {
    backgroundColor: COLORS.successLight,
  },
  internetOffline: {
    backgroundColor: COLORS.warningLight,
  },
  internetIcon: { fontSize: 14 },
  internetText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.medium,
    flex: 1,
  },
  queueList: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cardBgAlt,
    overflow: 'hidden',
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  queueItemFirst: {
    borderTopWidth: 0,
  },
  queueItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    flex: 1,
  },
  queueDot: {
    color: COLORS.primarySoft,
    fontSize: FONT.size.xl,
    lineHeight: 20,
  },
  queueItemTitle: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textPrimary,
  },
  queueItemMeta: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  pendingPill: {
    backgroundColor: '#FFF3E0',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  pendingText: {
    fontSize: 10,
    color: COLORS.warning,
    fontWeight: FONT.weight.semibold,
  },
  moreItems: {
    textAlign: 'center',
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  emptyQueue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.sm,
  },
  emptyQueueIcon: { fontSize: 16 },
  emptyQueueText: {
    fontSize: FONT.size.sm,
    color: COLORS.success,
    fontWeight: FONT.weight.medium,
  },
  syncResult: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  syncResultText: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
  },
  syncSuccess: {
    color: COLORS.success,
    fontWeight: FONT.weight.semibold,
  },
  syncFailed: {
    color: COLORS.danger,
    fontWeight: FONT.weight.semibold,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  syncBtnDisabled: {
    backgroundColor: '#B0BEC5',
  },
  syncBtnIcon: {
    color: '#fff',
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.bold,
  },
  syncBtnText: {
    color: '#fff',
    fontWeight: FONT.weight.bold,
    fontSize: FONT.size.md,
  },
  clearBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
  },
  clearBtnText: {
    color: COLORS.textMuted,
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.medium,
  },
});