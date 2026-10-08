/**
 * Every brand colour an organisation is likely to have, for the Glass
 * contrast tests. Add a colour here when a new preset or industry ships.
 */
export const BRAND_COLOURS = [
  // Settings → Branding presets (pages/Settings.tsx PRESETS)
  '#c9a84c', '#3b82f6', '#10b981', '#e11d48', '#06b6d4', '#8b5cf6', '#f97316',
  '#16a34a', '#d4af37', '#64748b', '#14b8a6', '#9f1239', '#0ea5e9',
  // Member-app presets, which owners also type into the admin palette
  '#78716c', '#f5f5f5', '#c2410c',
  // Industry colours from signup (OrganizationSetupService::industryPrimaryColor)
  '#d96aa8', '#4a9fd8', '#d97742', '#7c6fd8', '#8a99b5', '#3fae8a', '#2a9db5', '#4c6ef5',
  // Edge cases: navy, pale yellow, black, white
  '#1e3a8a', '#fde68a', '#000000', '#ffffff',
] as const
