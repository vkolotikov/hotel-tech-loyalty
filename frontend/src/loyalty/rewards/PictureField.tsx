import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, mediaUrl } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { rewardsApi, type PictureOwner } from './api'
import { ERRORS } from './errors'
import { megabytes, pictureProblem } from './rewardsMath'
import type { PictureLimits } from './types'
import { PICTURE_PROBLEM_WORDS } from './words'

/**
 * A reward's or an offer's picture in its dialog (release 2 §7): the picture, Add or Replace, and Remove, which asks
 * first inside the dialog (a second Dialog on top would close with this one on Escape). Each change is saved at once
 * by the picture's own endpoint, apart from the form's Save; the server deletes the old file. The limits are the
 * server's; the type and size are checked before sending, the longest side by the server.
 */
export function PictureField({ owner, id, picture, alt, limits, onChange }: {
  owner: PictureOwner
  id: number
  picture: string | null
  /** The reward's name or the offer's title. */
  alt: string
  limits: PictureLimits
  onChange: (url: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const input = useRef<HTMLInputElement>(null)
  const question = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  const upload = useMutation({ mutationFn: (file: File) => rewardsApi.uploadPicture(owner, id, file), onSuccess: (r) => onChange(r.image_url) })
  const remove = useMutation({ mutationFn: () => rewardsApi.removePicture(owner, id), onSuccess: () => { setConfirming(false); onChange(null) } })
  const busy = upload.isPending || remove.isPending
  const vars = { mb: points(megabytes(limits.max_kb), locale), edge: points(limits.max_edge, locale) }
  const failure = upload.isError ? failureOf(upload.error) : remove.isError ? failureOf(remove.error) : null

  // The safe answer takes the focus when the question appears.
  useEffect(() => { if (confirming) question.current?.querySelector('button')?.focus() }, [confirming])

  const choose = (file: File | undefined) => {
    if (!file) return
    const found = pictureProblem(file, limits)
    setProblem(found)
    upload.reset()
    remove.reset()
    if (found === null) upload.mutate(file)
  }

  return (
    <div data-picture="" className="space-y-2">
      <p className="text-xs font-medium text-a-text-2">{t('loyalty.rewards.picture.label', 'Picture')}</p>
      {picture
        ? <img src={mediaUrl(picture)} alt={alt} loading="lazy" className="h-36 w-full rounded-xl border border-a-border bg-a-surface-2 object-cover" />
        : <p className="rounded-xl border border-dashed border-a-border px-4 py-5 text-center text-sm text-a-text-2">{t('loyalty.rewards.picture.none', 'No picture yet.')}</p>}
      <input ref={input} type="file" accept={limits.types.join(',')} className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />

      {confirming ? (
        <div ref={question} className="space-y-2 rounded-xl border border-a-border bg-a-surface-2 p-3">
          <p className="text-sm text-a-text">{t('loyalty.rewards.picture.remove_line', 'Remove the picture? Members will see this without one.')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              {t('loyalty.rewards.picture.keep', 'Keep it')}
            </Button>
            <Button type="button" size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('loyalty.rewards.picture.remove_confirm', 'Remove')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" loading={upload.isPending} disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus size={14} aria-hidden />
            {picture ? t('loyalty.rewards.picture.replace', 'Replace picture') : t('loyalty.rewards.picture.add', 'Add a picture')}
          </Button>
          {picture && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { remove.reset(); setConfirming(true) }}>
              <Trash2 size={14} aria-hidden />{t('loyalty.rewards.picture.remove', 'Remove picture')}
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-a-text-2">{t('loyalty.rewards.picture.hint', 'JPEG, PNG or WebP, up to {{mb}} MB. Saved at once.', vars)}</p>
      {problem && <p className="text-xs font-medium text-a-danger">{t(`loyalty.rewards.picture.problem.${problem}`, PICTURE_PROBLEM_WORDS[problem], vars)}</p>}
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'picture', failure), vars)}</Notice>}
    </div>
  )
}
