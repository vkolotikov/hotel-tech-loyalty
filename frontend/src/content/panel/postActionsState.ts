import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { canMarkPublished, staffLocked } from '../lib/approval'
import { errorKey } from '../lib/errors'
import { postLink } from '../lib/links'
import { copyText } from '../lib/postText'
import type { PostDetail } from '../lib/types'

const LINK = /^https?:\/\/\S+$/i

export interface PostActionsState {
  /** Approvals are on and this person is staff: a manager marks ready and publishes. */
  locked: boolean
  /** This person may mark this post published (spec 2026-10-19 §4.4). */
  publishable: boolean
  /** The post has unsaved edits, or an action is on its way: the actions wait. */
  waits: boolean
  dirty: boolean
  busy: string | null
  error: string | null
  copied: boolean
  linkCopied: boolean
  canManage: boolean
  publishing: boolean
  setPublishing: (open: boolean | ((open: boolean) => boolean)) => void
  url: string
  setUrl: (url: string) => void
  urlOk: boolean
  confirmDelete: boolean
  setConfirmDelete: (open: boolean) => void
  templating: boolean
  setTemplating: (open: boolean) => void
  markReady: () => void
  markPublished: () => void
  duplicate: () => void
  copy: () => void
  copyLink: () => void
  remove: () => void
}

/**
 * What can be done with a saved post (spec §4.3, spec 2026-10-21 §7.2, §7.4): one state the panel shares between the ⋯
 * menu (Duplicate, Copy text, Copy link, Save as template, Delete) and the progress row beside the status (Mark ready,
 * Mark published with its link) — only managers mark ready and publish while the brand's approvals are on, except the
 * post's own poster, who may mark it published. They wait while the post has unsaved edits. No post: nothing to do.
 */
export function usePostActions({ post, dirty, onPost, onDuplicated, onDeleted }: {
  post: PostDetail | null
  dirty: boolean
  onPost: (post: PostDetail) => void
  onDuplicated: (copy: PostDetail) => void
  onDeleted: (id: number) => void
}): PostActionsState {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const locked = staffLocked(boot)
  const publishable = post !== null && canMarkPublished(post, locked, boot.staff.id ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [url, setUrl] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [templating, setTemplating] = useState(false)
  const waits = dirty || busy !== null
  const urlOk = url.trim() === '' || LINK.test(url.trim())

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!linkCopied) return
    const timer = window.setTimeout(() => setLinkCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [linkCopied])

  const act = async (name: string, call: (p: PostDetail) => Promise<void>) => {
    if (post === null) return
    setBusy(name)
    setError(null)
    try {
      await call(post)
    } catch (e) {
      const [key, text] = errorKey('action', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(null)
    }
  }

  return {
    locked, publishable, waits, dirty, busy, error, copied, linkCopied, canManage: boot.staff.can_manage,
    publishing, setPublishing, url, setUrl, urlOk, confirmDelete, setConfirmDelete, templating, setTemplating,
    markReady: () => { void act('ready', async (p) => { onPost((await api.markReady(p.id)).post) }) },
    markPublished: () => { void act('published', async (p) => { onPost((await api.markPublished(p.id, url.trim() === '' ? null : url.trim())).post); setPublishing(false) }) },
    duplicate: () => { void act('duplicate', async (p) => { onDuplicated((await api.duplicatePost(p.id)).post) }) },
    copy: () => { void act('copy', async (p) => { await navigator.clipboard.writeText(copyText(p)); setCopied(true) }) },
    // The post's own link with its brand, so a colleague on another brand opens this post.
    copyLink: () => { void act('link', async (p) => { await navigator.clipboard.writeText(`${window.location.origin}${postLink(p.id, boot.brand?.id ?? null)}`); setLinkCopied(true) }) },
    remove: () => { void act('delete', async (p) => { await api.deletePost(p.id); onDeleted(p.id) }) },
  }
}
