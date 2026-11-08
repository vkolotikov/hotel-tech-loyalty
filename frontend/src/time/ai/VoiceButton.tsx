import { useTranslation } from 'react-i18next'
import { Loader2, Mic, Square } from 'lucide-react'
import { useToast } from '../ui/Toast'
import { useRecorder } from './useRecorder'
import { elapsed, voiceFailureText } from './voice'

/**
 * Press to speak, press again to stop: the words go to `onText` (a field to append to, or the AI capture). `big` is the
 * round button the capture dialog and My day's quick add use; otherwise a small icon beside a field.
 */
export function VoiceButton({ onText, big = false, label, language }: { onText: (text: string) => void; big?: boolean; label?: string; language?: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, seconds, toggle } = useRecorder({
    onText,
    onFail: why => toast(voiceFailureText(t, why), 'danger'),
    language,
  })
  const recording = state === 'recording'
  const busy = state === 'transcribing'
  const name = recording
    ? t('time.voice.stop', 'Stop and write it down')
    : label ?? t('time.voice.start', 'Speak instead of typing')

  if (big) {
    return (
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={recording} aria-label={name}
        className={`relative inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${recording ? 'bg-a-danger text-a-danger-ink' : 'time-ai-fill hover:opacity-90'}`}>
        {busy ? <Loader2 size={18} aria-hidden className="animate-spin" /> : recording ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
        <span className="hidden sm:inline">{busy ? t('time.voice.writing', 'Writing it down…') : recording ? elapsed(seconds) : t('time.voice.speak', 'Speak')}</span>
        {recording && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-a-danger" />}
      </button>
    )
  }
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={recording} aria-label={name} title={name}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${recording ? 'border-transparent bg-a-danger text-a-danger-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      {busy ? <Loader2 size={15} aria-hidden className="animate-spin" /> : recording ? <Square size={13} aria-hidden /> : <Mic size={15} aria-hidden />}
    </button>
  )
}
