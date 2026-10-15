import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { postHome } from '../lib/links'
import { usePanel } from './PanelProvider'

/**
 * /content/posts/:id — a post's own link (spec §4.3): its week on the Plan
 * with its panel open (a post with no day opens on Posts, among the others
 * with no day). A post of another brand, or one that is gone, says so.
 */
export function PostLink() {
  const { t } = useTranslation()
  const { id } = useParams()
  const postId = Number(id)
  const valid = Number.isInteger(postId) && postId > 0
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const navigate = useNavigate()
  const done = useRef(false)
  const query = useQuery({
    queryKey: ['content', brand, 'post', valid ? postId : null],
    queryFn: () => api.post(postId).then(r => r.post),
    enabled: valid,
    retry: false,
  })
  const post = query.data
  const { open } = panel

  useEffect(() => {
    if (!post || done.current) return
    done.current = true
    open(post.id)
    navigate(postHome(post), { replace: true })
  }, [post, open, navigate])

  if (!valid || query.isError) {
    return (
      <div className="max-w-xl space-y-3 p-6">
        <Notice tone="danger">{t('content.panel.not_found', 'This post no longer exists, or it belongs to another brand.')}</Notice>
        <Link to="/content" className="inline-flex rounded-lg border border-a-border bg-a-surface px-3.5 py-2 text-sm font-semibold text-a-text">
          {t('content.panel.back_to_plan', 'Back to the plan')}
        </Link>
      </div>
    )
  }
  return <p className="p-6 text-sm text-a-text-2" role="status">{t('content.common.loading', 'Loading…')}</p>
}
