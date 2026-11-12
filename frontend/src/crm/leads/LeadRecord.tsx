import { useTranslation } from 'react-i18next'
import { Target } from 'lucide-react'
import { RecordFrame, RecordPanel, type RecordHostProps } from '../ui/RecordPanel'

/** Placeholder for round 5's lead record panel (the area's work replaces it). */
export function LeadRecordPanel({ id, tab, onTab, onClose, onPrev, onNext }: RecordHostProps) {
  const { t } = useTranslation()
  const title = '#' + id
  return (
    <RecordPanel label={title} onClose={onClose} onPrev={onPrev} onNext={onNext}>
      {(tools, titleId) => (
        <RecordFrame idPrefix="lead-record" titleId={titleId} title={title} tools={tools}
          tabs={[{ key: 'overview', label: t('crm.record.overview', 'Overview'), icon: Target }]} tab={tab ?? 'overview'} onTab={onTab}>
          <p className="text-sm text-a-text-2">{title}</p>
        </RecordFrame>
      )}
    </RecordPanel>
  )
}
