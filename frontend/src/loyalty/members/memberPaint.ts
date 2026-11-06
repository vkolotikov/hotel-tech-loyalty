import type { CSSProperties } from 'react'
import { contrast, tint, type ThemeName } from '../../workspace/theme/accent'
import { tierHex } from '../theme/tierChip'

/** Opaque backgrounds make contrast independent of stripes, hover and parent surfaces. */
export const MEMBER_PAINT = {
  dark: {
    directory: '#28303f', stripe: '#2d3647', head: '#313a4e', hover: '#34556b', edge: '#475165',
    cyanTop: '#26465a', cyanBottom: '#233241', cyanEdge: '#366584', cyanIcon: '#27475c',
    greenTop: '#384e50', greenBottom: '#29353d', greenEdge: '#517274', greenIcon: '#3a5051',
    blueTop: '#38475f', blueBottom: '#293242', blueEdge: '#51668b', blueIcon: '#3a4861',
    violetTop: '#44445f', violetBottom: '#2d3142', violetEdge: '#62628b', violetIcon: '#454561',
    activeText: '#8ddeb7', activeBg: '#233f38', expiringText: '#ffd18a', expiringBg: '#484035',
    expiredText: '#ffb8c1', expiredBg: '#49343e', offText: '#c7d3e5', offBg: '#353f54',
  },
  light: {
    directory: '#ffffff', stripe: '#f0f4fa', head: '#e3eaf4', hover: '#d6eaf4', edge: '#b9c8db',
    cyanTop: '#e0f1f9', cyanBottom: '#edf6fb', cyanEdge: '#8cb8ce', cyanIcon: '#cee7f3',
    greenTop: '#dfefe7', greenBottom: '#eef6f2', greenEdge: '#94b9a6', greenIcon: '#cfe6d9',
    blueTop: '#e2eafa', blueBottom: '#f0f4fc', blueEdge: '#9eafd1', blueIcon: '#d1def4',
    violetTop: '#eae5f8', violetBottom: '#f5f1fc', violetEdge: '#b3a4d2', violetIcon: '#dfd6f1',
    activeText: '#176042', activeBg: '#d8eee1', expiringText: '#754300', expiringBg: '#fff0d6',
    expiredText: '#922b40', expiredBg: '#fbe2e7', offText: '#49596d', offBg: '#e7edf5',
  },
} as const

export function memberPaintStyle(theme: ThemeName): CSSProperties {
  return Object.fromEntries(Object.entries(MEMBER_PAINT[theme]).map(([key, value]) => [`--l-mb-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value])) as CSSProperties
}

export function memberTierPaint(color: string | null | undefined, theme: ThemeName) {
  const swatch = tierHex(color) ?? (theme === 'dark' ? '#c7d3e5' : '#526279')
  const background = tint(MEMBER_PAINT[theme].directory, swatch)
  const text = contrast(swatch, background) >= 4.5 ? swatch : theme === 'dark' ? '#f5f7fb' : '#1b2430'
  return { background, text, swatch }
}
