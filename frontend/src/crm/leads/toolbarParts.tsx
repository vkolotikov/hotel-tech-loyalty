import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Download, FileSpreadsheet, FileText, Loader2, type LucideIcon } from 'lucide-react'
import { ActionMenu, Popover } from '../ui/Menu'
import type { ExportFormat } from './leadLogic'

/**
 * The list toolbars' small tools (round 5, owner 2026-11-12: "minimize copy, more icons"), shared by Leads and Deals:
 * a tool is its icon with its name as the tooltip, a count beside it when it holds some.
 */
export const TOOL = 'relative inline-grid h-10 w-10 place-items-center rounded-xl border border-a-border bg-a-surface text-a-text-2 transition-colors hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50'

/** A count on a tool's corner (the saved views). */
export function ToolCount({ n }: { n: number }) {
  if (n <= 0) return null
  return <span aria-hidden className="absolute -right-1 -top-1 min-w-4 rounded-full bg-a-accent px-1 text-center text-xs font-semibold leading-4 text-a-accent-ink">{n}</span>
}

/** A tool that opens a small panel (the columns, the saved views): its icon, its name as the tooltip. */
export function ToolPopover({ label, icon: Icon, count = 0, align = 'right', width, children }: {
  label: string
  icon: LucideIcon
  count?: number
  align?: 'left' | 'right'
  width?: string
  children: ReactNode
}) {
  return (
    <span title={label} className="inline-flex">
      <Popover label={label} align={align} width={width} className={TOOL} button={<><Icon size={16} aria-hidden /><ToolCount n={count} /></>}>
        {children}
      </Popover>
    </span>
  )
}

/** The list's file, as the full admin's export gives it: a styled Excel workbook, or plain CSV for other tools. */
export function ExportMenu({ onExport, busy }: { onExport: (format: ExportFormat) => void; busy: boolean }) {
  const { t } = useTranslation()
  const label = t('crm.leads.export_short', 'Export')
  return (
    <span title={label} className="inline-flex">
      <ActionMenu label={label} className={TOOL}
        button={busy ? <Loader2 size={16} aria-hidden className="animate-spin" /> : <Download size={16} aria-hidden />}
        items={[
          { heading: t('crm.leads.export_heading', 'Every page, as a file') },
          { key: 'xlsx', label: t('crm.leads.export_xlsx', 'Excel (.xlsx)'), icon: FileSpreadsheet, disabled: busy, onSelect: () => onExport('xlsx') },
          { key: 'csv', label: t('crm.leads.export_csv', 'CSV (.csv)'), icon: FileText, disabled: busy, onSelect: () => onExport('csv') },
        ]} />
    </span>
  )
}

/** The list's order as a menu of choices, the current one ticked. */
export function SortMenu<T extends string>({ value, choices, label, word, onChange }: {
  value: T
  choices: readonly T[]
  label: string
  word: (choice: T) => string
  onChange: (next: T) => void
}) {
  return (
    <span title={`${label}: ${word(value)}`} className="inline-flex">
      <ActionMenu label={`${label}: ${word(value)}`} className={TOOL} button={<ArrowDownUp size={16} aria-hidden />}
        items={[{ heading: label }, ...choices.map(choice => ({ key: choice, label: word(choice), checked: choice === value, onSelect: () => onChange(choice) }))]} />
    </span>
  )
}
