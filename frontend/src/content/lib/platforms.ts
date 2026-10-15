import type { Platform } from './types'

/** The two letters a platform's mark shows; its colour and ink come from theme/content.css ([data-platform]). */
export const PLATFORM_SHORT: Record<Platform, string> = {
  linkedin: 'in', instagram: 'ig', tiktok: 'tt', facebook: 'fb', x: 'x', youtube: 'yt', blog: 'bl', email: 'em',
}
