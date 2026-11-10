import { TakeOff } from '../program/TakeOff'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DesignDialog } from '../redesign/DesignUI'
import { OverviewButton } from '../overview/OverviewUI'
import { TierBenefitDialog } from '../program/TierBenefitDialog'
import { FormField } from '../ui/formParts'
import type { Program, Tier, TierBenefit } from '../program/types'
import { useAdminWords } from './words'
import { assignmentChoice } from './assignmentChoice'
import { useRedesignWords } from '../redesign/words'

/** One entrance to the canonical assignment form, with the chosen record pinned for the draft's lifetime. */
export function TierAssignmentEditor({ program, tierId, benefitId, current, onClose }: {
  program: Program; tierId?: number; benefitId?: number; current?: TierBenefit | null; onClose: () => void
}) {
  const say = useAdminWords(), rd = useRedesignWords()
  const [choice, setChoice] = useState(() => assignmentChoice(program.tiers, tierId))
  const [tier, setTier] = useState<Tier | undefined>(() => tierId ? program.tiers.find(t => t.id === tierId) : undefined)
  const [removing, setRemoving] = useState(false)
  const assignment = current ?? tier?.benefits.find(b => b.benefit_id === benefitId) ?? null
  if (tier) return <TierBenefitDialog tier={tier} current={assignment} onRemove={assignment ? () => setRemoving(true) : undefined}
    confirmation={assignment && removing ? <TakeOff tier={tier} tb={assignment} onClose={() => setRemoving(false)} onDone={onClose} /> : undefined}
    initialBenefitId={benefitId} benefits={program.benefits} options={program.options} onClose={onClose} />
  return <DesignDialog title={say('manageAssignment')} onClose={onClose}><div className="l-rd-form">
    <FormField label={say('chooseTier')}><select value={choice} onChange={e => setChoice(e.target.value)}>
      {program.tiers.map(t => <option key={t.id} value={t.id}>{t.name}{!t.is_active && ` · ${rd('off')}`}</option>)}
    </select></FormField>
    {program.tiers.length ? <OverviewButton primary onClick={() => setTier(program.tiers.find(t => String(t.id) === choice))}>{say('manageAssignment')}</OverviewButton>
      : <Link className="l-ov-link" to="/loyalty/program?tab=tiers&tier=new">{say('reviewLevels')}</Link>}
  </div></DesignDialog>
}
