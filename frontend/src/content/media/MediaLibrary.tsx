import { FileText, Upload } from 'lucide-react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { resolveImage } from '../../lib/api'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import type { ContentMedia } from '../lib/launchTypes'
import { PageHeader } from '../ui/PageHeader'

export function AssetPreview({ asset }: { asset: ContentMedia }) {
  const url = resolveImage(asset.url) ?? ''
  if (asset.mime.startsWith('image/')) return <img src={url} alt={asset.name} loading="lazy" className="c-media-preview" />
  if (asset.mime.startsWith('video/')) return <video src={url} aria-label={asset.name} controls preload="metadata" className="c-media-preview" />
  return <a href={url} target="_blank" rel="noopener noreferrer" className="c-media-document"><FileText size={32} aria-hidden /><span className="break-all">PDF · {asset.name}</span></a>
}

export function MediaLibrary({ selected, onSelect }: { selected?: number[]; onSelect?: (ids: number[]) => void }) {
  const { t } = useTranslation(), api = useApi(), boot = useBoot(), brand = useBrandId(), client = useQueryClient()
  const query = useQuery({ queryKey: ['content', brand, 'media'], queryFn: api.media })
  const [q, setQ] = useState(''), [archive, setArchive] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const limit = query.data?.max_upload_bytes ?? 0
  const upload = async (file?: File) => {
    if (!file) return
    if (!limit || file.size > limit) { setError(true); return }
    setBusy(true); setError(false)
    try { await api.uploadMedia(file); await client.invalidateQueries({ queryKey: ['content', brand, 'media'] }) }
    catch { setError(true) } finally { setBusy(false) }
  }
  const changeArchive = async (asset: ContentMedia) => {
    setError(false)
    try { await api.archiveMedia(asset.id, !asset.archived); await client.invalidateQueries({ queryKey: ['content', brand, 'media'] }) }
    catch { setError(true) }
  }
  const rows = (query.data?.media ?? []).filter(asset => asset.archived === archive && asset.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
  return <section className="space-y-4" aria-label={t('content.launch.media', 'Media library')}>
    <div className="c-media-toolbar">
      <label className="block text-sm text-a-text-2">{t('content.launch.search_media', 'Search media')}<input className="c-launch-input mt-1" value={q} onChange={e => setQ(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm text-a-text"><input type="checkbox" checked={archive} onChange={e => setArchive(e.target.checked)} />{t('content.launch.archived', 'Archived')}</label>
      <label className="c-upload-button"><Upload size={16} aria-hidden />{t('content.launch.upload', 'Upload asset')}<input type="file" disabled={busy || !limit} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} className="sr-only" /></label>
    </div>
    <p className="text-xs text-a-text-2">{t('content.launch.upload_limit', 'JPEG, PNG, WebP, MP4, WebM or PDF. Up to {{mb}} MB per file.', { mb: Math.floor(limit / 1048576 * 10) / 10 })}</p>
    {(error || query.isError) && <Notice tone="danger">{t('content.launch.media_failed', 'The asset could not be loaded or saved. Check its type and size, then try again.')} <Button size="sm" variant="ghost" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button></Notice>}
    {(busy || query.isLoading) && <p role="status">{t('content.common.loading', 'Loading…')}</p>}
    <div className="c-media-grid">{rows.map(asset => <article className="c-media-item" key={asset.id}>
      <AssetPreview asset={asset} />
      <p className="truncate text-sm font-medium text-a-text" title={asset.name}>{asset.name}</p>
      <p className="text-xs text-a-text-2">{t('content.launch.media_usage', 'Used in {{count}} posts', { count: asset.usage_count })}</p>
      <div className="flex flex-wrap gap-2">
        {onSelect && <Button size="sm" variant="secondary" disabled={!selected?.includes(asset.id) && (asset.archived || (selected?.length ?? 0) >= 10)} onClick={() => onSelect(selected?.includes(asset.id) ? selected.filter(id => id !== asset.id) : [...(selected ?? []), asset.id])}>{selected?.includes(asset.id) ? t('content.launch.detach', 'Detach') : t('content.launch.attach', 'Attach')}</Button>}
        <a href={resolveImage(asset.url) ?? ''} target="_blank" rel="noopener noreferrer" className="text-sm text-a-accent-text">{t('content.launch.open_asset', 'Open asset')}</a>
        {boot.staff.can_manage && <Button size="sm" variant="ghost" onClick={() => { void changeArchive(asset) }}>{asset.archived ? t('content.launch.restore', 'Restore') : t('content.launch.archive', 'Archive')}</Button>}
      </div>
    </article>)}</div>
    {!query.isLoading && rows.length === 0 && <p className="text-sm text-a-text-2">{t('content.launch.no_media', 'No assets here yet. Upload one to reuse in your posts.')}</p>}
  </section>
}
export function MediaPage() {
  const { t } = useTranslation()
  return <div className="space-y-5 p-4 lg:p-6"><PageHeader title={t('content.launch.media', 'Media library')} /><MediaLibrary /></div>
}
