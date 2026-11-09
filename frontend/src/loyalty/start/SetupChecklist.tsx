import { Check, Circle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { knownSteps } from './startMath'
import { STEP_TO } from './startMath'
import { STEP_TITLE_WORDS } from './words'
import type { StartAnswer } from './startMath'
import './setup-checklist.css'

/** The same real server steps on desktop and mobile, including programmes pre-seeded during registration. */
export function SetupChecklist({ setup }: { setup: StartAnswer }) {
  const { t } = useTranslation(), boot = useBoot()
  if (!boot.staff.can.manage_program || setup.done >= setup.total) return null
  return <section className="l-ov-panel l-setup-checklist" aria-labelledby="first-steps-title">
    <header><div><h2 id="first-steps-title"><Sparkles size={20} aria-hidden />{t('loyalty.launchpolish.firstSteps')}</h2><p>{t('loyalty.overview.setupProgress', { done: setup.done, total: setup.total })}</p></div><Link className="l-ov-button l-ov-primary" to="/loyalty/options/setup">{t('loyalty.redesign.guidedSetup', 'Guided setup')}</Link></header>
    <ol>{knownSteps(setup).map(step => <li key={step.key} data-done={step.done || undefined}><Link to={STEP_TO[step.key]}>{step.done ? <Check size={17} aria-hidden /> : <Circle size={17} aria-hidden />}<span>{t(`loyalty.start.step_title.${step.key}`, STEP_TITLE_WORDS[step.key] ?? step.key)}</span></Link></li>)}</ol>
    <Link className="l-ov-link" to="/loyalty/start">{t('loyalty.overview.checklist', 'Open setup checklist')} →</Link>
  </section>
}
