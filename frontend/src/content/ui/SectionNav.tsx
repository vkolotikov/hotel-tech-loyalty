import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function SectionNav({ items, selected }: { items: { key: string; label: string }[]; selected: string }) {
  const [params, setParams] = useSearchParams(), { t } = useTranslation()
  const select = (key: string) => { const next = new URLSearchParams(params); next.set('section', key); setParams(next) }
  return <nav className="c-section-nav" aria-label={t('content.launch.sections', 'Sections')}>
    <label className="c-section-select text-sm text-a-text-2">{t('content.launch.sections', 'Sections')}<select className="c-launch-input" value={selected} onChange={e => select(e.target.value)}>{items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <div className="c-section-links">{items.map(item => <button key={item.key} type="button" aria-current={selected === item.key ? 'page' : undefined} className="c-section-link" onClick={() => select(item.key)}>{item.label}</button>)}</div>
  </nav>
}
