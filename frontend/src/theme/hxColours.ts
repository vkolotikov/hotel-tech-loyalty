/**
 * Hard-coded colours the admin uses, by kind, as 6-digit lowercase hex
 * without `#`: HX_TEXT for text and placeholder classes, HX_FILL for
 * backgrounds, borders, rings, gradient stops and inline fills. Each one is a
 * Tailwind class (an hx text or background class) or an inline hx() value whose
 * fallback is the exact old colour, so Glass and Classic never change; Clean
 * light gives it lightTextFor / lightFillFor. hxColours.test.ts keeps these
 * lists in step with the source.
 */
export const HX_TEXT: readonly string[] = ['1b2a34', '22d3ee', '25d366', '333333', '3a3a3a', '3a3a5c', '3b82f6', '444444', '54626e', '555555', '5a5a5c', '5ac8fa', '6366f1', '777777', '818cf8', '888888', '8b5cf6', '93c5fd', '999999', '9a9a9a', '9ae6b4', '9c2f32', '9c9c9e', '9ca3af', 'aaaaaa', 'b8b8ba', 'bbbbbb', 'c0c0c0', 'c1cdd4', 'c8c8c8', 'c8c8cc', 'c9a84c', 'cccccc', 'd0d0d0', 'd8d8d8', 'dcbc60', 'e0e0e0', 'e5e5e5', 'e8c869', 'ef4444', 'f4f6f8', 'f59e0b', 'f97316', 'ff6680', 'ff9500', 'ffd60a']
export const HX_FILL: readonly string[] = ['060b1e', '070b14', '080810', '0891b2', '0a0a0a', '0a0a0c', '0a0d14', '0a0d1f', '0a1020', '0a1410', '0b0b0b', '0c0c12', '0d0d0d', '0d1528', '0e1a24', '0f0f1a', '0f1527', '10b981', '111118', '141414', '141419', '161616', '1a1e1c', '1c1c1c', '1c1c1e', '1e1e24', '222222', '222240', '22d3ee', '25d366', '28c840', '3b82f6', '444444', '5ac8fa', '6366f1', '81272a', '8b5cf6', '9c2f32', 'a6883c', 'a78bfa', 'a855f7', 'b59244', 'b8983e', 'bdc7ce', 'c2a247', 'c9a84c', 'd4b357', 'd4b358', 'dcbc60', 'dde3e8', 'eaeef2', 'ef4444', 'f4f6f8', 'f59e0b', 'f97316', 'febc2e', 'ff5f57', 'ffd60a']

/** Colours already designed for a light card (ChatGptConnectionsPanel and friends): kept as they are in light. */
export const LIGHT_HEX_KEEP: readonly string[] = ['1b2a34', '54626e', 'dde3e8', 'eaeef2', 'f4f6f8', 'c1cdd4', 'bdc7ce']

/** Hand-picked light values where the rules in light.ts are wrong for a colour. */
export const LIGHT_HEX_OVERRIDES: { t: Record<string, string>; f: Record<string, string> } = { t: {}, f: {} }
