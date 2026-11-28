import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, CheckCheck, Crown, Flame, Star, Target, Trophy, X, Zap, type LucideIcon } from 'lucide-react'
import { motionOk } from '../lib/motion'
import { useRecognition } from '../lib/queries'
import type { Recognition } from '../lib/types'
import { confettiPieces } from './confetti'
import { Medal } from './parts'
import { useCheerText } from './useBadgeWords'
import { cheersBetween, type CheerKind, type Cheers } from './winsLogic'

const PIECES = confettiPieces()

/** How long a celebration stays: a card long enough to read, a plain "+N points" a moment. */
const CARD_MS = 7000
const POINTS_MS = 2400

/**
 * The moments worth celebrating (2026-11-28, the owner: "animated stimulus to employees"), mounted once in the shell so
 * they arrive on whatever page the work was finished: after a write every read is asked again, and when the server's
 * answer says something was earned since the last one — a badge, the lead, a clean sweep, the daily goal, a
 * well-planned day, an important task — a card says so, with confetti for the big ones; a plain task shows its points.
 * The first answer of a session is only the starting line. Nothing is decided here: `cheersBetween` reads two answers.
 */
export function Celebration() {
  const { data } = useRecognition()
  const text = useCheerText(data?.rules)
  const [seen, setSeen] = useState<Recognition | undefined>(undefined)
  const [shown, setShown] = useState<{ cheers: Cheers; n: number } | null>(null)

  // Derived from the answer that just arrived (React's pattern for state that follows a value): compare, then remember.
  if (data !== seen) {
    setSeen(data)
    const cheers = cheersBetween(seen, data)
    if (cheers) setShown(current => ({ cheers, n: (current?.n ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!shown) return
    const id = window.setTimeout(() => setShown(null), shown.cheers.main ? CARD_MS : POINTS_MS)
    return () => window.clearTimeout(id)
  }, [shown])

  // The line a screen reader hears is always on the page, so what is written into it is read out once.
  const said = shown ? text(shown.cheers) : null
  return (
    <>
      <p role="status" className="sr-only">{said ? [said.title, said.line, ...said.also, shown?.cheers.main ? said.gained : ''].filter(Boolean).join(' ') : ''}</p>
      {shown && <CheerView key={shown.n} cheers={shown.cheers} rules={data?.rules} onClose={() => setShown(null)} />}
    </>
  )
}

const KIND_ICON: Record<Exclude<CheerKind, 'badge'>, LucideIcon> = {
  lead: Crown,
  sweep: CheckCheck,
  goal: Target,
  planned: CalendarCheck,
  important: Zap,
}

/**
 * One celebration as it is drawn: the card (or only the points), and confetti where the device lets things move. What a
 * screen reader hears is the shell's status line (Celebration), so nothing here announces itself a second time.
 */
export function CheerView({ cheers, rules, onClose }: { cheers: Cheers; rules?: Recognition['rules']; onClose: () => void }) {
  const { t } = useTranslation()
  // Asked once, when the celebration appears: a device that wants less motion gets the card and no shower.
  const [lively] = useState(motionOk)
  const { main } = cheers
  const { title, line, also, gained } = useCheerText(rules)(cheers)

  if (!main) {
    return (
      <div aria-hidden data-cheer="points" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4">
        <p className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-a-lg time-gold-fill ${lively ? 'time-float-up' : ''}`}>
          <Star size={15} />{gained}
        </p>
      </div>
    )
  }

  const badge = main.kind === 'badge' ? (main.badge ?? '') : ''

  return (
    <>
      {lively && main.big && (
        <div aria-hidden data-confetti="" className="pointer-events-none fixed inset-0 z-[69] overflow-hidden">
          {PIECES.map((p, i) => (
            <span key={i} data-tone={p.tone} className="time-confetti"
              style={{ left: `${p.left}%`, width: p.width, height: p.height, animationDelay: `${p.delay}ms`, animationDuration: `${p.time}ms`, '--time-drift': `${p.drift}px`, '--time-turn': `${p.turn}deg` } as CSSProperties} />
          ))}
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-4">
        <div data-cheer={main.kind} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-a-surface p-4 time-cheer animate-a-rise">
          {main.kind === 'badge'
            ? <Medal code={badge} earned size="md" />
            : <Medal earned size="md" icon={KIND_ICON[main.kind]} />}
          <div className="min-w-0 flex-1">
            <p className="font-a-display text-lg leading-snug text-a-text">{title}</p>
            <p className="mt-0.5 text-sm text-a-text-2">{line}</p>
            {also.length > 0 && (
              <ul data-cheer-also="" className="mt-2 flex flex-wrap gap-1.5">
                {also.map(moment => (
                  <li key={moment} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold time-gold-soft"><Trophy size={13} aria-hidden />{moment}</li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold time-gold-fill"><Star size={13} aria-hidden />{gained}</span>
              {cheers.streak >= 2 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold time-gold-soft">
                  <Flame size={13} aria-hidden className="time-flicker" />{t('time.wins.streak', '{{count}} days in a row', { count: cheers.streak })}
                </span>
              )}
              {main.more !== undefined && main.more > 0 && (
                <span className="text-xs font-semibold text-a-text-2">{t('time.wins.more_badges', 'and {{count}} more badges', { count: main.more })}</span>
              )}
              <Link to="/time/wins" onClick={onClose} className="ml-auto whitespace-nowrap text-sm font-semibold text-a-accent-text">{t('time.wins.see', 'See achievements')}</Link>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('time.common.close', 'Close')}
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    </>
  )
}
