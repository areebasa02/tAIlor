export const THEME_COLORS = {
  pink: "#ce005a",
  rose: "#e2828f",
  gold: "#ffcb44",
  red: "#da400c",
  turquoise: "#69d5e6",
  darkTeal: "#007880",
  green: "#40b066",
  lightGreen: "#76e09a",
} as const

export type ThemeColorKey = keyof typeof THEME_COLORS

// Status mappings for AI and notification states
export const STATUS_COLORS = {
  loading: THEME_COLORS.turquoise,  // #69d5e6
  success: THEME_COLORS.green,      // #40b066
  uncertain: THEME_COLORS.gold,     // #ffcb44
  error: THEME_COLORS.red,          // #da400c
  muted: "#8B8FA8",
} as const