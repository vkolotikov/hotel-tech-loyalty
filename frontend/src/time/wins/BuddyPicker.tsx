import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, EyeOff, Smile } from 'lucide-react'
import { timeApi } from '../lib/api'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import type { RecognitionMe } from '../lib/types'
import { Card } from '../ui/Card'
import { useToast } from '../ui/Toast'
import { Buddy } from './Buddy'
import { BUDDY_KINDS, NO_BUDDY, buddyOf, choiceOf, type BuddyChoice } from './buddyLogic'
import { BUDDY_NAMES } from './words'

/**
 * The choice of a character (Buddies, 2026-11-28): the four there are and "no character", the one in use marked. The
 * one in use is the server's answer — the person's own choice, or the one their account was given until they choose —
 * and a press saves through the workspace's `time/buddy` (the one thing of a planner profile a person sets for
 * themselves). Colleagues see the choice beside the person's name, so the card says so.
 */
export function BuddyPicker({ me }: { me: RecognitionMe }) {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefresh()
  // "None" is in use when the person chose it; otherwise whichever character the answer shows.
  const saved: BuddyChoice | null = choiceOf(me.buddy_choice) === NO_BUDDY ? NO_BUDDY : buddyOf(me.buddy)
  // The choice just sent stays marked until the reloaded answer says the same (no flash of the old one).
  const [sent, setSent] = useState<BuddyChoice | null>(null)
  if (sent !== null && sent === saved) setSent(null)
  const current = sent ?? saved

  const save = useMutation({
    mutationFn: (choice: BuddyChoice) => timeApi.chooseBuddy(choice),
    onSuccess: () => { refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => { setSent(null); refresh(); toast(errorText(t, error), 'danger') },
  })
  const choose = (choice: BuddyChoice) => { if (choice !== current) { setSent(choice); save.mutate(choice) } }
  const option = (on: boolean) => `relative flex min-w-0 flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default ${on ? 'border-a-accent bg-a-accent/12' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`
  const mark = <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-a-accent px-1.5 py-0.5 text-xs font-semibold text-a-accent-ink"><Check size={11} aria-hidden />{t('time.wins.buddy.yours', 'Yours')}</span>

  return (
    <Card title={t('time.wins.buddy.pick_title', 'Your buddy')} icon={Smile} tone="gold"
      description={t('time.wins.buddy.pick_line', 'Pick the character that keeps you company. Your colleagues see it beside your name.')}>
      <div role="radiogroup" aria-label={t('time.wins.buddy.pick_title', 'Your buddy')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BUDDY_KINDS.map(kind => {
          const on = current === kind
          return (
            <button key={kind} type="button" role="radio" aria-checked={on} data-buddy={kind} disabled={save.isPending} onClick={() => choose(kind)} className={option(on)}>
              {on && mark}
              {/* The one in use is lively; the others wait until they are picked. */}
              <Buddy kind={kind} mood={on ? 'proud' : 'ready'} still={!on} size={84} />
              <span className="text-sm font-semibold text-a-text">{t(`time.wins.buddy.name.${kind}`, BUDDY_NAMES[kind])}</span>
            </button>
          )
        })}
        <button type="button" role="radio" aria-checked={current === NO_BUDDY} data-buddy={NO_BUDDY} disabled={save.isPending} onClick={() => choose(NO_BUDDY)} className={option(current === NO_BUDDY)}>
          {current === NO_BUDDY && mark}
          <span aria-hidden className="grid h-[84px] w-[84px] place-items-center rounded-full bg-a-surface-2 text-a-text-2"><EyeOff size={28} /></span>
          <span className="text-sm font-semibold text-a-text">{t('time.wins.buddy.none', 'No character')}</span>
        </button>
      </div>
    </Card>
  )
}
