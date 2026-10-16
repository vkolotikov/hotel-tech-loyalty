import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { addDays, formatDate } from '../../../workspace/lib/wallClock'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { suggestedTimes, usualTime } from '../../lib/bestTimes'
import { errorKey } from '../../lib/errors'
import { LANGUAGES, languageName } from '../../lib/languages'
import { CHANNEL_DAYS, EMOJI_POLICIES, HASHTAG_POLICIES, optionText } from '../../lib/options'
import { refreshLists } from '../../lib/planCache'
import type { BrandPayload, Channel, Platform } from '../../lib/types'
import { PlatformMark } from '../../ui/PlatformMark'
import { asDays } from '../brandForms'
import { Segmented, SelectField, TagInput, TextField, INPUT } from '../inputs'
import { channelForm, removeChannel, saveChannel, type ChannelForm } from '../listActions'
import { useBrand } from '../useBrand'

/** A Monday: posting days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'
const dayShort = (i: number, locale: string) => formatDate(addDays(A_MONDAY, i), locale, { weekday: 'short' })

function ChannelEditor({ channel, onDone, onCancel }: { channel: Channel | null; onDone: () => void; onCancel: (() => void) | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { brand, adopt } = useBrand()
  // The form as it was opened: Save sends only what changed since (not what someone else changed meanwhile).
  // A new channel is named after its platform in the reader's words ("LinkedIn", not "linkedin").
  const [base] = useState<ChannelForm>(() => {
    const first = boot.platforms[0] ?? 'instagram'
    return channelForm(channel, first, t(`content.platform.${first}`, first))
  })
  const [form, setForm] = useState<ChannelForm>(base)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.channels.${key}`, english)
  const set = (part: Partial<ChannelForm>) => setForm({ ...form, ...part })
  const choices = (group: 'emoji' | 'hashtag', map: Record<string, string>) => Object.keys(map).map(v => [v, optionText(t, group, v)] as [string, string])

  const save = async () => {
    if (form.label.trim() === '') {
      setError(w('label_required', 'Give the channel a name.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveChannel({ api, adopt, refresh: () => { void refreshLists(queryClient, brandId) } }, channel, form, base)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-a-border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        {channel === null
          ? <SelectField label={w('platform', 'Platform')} value={form.platform} empty="—" options={boot.platforms.map(p => [p, t(`content.platform.${p}`, p)])}
              onChange={(platform) => {
                if (platform === '') return
                // A name still equal to the old platform's follows the new platform; a name the manager typed stays.
                const oldName = t(`content.platform.${form.platform}`, form.platform)
                set({ platform: platform as Platform, label: form.label === oldName ? t(`content.platform.${platform}`, platform) : form.label })
              }} />
          : <p className="flex items-center gap-2 text-sm text-a-text"><PlatformMark platform={channel.platform} />{t(`content.platform.${channel.platform}`, channel.platform)}</p>}
        <TextField label={w('label', 'Name')} value={form.label} maxLength={255} required onChange={(label) => set({ label })} />
        <TextField label={w('url', 'Link')} value={form.url} maxLength={255} onChange={(url) => set({ url })} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('posts_per_week', 'Posts per week')}</span>
          <input type="number" min={0} max={21} value={form.posts_per_week} onChange={(e) => set({ posts_per_week: e.target.value })} className={`${INPUT} border-a-border`} />
        </label>
        <div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{w('post_time', 'Usual posting time')}</span>
            <input type="time" value={form.post_time} onChange={(e) => set({ post_time: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
          <div role="group" aria-label={w('post_time_suggested', 'Suggested times')} className="mt-1.5 flex flex-wrap gap-1">
            {suggestedTimes(form.platform, boot.organization.industry).map(time => (
              <button key={time} type="button" aria-pressed={form.post_time === time} onClick={() => set({ post_time: form.post_time === time ? '' : time })}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${form.post_time === time ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>{time}</button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-a-text-2">
            {t('content.brand.channels.post_time_hint', 'Left empty, posts start at {{time}}.', { time: suggestedTimes(form.platform, boot.organization.industry)[0] ?? '' })}
          </span>
        </div>
        <div className="md:col-span-2" role="group" aria-label={w('days', 'Posting days')}>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{w('days', 'Posting days')}</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_DAYS.map((day, i) => (
              <button key={day} type="button" aria-pressed={form.days[day]} onClick={() => set({ days: { ...form.days, [day]: !form.days[day] } })}
                className={`min-w-[3rem] rounded-full border px-2.5 py-1 text-xs font-medium ${form.days[day] ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                {dayShort(i, locale)}
              </button>
            ))}
          </div>
        </div>
        <SelectField label={w('audience', 'Audience')} value={form.audience_id} empty={w('audience_none', 'All audiences')}
          options={(brand?.audiences ?? []).map(a => [String(a.id), a.name])} onChange={(audience_id) => set({ audience_id })} />
        <TagInput label={w('formats', 'Formats')} values={form.preferred_formats} onChange={(preferred_formats) => set({ preferred_formats })} />
        <Segmented label={t('content.brand.voice.emoji', 'Emoji')} options={choices('emoji', EMOJI_POLICIES)} value={form.emoji_policy} onChange={(emoji_policy) => set({ emoji_policy })} />
        <Segmented label={t('content.brand.voice.hashtags', 'Hashtags')} options={choices('hashtag', HASHTAG_POLICIES)} value={form.hashtag_policy} onChange={(hashtag_policy) => set({ hashtag_policy })} />
        <TextField label={w('goal', 'Goal')} value={form.goal} rows={2} onChange={(goal) => set({ goal })} />
        <TextField label={w('role', 'Role of the channel')} value={form.role} rows={2} onChange={(role) => set({ role })} />
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-a-accent-text">{w('more', 'More rules')}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextField label={w('cta_style', 'Call-to-action style')} value={form.cta_style} onChange={(cta_style) => set({ cta_style })} />
          <TextField label={w('visual_style', 'Visual style')} value={form.visual_style} onChange={(visual_style) => set({ visual_style })} />
          <TextField label={w('link_policy', 'Links')} value={form.link_policy} onChange={(link_policy) => set({ link_policy })} />
          <TextField label={w('tone_override', 'Tone on this channel')} value={form.tone_override} onChange={(tone_override) => set({ tone_override })} />
          <SelectField label={w('language', 'Language')} value={form.default_language} empty={w('language_brand', 'The brand language')}
            options={LANGUAGES.map(code => [code, languageName(code, locale)])} onChange={(default_language) => set({ default_language })} />
        </div>
      </details>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>}
      </div>
    </div>
  )
}

/**
 * Channels (spec §4.6): where the brand posts, on which days and how often —
 * the Plan's empty slots come from here, so every change reads the Plan
 * again. Each keeps its id; a switch turns one off without losing it.
 */
export function ChannelsSection({ brand, canEdit, startOpen = false, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(() => (startOpen && canEdit && brand.channels.length === 0 ? 'new' : null))
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const w = (key: string, english: string) => t(`content.brand.channels.${key}`, english)
  const deps = { api, adopt, refresh: () => { void refreshLists(queryClient, brandId) } }

  const run = async (action: () => Promise<void>, success: string | null) => {
    setNote(null)
    try {
      await action()
      if (success) setNote({ tone: 'success', text: success })
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    }
  }
  const done = () => { setOpen(null); onSaved?.() }
  const daysText = (channel: Channel) => {
    const days = asDays(channel.frequency)
    const on = CHANNEL_DAYS.map((day, i) => (days[day] ? dayShort(i, locale) : null)).filter(Boolean)
    return on.length > 0 ? on.join(', ') : w('no_days', 'No posting days')
  }

  return (
    <section aria-labelledby="content-channels" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-channels" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Channels')}</h2>
          <p className="text-sm text-a-text-2">{w('intro', 'Where the brand posts, on which days and how often. The empty slots on the Plan come from here.')}</p>
        </div>
        {canEdit && open === null && <Button size="sm" variant="secondary" onClick={() => setOpen('new')}><Plus size={14} aria-hidden />{w('add', 'Add channel')}</Button>}
      </div>
      {brand.channels.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{w('none', 'No channel yet. Add one to plan posts.')}</p>}
      <ul className="space-y-3">
        {brand.channels.map(channel => (
          <li key={channel.id}>
            {open === channel.id
              ? <ChannelEditor channel={channel} onDone={done} onCancel={() => setOpen(null)} />
              : (
                // A switched-off channel says so in words, with a dashed edge: fading the row put its buttons under 4.5:1.
                // The words keep 12rem (basis-48): on a phone the switch and buttons wrap below them instead of squeezing them.
                <div className={`flex flex-wrap items-center gap-3 rounded-lg border border-a-border p-3 ${channel.active ? '' : 'border-dashed'}`}>
                  <PlatformMark platform={channel.platform} />
                  <div className="min-w-0 grow basis-48">
                    <p className="truncate text-sm font-semibold text-a-text">
                      {channel.label}
                      {canEdit && !channel.active && <span className="ml-2 text-xs font-normal text-a-text-2">{w('off', 'Off')}</span>}
                    </p>
                    <p className="text-xs text-a-text-2">
                      {daysText(channel)}
                      {channel.posts_per_week ? ` · ${t('content.brand.channels.per_week', 'posts a week: {{count}}', { count: channel.posts_per_week })}` : ''}
                      {usualTime(channel, boot.organization.industry) ? ` · ${t('content.brand.channels.usual_at', 'usually at {{time}}', { time: usualTime(channel, boot.organization.industry) })}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <button type="button" role="switch" aria-checked={channel.active}
                      aria-label={t('content.brand.channels.switch', 'Posting on {{channel}}', { channel: channel.label })}
                      onClick={() => { void run(() => saveChannel(deps, channel, { ...channelForm(channel, channel.platform), active: !channel.active }), null) }}
                      className={`relative h-6 w-11 rounded-full transition ${channel.active ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${channel.active ? 'left-[1.375rem]' : 'left-0.5'}`} />
                    </button>
                  ) : (
                    <span className="rounded-full border border-a-border px-2 py-0.5 text-xs text-a-text-2">{channel.active ? w('on', 'On') : w('off', 'Off')}</span>
                  )}
                  {canEdit && open === null && (
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(channel.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (window.confirm(w('remove_confirm', 'Remove this channel? Its empty slots leave the Plan.'))) void run(() => removeChannel(deps, channel.id), w('removed', 'Channel removed.'))
                      }}>{w('remove', 'Remove')}</Button>
                    </span>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {open === 'new' && <ChannelEditor channel={null} onDone={done} onCancel={onSaved ? null : () => setOpen(null)} />}
      {note && <p role="status" className={`text-sm ${note.tone === 'danger' ? 'text-a-danger' : 'text-a-text-2'}`}>{note.text}</p>}
    </section>
  )
}
