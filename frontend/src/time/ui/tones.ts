export type Tone = 'neutral' | 'accent' | 'pending' | 'progress' | 'success' | 'danger' | 'ai'

/** The icon's chip per tone: a 12 % tint of the tone with the tone as ink (the Atelier status tones, the AI's violet). */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-a-surface-2 text-a-text-2',
  accent: 'bg-a-accent/12 text-a-accent-text',
  pending: 'bg-a-st-pending/12 text-a-st-pending',
  progress: 'bg-a-st-progress/12 text-a-st-progress',
  success: 'bg-a-st-confirmed/12 text-a-st-confirmed',
  danger: 'bg-a-danger/12 text-a-danger',
  ai: 'time-ai-soft',
}
