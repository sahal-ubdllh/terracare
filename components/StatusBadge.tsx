// components/StatusBadge.tsx — TERRACARE_APP
import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '../constants/theme';

interface StatusBadgeProps {
  label: string;
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  label,
  isActive,
  activeLabel = 'AKTIF',
  inactiveLabel = 'OFFLINE',
  size = 'md',
}: StatusBadgeProps) {
  const isSmall = size === 'sm';

  return (
    <View style={[styles.container, isSmall && styles.containerSm]}>
      <View style={styles.labelRow}>
        <View style={[styles.dot, isActive ? styles.dotActive : styles.dotInactive]} />
        <Text style={[styles.label, isSmall && styles.labelSm]}>{label}</Text>
      </View>
      <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
        <Text style={[styles.badgeText, isSmall && styles.badgeTextSm]}>
          {isActive ? activeLabel : inactiveLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 100,
  },
  containerSm: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    minWidth: 80,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  dotActive: {
    backgroundColor: '#A5D6A7',
    shadowColor: '#A5D6A7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    fontSize: FONT.size.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FONT.weight.medium,
    letterSpacing: 0.3,
  },
  labelSm: {
    fontSize: 10,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  badgeActive: {
    backgroundColor: 'rgba(165,214,167,0.25)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    color: COLORS.textOnDark,
    letterSpacing: 0.8,
  },
  badgeTextSm: {
    fontSize: 10,
  },
});