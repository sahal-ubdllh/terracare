// constants/theme.ts — TERRACARE_APP Design Tokens

export const COLORS = {
  // Primary greens — earthy, agricultural
  primary: '#1B5E20',        // Deep forest green
  primaryMid: '#2E7D32',     // Rich field green
  primaryLight: '#388E3C',   // Active green
  primarySoft: '#4CAF50',    // Leaf green
  accent: '#8BC34A',         // Lime/sprout green

  // Soil-inspired neutrals
  soilDark: '#1C1209',       // Dark soil
  soilMid: '#3E2723',        // Mid soil brown
  soilLight: '#795548',      // Clay

  // Surface colors
  background: '#F1F8E9',     // Light foliage tint
  cardBg: '#FFFFFF',
  cardBgAlt: '#F9FBF4',
  surfaceGlass: 'rgba(255,255,255,0.92)',

  // Status colors
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#F57F17',
  warningLight: '#FFF8E1',
  danger: '#B71C1C',
  dangerLight: '#FFEBEE',
  info: '#0277BD',
  infoLight: '#E1F5FE',

  // Kesuburan gradient
  fertileLow: '#EF5350',     // Red — kurang subur
  fertileMid: '#FFA726',     // Orange — sedang
  fertileHigh: '#66BB6A',    // Green — subur

  // Text
  textPrimary: '#1A2E1A',
  textSecondary: '#4A6741',
  textMuted: '#7B9B78',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255,255,255,0.75)',
};

export const GRADIENTS = {
  header: ['#1B5E20', '#2E7D32', '#388E3C'] as string[],
  card: ['#F9FBF4', '#FFFFFF'] as string[],
  fertile: ['#1B5E20', '#4CAF50'] as string[],
  warning: ['#E65100', '#FF8F00'] as string[],
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const FONT = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    display: 34,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};

export const SHADOW = {
  sm: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
};

export const ESP32_CONFIG = {
  BASE_URL: 'http://192.168.4.1',
  DATA_ENDPOINT: '/data',
  POLL_INTERVAL_MS: 1000,
  FETCH_TIMEOUT_MS: 2000,
  WIFI_SSID: 'Alat_SmartFarming',
};

export const STORAGE_KEYS = {
  PENDING_QUEUE: '@terracare_pending_queue',
};