import { useTranslation } from 'react-i18next'
import { PLATFORM_SHORT } from '../lib/platforms'
import type { Platform } from '../lib/types'

/**
 * A platform's mark: its two letters on its own colour, the ink chosen by theme/content.css; the name is read out. The
 * letters are drawn by the stylesheet (data-short), so a card's name, which says the platform in full, need not repeat
 * them (label in name).
 */
export function PlatformMark({ platform, size = 'md' }: { platform: Platform; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const name = t(`content.platform.${platform}`, platform)
  return (
    <span data-platform={platform} title={name}
      className={`c-mark inline-grid shrink-0 place-items-center rounded-md font-a-mono font-semibold uppercase leading-none ${size === 'sm' ? 'h-5 w-5 text-[12px]' : 'h-6 w-6 text-xs'}`}>
      <span aria-hidden data-short={PLATFORM_SHORT[platform]} className="c-mark-short" />
      <span className="sr-only">{name}</span>
    </span>
  )
}
