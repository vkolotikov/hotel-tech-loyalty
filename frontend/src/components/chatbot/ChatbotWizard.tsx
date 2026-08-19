import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Sparkles, Check, ArrowRight, ArrowLeft, Loader2, MessageCircle, ShieldCheck, BookOpen, Bot,
} from 'lucide-react'

/**
 * First-run chatbot setup.
 *
 * WHY IT LOOKS LIKE THIS
 * The house style is paper-first and editorial, which is right for the
 * marketing site and wrong here: this screen opens inside an admin app whose
 * every other surface is dark, and a light editorial panel would read as a
 * different product. So it inherits the admin tokens and borrows only the
 * transferable parts of the house style — mono uppercase kickers, restrained
 * radius, one signature element, motion kept to a single reveal.
 *
 * The signature element is the thread down the left of the steps. It is not
 * decoration: it encodes the sequence, which is the one thing a first-time user
 * needs to understand — there are four questions and then they are live.
 *
 * WHAT IT ASKS
 * The settings this replaces expose ~91 keys across 7 screens and 8 save
 * buttons. Nearly all of it follows from the industry, so the wizard decides
 * that and asks only what cannot be inferred: the venue's own facts, who a
 * visitor should reach, and whether the preset rules are right.
 */

interface FactDef { label: string; placeholder: string; required: boolean }

interface WizardState {
  completed: boolean
  industry: string
  widget_key: string | null
  preset: {
    assistant_name: string
    tone: string
    goal: string
    core_rules: string[]
    escalation_policy: string
    fallback_message: string
    welcome_title: string
    welcome_subtitle: string
    suggestions: string[]
  }
  facts: Record<string, FactDef>
  prefill: Record<string, string>
}

const TONES = [
  { value: 'friendly',     label: 'Friendly',     hint: 'Warm and conversational' },
  { value: 'professional', label: 'Professional', hint: 'Polished and precise' },
  { value: 'casual',       label: 'Casual',       hint: 'Relaxed and informal' },
  { value: 'formal',       label: 'Formal',       hint: 'Reserved and correct' },
]

const STEPS = [
  { key: 'identity',  title: 'Your assistant' },
  { key: 'knowledge', title: 'What it knows' },
  { key: 'handover',  title: 'Rules & people' },
  { key: 'live',      title: 'Go live' },
]

const kicker = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'
const card   = 'bg-dark-card border border-dark-border rounded-xl p-5'
const label  = 'block text-xs text-t-secondary mb-1.5'
const input  = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none transition-colors'

export function ChatbotWizard({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [step, setStep] = useState(0)

  const { data, isLoading } = useQuery<WizardState>({
    queryKey: ['chatbot-onboarding'],
    queryFn: () => api.get('/v1/admin/chatbot-onboarding').then(r => r.data),
  })

  const [form, setForm] = useState<Record<string, any>>({})
  const [facts, setFacts] = useState<Record<string, string>>({})
  const [rules, setRules] = useState<string[] | null>(null)

  // Preset values are defaults, not answers — typing overrides them.
  const assistantName = form.assistant_name ?? data?.preset.assistant_name ?? ''
  const tone          = form.tone ?? data?.preset.tone ?? 'friendly'
  const activeRules   = rules ?? data?.preset.core_rules ?? []

  const factEntries = useMemo(
    () => Object.entries(data?.facts ?? {}) as [string, FactDef][],
    [data],
  )

  const factValue = (key: string) => facts[key] ?? data?.prefill?.[key] ?? ''

  const filledCount = factEntries.filter(([k]) => factValue(k).trim()).length

  const missingRequired = factEntries
    .filter(([k, def]) => def.required && !factValue(k).trim())
    .map(([, def]) => def.label)

  const apply = useMutation({
    mutationFn: () => api.post('/v1/admin/chatbot-onboarding', {
      company_name:     form.company_name || data?.prefill?.company_name || '',
      assistant_name:   assistantName,
      tone,
      handoff_whatsapp: form.handoff_whatsapp || '',
      handoff_email:    form.handoff_email || '',
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      core_rules:       activeRules,
      facts: Object.fromEntries(factEntries.map(([k]) => [k, factValue(k)])),
    }).then(r => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['chatbot-onboarding'] })
      toast.success(
        res.knowledge_created > 0
          ? 'Your assistant is live with ' + res.knowledge_created + ' answers ready.'
          : 'Your assistant is live.',
      )
      onDone()
    },
    onError: () => toast.error('Could not finish setup. Your answers are still here — try again.'),
  })

  const skip = useMutation({
    mutationFn: () => api.post('/v1/admin/chatbot-onboarding/skip'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatbot-onboarding'] }); onDone() },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary">
        <Loader2 size={18} className="animate-spin mr-2" /> Preparing your setup…
      </div>
    )
  }

  const isLast = step === STEPS.length - 1

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="mb-8">
        <span className={kicker}>{(data.industry || '').replace(/_/g, ' ')} setup</span>
        <h1 className="text-2xl font-semibold text-white mt-2">Let’s get your assistant answering</h1>
        <p className="text-sm text-t-secondary mt-2 leading-relaxed">
          We’ve already chosen the settings that follow from your industry. You only need to tell us
          what nobody else can know — your own details, and who a visitor should reach when they
          want a person.
        </p>
      </div>

      {/*
        Stepper. The connector between nodes is the signature element: it
        encodes the sequence rather than decorating it, so a first-time user can
        see there are four questions and then they are live, and how far along
        they are.

        Drawn as a segment per step rather than one absolutely-positioned line,
        because the row wraps on narrow screens — an absolute line would run
        behind the wrap and point at nothing.
      */}
      <ol className="flex flex-wrap items-center gap-y-3 mb-8">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={
                  'hidden sm:block h-px sm:w-10 mx-2 transition-colors duration-500 motion-reduce:transition-none ' +
                  (i <= step ? 'bg-primary-500' : 'bg-dark-border')
                }
              />
            )}
            <span
              aria-current={i === step ? 'step' : undefined}
              className={
                'w-[22px] h-[22px] rounded-full grid place-items-center border text-[10px] shrink-0 transition-colors motion-reduce:transition-none ' +
                (i < step
                  ? 'bg-primary-500 border-primary-500 text-black'
                  : i === step
                    ? 'bg-dark-bg border-primary-500 text-primary-500'
                    : 'bg-dark-bg border-dark-border text-[#636366]')
              }
            >
              {i < step ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            <span className={'ml-2 text-xs ' + (i === step ? 'text-white font-medium' : 'text-t-secondary')}>
              {s.title}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className={card + ' space-y-5'}>
          <div>
            <label className={label} htmlFor="cw-name">What should your assistant be called?</label>
            <input id="cw-name" className={input} value={assistantName}
              onChange={e => setForm(f => ({ ...f, assistant_name: e.target.value }))} />
            <p className="text-xs text-[#636366] mt-1.5">Visitors see this name at the top of the chat.</p>
          </div>

          <div>
            <span className={label}>How should it sound?</span>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tone === t.value}
                  onClick={() => setForm(f => ({ ...f, tone: t.value }))}
                  className={
                    'text-left px-3 py-2.5 rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none ' +
                    (tone === t.value
                      ? 'bg-primary-500/10 border-primary-500 text-white'
                      : 'bg-dark-bg border-dark-border text-t-secondary hover:border-dark-border2')
                  }
                >
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-[#636366]">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className={card + ' space-y-4'}>
          <p className="text-sm text-t-secondary leading-relaxed">
            These become real answers. Anything you leave blank is simply left out — your assistant
            offers to check rather than guessing.
          </p>

          {factEntries.map(([key, def]) => (
            <div key={key}>
              <label className={label} htmlFor={'cw-' + key}>
                {def.label}
                {def.required && <span className="text-primary-500 ml-1">*</span>}
              </label>
              <input
                id={'cw-' + key}
                className={input}
                placeholder={def.placeholder}
                value={factValue(key)}
                onChange={e => setFacts(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className={card}>
            <span className={kicker}>Ground rules</span>
            <p className="text-sm text-t-secondary mt-2 mb-4 leading-relaxed">
              Already set for your industry. Untick anything that does not apply to you.
            </p>
            <div className="space-y-2.5">
              {(data.preset.core_rules ?? []).map(rule => {
                const on = activeRules.includes(rule)
                return (
                  <label key={rule} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setRules(
                        on ? activeRules.filter(r => r !== rule) : [...activeRules, rule],
                      )}
                      className="mt-0.5 accent-primary-500 w-4 h-4 shrink-0"
                    />
                    <span className={'text-sm leading-snug ' + (on ? 'text-white' : 'text-[#636366]')}>{rule}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className={card}>
            <span className={kicker}>Talk to a person</span>
            <p className="text-sm text-t-secondary mt-2 mb-4 leading-relaxed">
              Adds a WhatsApp button to the chat so a visitor can always reach a human. Without it,
              the only way out of the assistant is for it to guess from the wording.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="cw-wa">WhatsApp number</label>
                <input id="cw-wa" type="tel" className={input} placeholder="+44 20 7123 4567"
                  value={form.handoff_whatsapp ?? ''}
                  onChange={e => setForm(f => ({ ...f, handoff_whatsapp: e.target.value }))} />
                <p className="text-xs text-[#636366] mt-1.5">Include the country code.</p>
              </div>
              <div>
                <label className={label} htmlFor="cw-email">Email us when someone needs help</label>
                <input id="cw-email" type="email" className={input} placeholder="team@yourbusiness.com"
                  value={form.handoff_email ?? ''}
                  onChange={e => setForm(f => ({ ...f, handoff_email: e.target.value }))} />
                <p className="text-xs text-[#636366] mt-1.5">So a waiting visitor is not missed.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={card + ' space-y-4'}>
          <span className={kicker}>Ready</span>
          <h2 className="text-lg font-semibold text-white">Here is what we will set up</h2>

          <ul className="space-y-2.5 text-sm">
            <Summary icon={Bot} text={assistantName + ' answering in a ' + tone + ' tone'} />
            <Summary
              icon={BookOpen}
              text={filledCount > 0
                ? filledCount + ' of your details turned into ready answers'
                : 'No details yet — your assistant will offer to check instead of guessing'}
            />
            <Summary icon={ShieldCheck} text={activeRules.length + ' ground rules applied'} />
            <Summary
              icon={MessageCircle}
              text={form.handoff_whatsapp
                ? 'A WhatsApp button so visitors can reach a person'
                : 'No WhatsApp handover — you can add one later in Widget settings'}
            />
          </ul>

          {missingRequired.length > 0 && (
            <p className="text-xs text-amber-400/90 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2.5">
              You skipped {missingRequired.join(' and ')}. These are what visitors ask most — you can
              add them any time in the Knowledge Base.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={() => (step === 0 ? skip.mutate() : setStep(s => s - 1))}
          disabled={skip.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-t-secondary hover:text-white rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none disabled:opacity-50"
        >
          {step === 0 ? 'Skip setup' : <><ArrowLeft size={15} /> Back</>}
        </button>

        <button
          type="button"
          onClick={() => (isLast ? apply.mutate() : setStep(s => s + 1))}
          disabled={apply.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-500 text-black rounded-lg hover:bg-primary-400 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none disabled:opacity-60"
        >
          {apply.isPending
            ? <><Loader2 size={15} className="animate-spin" /> Setting up…</>
            : isLast
              ? <><Sparkles size={15} /> Finish setup</>
              : <>Continue <ArrowRight size={15} /></>}
        </button>
      </div>
    </div>
  )
}

function Summary({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-t-secondary">
      <Icon size={15} className="text-primary-500 mt-0.5 shrink-0" />
      <span>{text}</span>
    </li>
  )
}
