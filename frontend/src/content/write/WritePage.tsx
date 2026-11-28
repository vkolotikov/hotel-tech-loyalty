import { ReviewBar } from '../panel/ReviewBar'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { resolveImage } from '../../lib/api'
import { useBoot } from '../ContentProvider'
import { usePanel } from '../panel/PanelProvider'
import { usePostEditor } from '../panel/PostPanel'
import { PostFormFields, PostDetailsFields } from '../panel/PostFormFields'
import { AiTools } from '../panel/AiTools'
import { MoreOutcome } from '../panel/MoreOutcome'
import { PanelMore } from '../panel/PanelMore'
import { ProgressActions } from '../panel/ProgressActions'
import { Timeline } from '../panel/Timeline'
import { VersionsSection } from '../panel/VersionsSection'
import { RepeatSection } from '../panel/RepeatSection'
import { staffLocked, statusChoices } from '../lib/approval'
import { posterChoices } from '../panel/panelState'
import { saveLabelKey } from '../panel/panelMath'
import { PostMedia } from '../media/PostMedia'
import { AssetPreview } from '../media/MediaLibrary'
import { caption, captionLimit, defaultDestination, safeChannel } from './caption'
import { useRetainedState } from '../drafts/useRetainedState'

export function WritePage() {
  const { id } = useParams(), panel = usePanel(), boot = useBoot(), navigate = useNavigate()
  const requested = useRef<string | null>(null)
  const openingForRoute = useRef(false)
  const routeOpening = useRef<number | null>(null)
  useEffect(() => {
    const targetId = panel.target?.kind === 'post' ? String(panel.target.id) : panel.target?.kind === 'new' ? 'new' : null
    // A URL visit (including Back) chooses an opening. Wait for that state update before following target changes.
    if (requested.current !== id) {
      requested.current = id ?? null
      if (id !== 'new' && (!id || !/^\d+$/.test(id))) { navigate('/content/posts', { replace: true }); return }
      if (targetId !== id) {
        openingForRoute.current = true
        const opened = id === 'new' ? panel.openNew({ date: boot.venue.today, platform: null }) : panel.open(Number(id))
        if (!opened) { openingForRoute.current = false; navigate('/content', { replace: true }) }
        return
      }
      openingForRoute.current = false
      routeOpening.current = panel.target?.seq ?? null
      return
    }
    if (openingForRoute.current) {
      if (targetId === id) { openingForRoute.current = false; routeOpening.current = panel.target?.seq ?? null }
      return
    }
    // Duplicate, version selection and New already allocated their target. Reflect it without opening a second draft.
    if (targetId !== id) {
      const replace = targetId === null || (id === 'new' && panel.target?.seq === routeOpening.current)
      requested.current = targetId
      routeOpening.current = panel.target?.seq ?? null
      navigate(targetId === null ? '/content/posts' : `/content/write/${targetId}`, { replace })
    }
  }, [id, panel, boot.venue.today, navigate])
  const editor = usePostEditor()
  const { t } = useTranslation()
  if (!editor) return <p className="p-6" role="status">{t('content.common.loading', 'Loading…')}</p>
  return <Composer key={editor.target.seq} />
}

function Composer() {
  const editor = usePostEditor()!
  const { t, boot, editing, setEditing, post, saving, dirty, save, note, invalid, brandInfo, campaigns, team, pillars, audiences, locale, detail, actions, adopt, conflict, loadTheirs, setConflict, panel } = editor
  const [view, setView] = useState('write'), [copied, setCopied] = useState(false)
  const [include, setInclude] = useRetainedState<boolean | null>(`caption-destination:${editor.target.seq}`, null, false)
  const library = useQuery({ queryKey: ['content', editor.brand, 'media'], queryFn: editor.api.media, enabled: Boolean(editing?.draft.media_ids) })
  if (!editing) return <div className="space-y-3 p-6"><p role="status">{t('content.common.loading', 'Loading…')}</p>{detail.isError && <Button onClick={() => { void detail.refetch() }}>{t('content.common.retry', 'Try again')}</Button>}</div>
  const form = editing.draft
  const setForm = (draft: typeof form) => setEditing(e => e ? { ...e, draft } : e)
  const destination = form.link === post?.link?.destination && post.link.on ? post.link.short_url : safeChannel(form.link)
  const withDestination = include ?? defaultDestination(form.platform)
  const final = caption(form, destination, withDestination), limit = captionLimit(form.platform), count = Array.from(final).length
  const ids = (form.media_ids ?? '').split(',').filter(Boolean).map(Number)
  const assets = ids.map(id => [...(library.data?.media ?? []), ...(post?.media ?? [])].find(m => m.id === id)).filter(m => m !== undefined)
  const channel = safeChannel(brandInfo.data?.channels.find(c => c.platform === form.platform && c.active)?.url)
  const [saveKey, saveText] = saveLabelKey(Boolean(post), form.status, post?.status)
  return <div className="c-composer" data-write-view={view}>
    <header className="c-composer-actions"><h1 className="font-a-display text-2xl text-a-text">{t('content.shell.page_write', 'Write')}</h1><div className="flex flex-wrap gap-2">
      <Link to="/content" className="c-launch-link">{t('content.launch.open_panel', 'Open in panel')}</Link>{post && <PanelMore actions={actions} />}
      <Button loading={saving} disabled={Boolean(post) && !dirty} onClick={() => { void save() }}>{t(saveKey, saveText)}</Button>
    </div></header>
    {note && <Notice tone={note.tone}>{note.text}</Notice>}
    {conflict && <Notice tone="warning">{t('content.panel.conflict', 'Someone else changed this post. Your edits are still here.')} <Button size="sm" onClick={() => { loadTheirs(conflict); setConflict(null) }}>{t('content.panel.conflict_reload', 'Load their version')}</Button></Notice>}
    {post && <MoreOutcome post={post} actions={actions} />}
    {form.status === 'published' && post?.status !== 'published' && <Notice tone="info">{t('content.launch.manual_record', 'This records that you published manually. HexaTech does not send this post to a social network.')}</Notice>}
    <div className="c-write-tabs" role="group" aria-label={t('content.launch.editor_view', 'Editor view')}><Button variant={view === 'write' ? 'primary' : 'secondary'} onClick={() => setView('write')}>{t('content.shell.page_write', 'Write')}</Button><Button variant={view === 'preview' ? 'primary' : 'secondary'} onClick={() => setView('preview')}>{t('content.launch.preview', 'Preview')}</Button></div>
    <div className="c-composer-grid">
      <div className="c-writing-column space-y-5">
        <PostFormFields campaigns={campaigns.data?.campaigns ?? []} details={false} form={form} onChange={setForm} platforms={boot.platforms} statuses={statusChoices(boot.statuses, staffLocked(boot), form.status)} pillars={pillars} audiences={audiences} published={post?.status === 'published'} invalid={invalid} locale={locale} industry={boot.organization.industry} snippets={brandInfo.data?.snippets ?? []} templates={brandInfo.data?.templates ?? []} team={posterChoices(team.data?.team ?? [], post?.poster)} link={post?.link ?? null}
          versions={post ? <><VersionsSection post={post} dirty={dirty} onPost={adopt} group={detail.data?.group ?? post.group ?? null} /><RepeatSection post={post} dirty={dirty} onPost={adopt} series={detail.data?.series ?? post.series ?? null} onGone={() => panel.close()} /></> : null} />
        <PostMedia value={form.media_ids} onChange={media_ids => setForm({ ...form, media_ids })} saved={post?.media ?? []} />
        {post && <AiTools post={post} dirty={dirty} onPost={adopt} onUseCopy={main_copy => setForm({ ...form, main_copy })} />}
        {post && <Timeline post={post} items={detail.data?.timeline ?? null} />}
      </div>
      <aside className="c-preview-column space-y-4" aria-label={t('content.launch.preview', 'Preview')}>
        <h2 className="font-a-display text-xl text-a-text">{t('content.launch.preview', 'Preview')}</h2>
        <article lang={form.language || post?.language || brandInfo.data?.profile?.default_language || 'en'} className="c-caption-preview">
          {assets.map(asset => <AssetPreview key={asset.id} asset={asset} />)}
          {assets.length === 0 && post?.image_url && <img className="c-media-preview" src={resolveImage(post.image_url) ?? ''} alt={t('content.panel.ai.image_alt', 'Image for this post')} />}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-a-text">{final || t('content.launch.preview_empty', 'Your caption will appear here.')}</p>
        </article>
        <p className={limit && count > limit ? 'text-sm text-a-danger' : 'text-sm text-a-text-2'}>{t('content.launch.characters', '{{count}} characters', { count })}{limit ? ` / ${limit}` : ''}</p>
        {limit && count > limit && <Notice tone="warning">{t('content.launch.caption_long', 'This caption exceeds the platform limit. You can still save your draft.')}</Notice>}
        <label className="flex items-center gap-2 text-sm text-a-text"><input type="checkbox" checked={withDestination} onChange={e => setInclude(e.target.checked)} />{t('content.launch.include_destination', 'Include destination URL')}</label>
        {!defaultDestination(form.platform) && <p className="text-xs text-a-text-2">{t('content.launch.bio_hint', 'For Instagram and TikTok, place the destination in your link-in-bio page.')}</p>}
        <p className="text-sm text-a-text-2">{t('content.launch.manual_handoff', 'Publish this post manually on your channel. Copy the caption and open the assets when you are ready.')}</p>
        {destination && <p className="break-all text-xs text-a-text-2">{destination}</p>}
        <Button variant="secondary" disabled={!final.trim()} onClick={() => { void navigator.clipboard.writeText(final).then(() => setCopied(true), () => setCopied(false)) }}>{copied ? t('content.panel.actions.copied', 'Copied') : t('content.launch.copy_caption', 'Copy final caption')}</Button>
        <div className="flex flex-wrap gap-3">{assets.map(asset => <a key={asset.id} href={resolveImage(asset.url) ?? ''} target="_blank" rel="noopener noreferrer" className="c-launch-link">{t('content.launch.open_asset', 'Open asset')}: {asset.name}</a>)}{assets.length === 0 && post?.image_url && <a href={resolveImage(post.image_url) ?? ''} target="_blank" rel="noopener noreferrer" className="c-launch-link">{t('content.launch.open_asset', 'Open asset')}</a>}{channel && <a href={channel} target="_blank" rel="noopener noreferrer" className="c-launch-link">{t('content.launch.open_channel', 'Open channel')}</a>}</div>

      </aside>
      <aside className="c-details-column space-y-4" aria-label={t('content.launch.publishing_details', 'Publishing details')}>
        <h2 className="font-a-display text-lg text-a-text">{t('content.launch.publishing_details', 'Publishing details')}</h2>
        <PostDetailsFields form={form} onChange={setForm} statuses={statusChoices(boot.statuses, staffLocked(boot), form.status)} published={post?.status === 'published'} invalid={invalid} industry={boot.organization.industry} team={posterChoices(team.data?.team ?? [], post?.poster)} />
        {post && <><ReviewBar post={post} dirty={dirty} onPost={adopt} /><ProgressActions post={post} actions={actions} /></>}
      </aside>
    </div>
  </div>
}
