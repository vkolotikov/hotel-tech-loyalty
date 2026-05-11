import { useState } from 'react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Sparkles, Stethoscope, Scale, Home, GraduationCap, Dumbbell, Utensils,
  Bot, Users, BedDouble, FileText, ClipboardList,
  ArrowRight, ArrowLeft, Check, Zap, Database, Star,
} from 'lucide-react'

/**
 * Onboarding wizard — the first thing a freshly-signed-up org sees.
 * Four steps, each focused on one decision so a non-technical user
 * can finish in under two minutes and land on a working dashboard
 * without learning every feature first.
 *
 *   1. Business basics (name + industry)
 *   2. Features (which menu groups to keep visible)
 *   3. Personalise (chatbot greeting + property count + sample data)
 *   4. Review (summary of what we're about to do)
 *
 * The whole payload is sent in one POST. Backend orchestrator
 * applies the CRM + planner industry presets, hides the unselected
 * menu groups, seeds chatbot + property defaults, and (optionally)
 * loads sample data — all atomically.
 */

interface Props {
  onComplete: () => void
}

interface IndustryDef {
  key: string
  label: string
  icon: any
  blurb: string
  /** Pre-selected feature keys for this industry. User can still override. */
  defaultFeatures: string[]
}

const INDUSTRIES: IndustryDef[] = [
  { key: 'hotel',       label: 'Hotel',                  icon: Building2,     blurb: 'Stay reservations, group sales, F&B, housekeeping.', defaultFeatures: ['bookings', 'loyalty', 'ai_chat', 'crm', 'operations'] },
  { key: 'beauty',      label: 'Beauty / Spa',           icon: Sparkles,      blurb: 'Treatments + service bookings + retail.',           defaultFeatures: ['bookings', 'loyalty', 'ai_chat', 'crm', 'operations'] },
  { key: 'medical',     label: 'Medical / Healthcare',   icon: Stethoscope,   blurb: 'Patient intake + appointments + records.',          defaultFeatures: ['bookings', 'ai_chat', 'crm', 'operations'] },
  { key: 'legal',       label: 'Legal / Law firm',       icon: Scale,         blurb: 'Matter intake + engagement + close.',               defaultFeatures: ['ai_chat', 'crm', 'operations'] },
  { key: 'real_estate', label: 'Real estate',            icon: Home,          blurb: 'Buyer / seller pipeline + showings.',               defaultFeatures: ['ai_chat', 'crm', 'operations'] },
  { key: 'education',   label: 'Education / Tutoring',   icon: GraduationCap, blurb: 'Inquiry → trial → enrolment.',                      defaultFeatures: ['ai_chat', 'crm', 'operations', 'loyalty'] },
  { key: 'fitness',     label: 'Fitness / Wellness',     icon: Dumbbell,      blurb: 'Trial → membership + class bookings.',              defaultFeatures: ['bookings', 'loyalty', 'ai_chat', 'crm', 'operations'] },
  { key: 'restaurant',  label: 'Restaurant',             icon: Utensils,      blurb: 'Reservations + service workflow.',                  defaultFeatures: ['bookings', 'ai_chat', 'crm', 'operations'] },
]

interface FeatureDef {
  key: string
  label: string
  icon: any
  accent: string
  blurb: string
}

const FEATURES: FeatureDef[] = [
  { key: 'bookings',   label: 'Bookings',          icon: BedDouble,     accent: '#34d399', blurb: 'Reservations, services, rooms, payments, PMS sync (Smoobu).' },
  { key: 'loyalty',    label: 'Members & Loyalty', icon: Users,         accent: '#fbbf24', blurb: 'Members, tiers, points, offers, member mobile app.' },
  { key: 'ai_chat',    label: 'AI Chat',           icon: Bot,           accent: '#a78bfa', blurb: 'Website chatbot, engagement hub, live agent inbox.' },
  { key: 'crm',        label: 'CRM & Marketing',   icon: FileText,      accent: '#f472b6', blurb: 'Leads, sales pipeline, tasks, reports, campaigns, reviews.' },
  { key: 'operations', label: 'Operations',        icon: ClipboardList, accent: '#22d3ee', blurb: 'Day planner, brands, properties, scanner.' },
]

export function Setup({ onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Step 1
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState<string>('hotel')

  // Step 2
  const [features, setFeatures] = useState<string[]>(INDUSTRIES[0].defaultFeatures)

  // Step 3
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [propertyCount, setPropertyCount] = useState(1)
  const [withSample, setWithSample] = useState(false)

  /**
   * Picking an industry resets the feature selection to the
   * recommended defaults for that vertical. User can still override
   * before moving on — but the default click-path needs zero thinking.
   */
  const pickIndustry = (key: string) => {
    setIndustry(key)
    const def = INDUSTRIES.find(i => i.key === key)
    if (def) setFeatures(def.defaultFeatures)
  }

  const toggleFeature = (key: string) => {
    setFeatures(f => f.includes(key) ? f.filter(x => x !== key) : [...f, key])
  }

  const canAdvance = () => {
    if (step === 1) return companyName.trim().length > 0 && !!industry
    if (step === 2) return features.length > 0
    return true
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      await api.post('/v1/admin/setup/initialize', {
        company_name: companyName.trim(),
        industry,
        features,
        property_count: propertyCount,
        welcome_message: welcomeMessage.trim() || undefined,
        with_sample_data: withSample,
      })
      toast.success('Welcome! Your workspace is ready.')
      setStep(5) // done state
      setTimeout(onComplete, 1400)
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Setup failed — please retry')
      setSubmitting(false)
    }
  }

  const industryDef = INDUSTRIES.find(i => i.key === industry) ?? INDUSTRIES[0]

  /* ───────────── Done splash ───────────── */
  if (step === 5) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-emerald-500 rounded-full flex items-center justify-center animate-pulse">
            <Check size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">All set!</h2>
          <p className="text-gray-500 text-sm">Opening your dashboard…</p>
        </div>
      </div>
    )
  }

  /* ───────────── Wizard shell ───────────── */
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 mb-3">
            <Zap className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Let's set up your workspace</h1>
          <p className="text-gray-500 text-sm mt-1">Takes about 90 seconds. You can change anything later from Settings.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s}
              className={'h-1.5 rounded-full transition-all ' +
                (s < step ? 'w-8 bg-emerald-500' : s === step ? 'w-12 bg-primary-500' : 'w-8 bg-dark-surface2')}
            />
          ))}
        </div>

        {/* Step body */}
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-5 md:p-6 mb-4">
          {step === 1 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">What's your business called?</h2>
              <p className="text-xs text-gray-500 mb-4">We'll use this on widgets, emails, and your team's view of the app.</p>
              <input
                autoFocus
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. Grand Hotel Vienna"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500 mb-5"
              />

              <h3 className="text-sm font-bold text-white mb-1">Pick your industry</h3>
              <p className="text-xs text-gray-500 mb-3">We'll preconfigure pipelines, task groups, and the right starter templates for your vertical.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {INDUSTRIES.map(opt => {
                  const Icon = opt.icon
                  const active = industry === opt.key
                  return (
                    <button key={opt.key} onClick={() => pickIndustry(opt.key)}
                      className={'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all ' +
                        (active ? 'border-amber-500/60 bg-amber-500/[0.08]' : 'border-dark-border bg-dark-bg hover:border-amber-500/30 hover:bg-amber-500/[0.04]')}>
                      <div className={'w-9 h-9 rounded-md flex items-center justify-center ' + (active ? 'bg-amber-500/25 text-amber-300' : 'bg-purple-500/15 text-purple-300')}>
                        <Icon size={16} />
                      </div>
                      <span className="text-xs font-bold text-white">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
              {industryDef && (
                <div className="mt-3 text-xs text-gray-500 flex items-start gap-2">
                  <Star size={11} className="text-amber-300 fill-amber-300 mt-0.5 flex-shrink-0" />
                  <span>{industryDef.blurb}</span>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Which features will you use?</h2>
              <p className="text-xs text-gray-500 mb-4">We'll hide the rest from the sidebar so your team sees a clean menu. You can flip any of these on later from Settings → Menu.</p>

              <div className="space-y-2">
                {FEATURES.map(f => {
                  const active = features.includes(f.key)
                  const Icon = f.icon
                  return (
                    <button key={f.key} onClick={() => toggleFeature(f.key)}
                      className={'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ' +
                        (active ? 'border-dark-border' : 'border-dark-border opacity-50')}
                      style={active ? { borderColor: f.accent + '60', backgroundColor: f.accent + '0c' } : {}}>
                      <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: f.accent + '25', color: f.accent }}>
                        <Icon size={17} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white">{f.label}</div>
                        <div className="text-[11px] text-gray-500 line-clamp-1">{f.blurb}</div>
                      </div>
                      <div className={'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ' +
                        (active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-dark-surface2 text-gray-500')}>
                        {active ? 'INCLUDED' : 'OFF'}
                      </div>
                    </button>
                  )
                })}
              </div>

              {features.length === 0 && (
                <p className="text-[11px] text-red-400 mt-3">Pick at least one — otherwise the dashboard would be empty.</p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Just a couple of personal touches</h2>
              <p className="text-xs text-gray-500 mb-4">Everything here is optional — leave blank to use our defaults.</p>

              {features.includes('ai_chat') && (
                <div className="mb-4">
                  <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Chat widget greeting</label>
                  <p className="text-[11px] text-gray-500 mb-2">The first message visitors see when the website chat opens.</p>
                  <textarea
                    value={welcomeMessage}
                    onChange={e => setWelcomeMessage(e.target.value)}
                    rows={2}
                    placeholder={`Hi! Welcome to ${companyName || 'our site'}. How can we help you today?`}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500 resize-none"
                  />
                </div>
              )}

              {(features.includes('bookings') || features.includes('operations')) && (
                <div className="mb-4">
                  <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">How many locations / properties?</label>
                  <p className="text-[11px] text-gray-500 mb-2">We'll create a starter Property record for each — useful even if you only have one.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPropertyCount(Math.max(1, propertyCount - 1))}
                      className="w-9 h-9 rounded-md bg-dark-bg border border-dark-border text-gray-400 hover:text-white">−</button>
                    <div className="w-14 text-center font-bold text-white text-lg">{propertyCount}</div>
                    <button onClick={() => setPropertyCount(Math.min(20, propertyCount + 1))}
                      className="w-9 h-9 rounded-md bg-dark-bg border border-dark-border text-gray-400 hover:text-white">+</button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Want demo data to explore?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setWithSample(true)}
                    className={'p-3 rounded-lg border text-left transition-colors ' + (withSample ? 'border-primary-500 bg-primary-500/[0.08]' : 'border-dark-border bg-dark-bg hover:bg-dark-surface2')}>
                    <div className="flex items-center gap-2 mb-1">
                      <Database size={14} className={withSample ? 'text-primary-400' : 'text-gray-500'} />
                      <span className="text-sm font-bold text-white">With demo data</span>
                    </div>
                    <p className="text-[11px] text-gray-500">5 members, 3 guests, sample tiers — click around to learn the app.</p>
                  </button>
                  <button onClick={() => setWithSample(false)}
                    className={'p-3 rounded-lg border text-left transition-colors ' + (!withSample ? 'border-primary-500 bg-primary-500/[0.08]' : 'border-dark-border bg-dark-bg hover:bg-dark-surface2')}>
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={14} className={!withSample ? 'text-primary-400' : 'text-gray-500'} />
                      <span className="text-sm font-bold text-white">Start clean</span>
                    </div>
                    <p className="text-[11px] text-gray-500">No demo rows — straight to your real data.</p>
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Ready to launch?</h2>
              <p className="text-xs text-gray-500 mb-4">Here's what we'll set up. You can change everything later from Settings.</p>

              <div className="space-y-2 mb-4">
                <ReviewRow label="Business" value={companyName || '—'} />
                <ReviewRow label="Industry" value={industryDef.label} />
                <ReviewRow label="Features" value={
                  features.map(k => FEATURES.find(f => f.key === k)?.label).filter(Boolean).join(' · ') || 'none'
                } />
                <ReviewRow label="Properties" value={String(propertyCount)} />
                <ReviewRow label="Demo data" value={withSample ? 'Yes' : 'No'} />
                {features.includes('ai_chat') && welcomeMessage && (
                  <ReviewRow label="Chat greeting" value={welcomeMessage} />
                )}
              </div>

              <div className="bg-blue-500/[0.04] border border-blue-500/20 rounded-lg p-3">
                <p className="text-[11px] text-blue-200 font-bold mb-1">What happens next</p>
                <ul className="text-[11px] text-blue-100/80 space-y-0.5 list-disc list-inside">
                  <li>{industryDef.label} pipeline + task groups configured</li>
                  <li>Hidden menu groups for features you turned off</li>
                  <li>Starter templates seeded for your industry</li>
                  <li>{propertyCount} property record{propertyCount > 1 ? 's' : ''} created</li>
                  {features.includes('ai_chat') && <li>AI chatbot identity set for {industryDef.label.toLowerCase()}</li>}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
            className="px-4 py-2 text-sm text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
            <ArrowLeft size={14} /> Back
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => Math.min(4, s + 1))}
              disabled={!canAdvance()}
              className="px-5 py-2 bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm disabled:opacity-50 flex items-center gap-1.5">
              {submitting ? 'Setting up…' : <><Zap size={14} /> Launch workspace</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-dark-border last:border-b-0">
      <span className="text-[11px] uppercase tracking-wide font-bold text-gray-500 w-28 flex-shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-white flex-1">{value}</span>
    </div>
  )
}
