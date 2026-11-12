import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OverviewButton } from '../overview/OverviewUI'
import { overviewAssets } from '../overview/assets'
import { adminAssets, type AdminAsset } from './assets'
import { focusManagementSelection } from './selection'
import './management.css'

export function ManagementIcon({ kind, tone = 'cyan' }: { kind: AdminAsset; tone?: string }) {
  const asset = adminAssets[kind]
  return <span className="l-ad-icon" data-tone={tone} aria-hidden><img src={asset.src} width={asset.width} height={asset.height} alt="" /></span>
}
export function ManagementHeading({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return <header className="l-ad-heading"><div><h1>{title}</h1><p>{line}</p></div><div className="l-ad-actions">{children}</div></header>
}
export function ManagementColumns({ children }: { children: ReactNode }) { return <div className="l-ad-columns">{children}</div> }
export function ManagementPanel({ title, count, children, className = '' }: { title: string; count?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`l-ad-panel ${className}`}><header className="l-ad-panel-head"><h2>{title}</h2>{count != null && <small>{count}</small>}</header>{children}</section>
}
export function ManagementStatus({ state = 'active', children }: { state?: string; children: ReactNode }) {
  const good = ['active', 'live', 'fulfilled'].includes(state), warn = ['unassigned', 'missing', 'upcoming', 'warn'].includes(state)
  return <span className="l-ad-status" data-tone={good ? 'green' : warn ? 'amber' : 'neutral'}><img src={good ? adminAssets.activeDot.src : warn ? adminAssets.warningDot.src : overviewAssets.neutral} width={5} height={5} alt="" />{children}</span>
}
export function ManagementSelection({ title, heading = title, status, onEdit, children }: { title: string; heading?: string; status?: ReactNode; onEdit?: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return <aside className="l-ad-panel l-ad-detail" id="management-detail" tabIndex={-1} aria-label={title}>
    <header className="l-ad-panel-head"><h2>{heading}</h2><div className="l-ad-actions">{status}{onEdit && <OverviewButton type="button" aria-label={`${t('loyalty.program.edit', 'Edit')} ${title}`} onClick={onEdit}>{t('loyalty.program.edit', 'Edit')}</OverviewButton>}</div></header>{children}
  </aside>
}
export function ManagementVisual({ art, label, title, line, tone = 'violet', children }: { art: AdminAsset; label: string; title: ReactNode; line?: ReactNode; tone?: string; children?: ReactNode }) {
  const asset = adminAssets[art]
  return <div className="l-ad-visual" data-tone={tone}><div className="l-ad-visual-copy"><small>{label}</small><strong>{title}</strong>{line && <p>{line}</p>}{children}</div><span className="l-ad-art" aria-hidden><img src={asset.src} width={asset.width} height={asset.height} alt="" /></span></div>
}
export function ManagementRow({ icon, title, caption, value, status, selected, onSelect, tone, record }: { icon: AdminAsset; title: string; caption?: ReactNode; value?: ReactNode; status?: ReactNode; selected: boolean; onSelect: () => void; tone?: string; record?: string }) {
  const select = () => {
    onSelect()
    focusManagementSelection()
  }
  return <li className="l-ad-row" data-record={record} data-selected={selected || undefined}><button type="button" aria-pressed={selected} onClick={select}><span className="l-ad-identity"><ManagementIcon kind={icon} tone={tone} /><span className="l-ad-row-name"><strong>{title}</strong>{caption && <small>{caption}</small>}</span></span><span className="l-ad-row-value">{value}</span><span className="l-ad-row-status">{status}</span><img className="l-ad-chevron" src={adminAssets.chevron.src} width={16} height={16} alt="" /></button></li>
}
export function ManagementLabels({ first, value, status }: { first: string; value: ReactNode; status: string }) {
  return <div className="l-ad-labels" aria-hidden><span>{first}</span><span>{value}</span><span>{status}</span><span /></div>
}
export function ManagementFact({ icon, label, children }: { icon: AdminAsset; label: string; children: ReactNode }) {
  return <div className="l-ad-fact"><ManagementIcon kind={icon} /><div><small>{label}</small><div>{children}</div></div></div>
}
export function ManagementOutcome({ from, to, label }: { from: ReactNode; to: ReactNode; label: string }) {
  return <div className="l-ad-outcome"><small>{label}</small><div><span>{from}</span><img src={adminAssets.arrow.src} width={16} height={16} alt="" /><strong>{to}</strong></div></div>
}
