/**
 * Argonath / Andúril — Centralized Design Tokens
 *
 * ALL colors, spacings, typography, and theme constants live here.
 * Update this single file to rebrand or adjust the visual identity.
 */

/* ------------------------------------------------------------------ */
/*  Color Palette                                                      */
/* ------------------------------------------------------------------ */

export const colors = {
  /* Brand — deep institutional navy + gold accents */
  brand: {
    900: "#0A1628",
    800: "#0F2140",
    700: "#142D58",
    600: "#1A3A70",
    500: "#1F4788",
    400: "#3A6BB5",
    300: "#6B96D1",
    200: "#A3BFE6",
    100: "#D1DFFA",
    50: "#EDF2FC",
  },

  /* Gold accent — sovereign / institutional feel */
  gold: {
    700: "#7A5E1E",
    600: "#9B7A2F",
    500: "#C49B3A",
    400: "#D4AF51",
    300: "#E2C878",
    200: "#F0DDA3",
    100: "#F8F0D4",
    50: "#FFFCF0",
  },

  /* Neutral / Slate */
  neutral: {
    950: "#090D14",
    900: "#111827",
    800: "#1F2937",
    700: "#374151",
    600: "#4B5563",
    500: "#6B7280",
    400: "#9CA3AF",
    300: "#D1D5DB",
    200: "#E5E7EB",
    100: "#F3F4F6",
    50: "#F9FAFB",
    white: "#FFFFFF",
  },

  /* Semantic */
  success: {
    600: "#059669",
    500: "#10B981",
    400: "#34D399",
    100: "#D1FAE5",
    50: "#ECFDF5",
  },

  warning: {
    600: "#D97706",
    500: "#F59E0B",
    400: "#FBBF24",
    100: "#FEF3C7",
    50: "#FFFBEB",
  },

  danger: {
    600: "#DC2626",
    500: "#EF4444",
    400: "#F87171",
    100: "#FEE2E2",
    50: "#FEF2F2",
  },

  info: {
    600: "#2563EB",
    500: "#3B82F6",
    400: "#60A5FA",
    100: "#DBEAFE",
    50: "#EFF6FF",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Typography                                                         */
/* ------------------------------------------------------------------ */

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },

  fontSize: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem",// 30px
    "4xl": "2.25rem", // 36px
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Spacing / Radii / Shadows                                          */
/* ------------------------------------------------------------------ */

export const spacing = {
  px: "1px",
  0.5: "0.125rem",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
} as const;

export const radii = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.5rem",
  full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
} as const;

/* ------------------------------------------------------------------ */
/*  Component-level tokens (semantic aliases)                          */
/* ------------------------------------------------------------------ */

export const theme = {
  /* Page */
  pageBg: colors.neutral[50],
  pageText: colors.neutral[900],

  /* Header */
  headerBg: colors.brand[900],
  headerText: colors.neutral.white,
  headerAccent: colors.gold[400],

  /* Sidebar / Nav */
  navActiveBg: colors.brand[700],
  navActiveText: colors.neutral.white,
  navHoverBg: colors.brand[800],

  /* Cards */
  cardBg: colors.neutral.white,
  cardBorder: colors.neutral[200],
  cardShadow: shadows.md,

  /* Inputs */
  inputBg: colors.neutral.white,
  inputBorder: colors.neutral[300],
  inputFocusBorder: colors.brand[500],
  inputFocusRing: colors.brand[200],

  /* Buttons — Primary */
  btnPrimaryBg: colors.brand[600],
  btnPrimaryHoverBg: colors.brand[700],
  btnPrimaryText: colors.neutral.white,

  /* Buttons — Secondary (gold) */
  btnSecondaryBg: colors.gold[500],
  btnSecondaryHoverBg: colors.gold[600],
  btnSecondaryText: colors.neutral.white,

  /* Buttons — Ghost / Outline */
  btnGhostBorder: colors.neutral[300],
  btnGhostText: colors.neutral[700],
  btnGhostHoverBg: colors.neutral[100],

  /* Buttons — Danger */
  btnDangerBg: colors.danger[600],
  btnDangerHoverBg: colors.danger[500],
  btnDangerText: colors.neutral.white,

  /* Badges */
  kycValidBg: colors.success[100],
  kycValidText: colors.success[600],
  kycInvalidBg: colors.danger[100],
  kycInvalidText: colors.danger[600],

  /* Health factor gauge */
  healthGreen: colors.success[500],
  healthOrange: colors.warning[500],
  healthRed: colors.danger[500],

  /* Table */
  tableHeaderBg: colors.neutral[100],
  tableRowHoverBg: colors.neutral[50],
  tableBorder: colors.neutral[200],

  /* Misc */
  divider: colors.neutral[200],
  overlay: "rgba(10, 22, 40, 0.6)",
  modalBg: colors.neutral.white,
} as const;
