/**
 * The full admin menu's group accents, in one place (2026-11-09): Layout.tsx draws each group and each Workspaces tile
 * in one of these, Settings → Sidebar Menu (MenuSettings.tsx) shows the same dot. GLASS_NAV_ACCENT_TEXT
 * (glassTokens.ts) and LIGHT_NAV_ACCENT_TEXT (lightTokens.ts) are keyed by these values: a new accent gets a line in
 * both.
 */
export const NAV_ACCENT = {
  blue: '#60a5fa',
  violet: '#a78bfa',
  sky: '#38bdf8',
  amber: '#fbbf24',
  emerald: '#34d399',
  pink: '#f472b6',
  cyan: '#22d3ee',
  slate: '#9ca3af',
  teal: '#2dd4bf',
} as const
