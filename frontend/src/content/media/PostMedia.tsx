import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBrandId } from '../ContentProvider'
import { Button } from '../../workspace/ui/Button'
import type { ContentMedia } from '../lib/launchTypes'
import { AssetPreview, MediaLibrary } from './MediaLibrary'

export function PostMedia({ value, onChange, saved }: { value: string; onChange: (value: string) => void; saved: ContentMedia[] }) {
  const { t } = useTranslation(), api = useApi(), brand = useBrandId()
  const [open, setOpen] = useState(false)
  const query = useQuery({ queryKey: ['content', brand, 'media'], queryFn: api.media, enabled: open || Boolean(value) })
  const ids = (value ?? '').split(',').filter(Boolean).map(Number)
  const rows = [...(query.data?.media ?? []), ...saved]
  const move = (index: number, offset: number) => { const next = [...ids]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next.join(',')) }
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-a-display text-lg text-a-text">{t('content.launch.attachments', 'Post assets')} ({ids.length}/10)</h2><Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{t('content.launch.choose_media', 'Choose media')}</Button></div>
    <ol className="space-y-2">{ids.map((id, index) => { const asset = rows.find(m => m.id === id); return <li key={id} className="c-attached-row">
      {asset && <AssetPreview asset={asset} />}<span className="min-w-0 flex-1 truncate text-sm text-a-text">{asset?.name ?? id}</span>
      <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>{t('content.launch.move_up', 'Move up')}</Button>
      <Button size="sm" variant="ghost" disabled={index === ids.length - 1} onClick={() => move(index, 1)}>{t('content.launch.move_down', 'Move down')}</Button>
      <Button size="sm" variant="ghost" onClick={() => onChange(ids.filter(n => n !== id).join(','))}>{t('content.launch.detach', 'Detach')}</Button>
    </li> })}</ol>
    {open && <MediaLibrary selected={ids} onSelect={next => onChange(next.join(','))} />}
  </section>
}
