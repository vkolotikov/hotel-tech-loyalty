import { api } from '../../lib/api'
import type {
  Audience, AudienceFields, Bootstrap, BrandPayload, Channel, ChannelFields, DateKey, GenerateBody, GenerateResult, PlanPayload, Platform,
  PostCard, PostDetail, PostFields, PostFilters, PostsPage, ProfileFields, Quality, QuickSetupBody, Rewrite, StrategyDetail, StrategySummary,
  Variation, VoiceFields,
} from './types'

/**
 * Every call HexaTech Content makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path in this folder.
 */
const BASE = '/v1/admin/content'

/**
 * The address of a call, carrying the brand the portal works on (spec §6.7).
 * The full admin's request hook (src/lib/api.ts) adds its own brand choice to
 * any address without `brand_id=`; one that names it is left alone, so even
 * "no brand yet" is written out (empty: the person's default brand).
 */
export function contentUrl(path: string, brand: number | null): string {
  return `${BASE}/${path}${path.includes('?') ? '&' : '?'}brand_id=${brand ?? ''}`
}

const offListeners = new Set<() => void>()

/**
 * Be told when a call is refused because Content was switched off, or the
 * subscription lapsed, while this window was open: the provider asks for the
 * bootstrap again, whose own refusal puts the shell's notice on screen.
 * Returns the unsubscribe.
 */
export function onWorkspaceOff(listener: () => void): () => void {
  offListeners.add(listener)
  return () => { offListeners.delete(listener) }
}

/** Every call but the bootstrap goes through here; the failure is passed on untouched. */
function watched<T>(request: Promise<{ data: T }>): Promise<T> {
  return request.then(r => r.data, (error: unknown) => {
    const code = failureOf(error).code
    if (code === 'workspace_disabled' || code === 'subscription_required') offListeners.forEach(listener => listener())
    throw error
  })
}

/** The posts filters as `GET posts` takes them: only those that hold something, the page only after the first. */
export function postsParams(filters: PostFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const q = filters.q.trim()
  if (q !== '') out.q = q
  if (filters.status !== '') out.status = filters.status
  if (filters.platform !== '') out.platform = filters.platform
  if (filters.pillar_id !== null) out.pillar_id = filters.pillar_id
  if (filters.from !== '') out.from = filters.from
  if (filters.to !== '') out.to = filters.to
  if (filters.unscheduled) out.unscheduled = 1
  if (filters.page > 1) out.page = filters.page
  return out
}

/** The calls for one brand (the bootstrap's brand; null before it is known). */
export function contentApi(brand: number | null) {
  const url = (path: string) => contentUrl(path, brand)
  return {
    bootstrap: (): Promise<Bootstrap> => api.get(url('bootstrap')).then(r => r.data),

    plan: (from: DateKey, to: DateKey): Promise<PlanPayload> => watched(api.get(url('plan'), { params: { from, to } })),
    find: (q: string): Promise<{ posts: PostCard[] }> => watched(api.get(url('find'), { params: { q } })),

    post: (id: number): Promise<{ post: PostDetail }> => watched(api.get(url(`posts/${id}`))),
    createPost: (body: PostFields & { platform: Platform }): Promise<{ post: PostDetail }> => watched(api.post(url('posts'), body)),
    savePost: (id: number, body: PostFields & { updated_at: string }): Promise<{ post: PostDetail }> => watched(api.put(url(`posts/${id}`), body)),
    movePost: (id: number, body: { updated_at: string; scheduled_date: DateKey | null; scheduled_time?: string | null }): Promise<{ post: PostCard }> =>
      watched(api.post(url(`posts/${id}/move`), body)),
    duplicatePost: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/duplicate`))),
    markReady: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/mark-ready`))),
    markPublished: (id: number, publishedUrl: string | null): Promise<{ post: PostDetail }> =>
      watched(api.post(url(`posts/${id}/mark-published`), { published_url: publishedUrl })),
    deletePost: (id: number): Promise<{ deleted: boolean }> => watched(api.delete(url(`posts/${id}`))),

    write: (id: number, instructions: string | null): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/write`), { instructions })),
    rewrite: (id: number, type: Rewrite, guidance: string | null): Promise<{ variation: Variation }> =>
      watched(api.post(url(`posts/${id}/rewrite`), { type, guidance })),
    quality: (id: number): Promise<{ quality: Quality; post: PostDetail }> => watched(api.post(url(`posts/${id}/quality`))),
    visualBrief: (id: number): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/visual-brief`))),
    image: (id: number, instructions: string | null): Promise<{ post: PostDetail }> => watched(api.post(url(`posts/${id}/image`), { instructions })),

    fill: (date: DateKey, platform: Platform): Promise<{ post: PostDetail }> => watched(api.post(url('slots/fill'), { date, platform })),
    /** A run that wrote nothing answers 503 with the same report: a result to show, not a failure to explain. */
    generate: (body: GenerateBody): Promise<GenerateResult> => watched(api.post(url('generate'), body).catch((error: unknown) => {
      const response = (error as { response?: { status?: number; data?: { status?: string } } }).response
      if (response?.status === 503 && response.data?.status === 'failed') return { data: response.data as GenerateResult }
      throw error
    })),

    strategies: (): Promise<{ strategies: StrategySummary[] }> => watched(api.get(url('strategies'))),
    strategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.get(url(`strategies/${id}`))),
    brand: (): Promise<BrandPayload> => watched(api.get(url('brand'))),

    posts: (filters: PostFilters): Promise<PostsPage> => watched(api.get(url('posts'), { params: postsParams(filters) })),

    createStrategy: (instructions: string | null): Promise<{ strategy: StrategySummary }> =>
      watched(api.post(url('strategies'), instructions ? { instructions } : {})),
    activateStrategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.post(url(`strategies/${id}/activate`))),
    archiveStrategy: (id: number): Promise<{ strategy: StrategyDetail }> => watched(api.post(url(`strategies/${id}/archive`))),

    saveProfile: (fields: ProfileFields): Promise<BrandPayload> => watched(api.put(url('brand/profile'), fields)),
    saveVoice: (fields: VoiceFields): Promise<BrandPayload> => watched(api.put(url('brand/voice'), fields)),
    createAudience: (fields: AudienceFields): Promise<BrandPayload & { audience: Audience }> => watched(api.post(url('brand/audiences'), fields)),
    updateAudience: (id: number, fields: AudienceFields): Promise<BrandPayload & { audience: Audience }> =>
      watched(api.put(url(`brand/audiences/${id}`), fields)),
    /** `confirm`: the manager said yes to removing an audience posts use (it answers 409 `audience_in_use` with their number first). */
    deleteAudience: (id: number, confirm: boolean): Promise<BrandPayload> =>
      watched(api.delete(url(`brand/audiences/${id}${confirm ? '?confirm=1' : ''}`))),
    createChannel: (fields: ChannelFields): Promise<BrandPayload & { channel: Channel }> => watched(api.post(url('brand/channels'), fields)),
    updateChannel: (id: number, fields: ChannelFields): Promise<BrandPayload & { channel: Channel }> =>
      watched(api.put(url(`brand/channels/${id}`), fields)),
    deleteChannel: (id: number): Promise<BrandPayload> => watched(api.delete(url(`brand/channels/${id}`))),
    /** One AI call that sets the brand up (minutes, not seconds); the brand comes back set up, with the AI's assumptions. */
    quickSetup: (body: QuickSetupBody): Promise<BrandPayload & { assumptions: string[] }> => watched(api.post(url('brand/quick-setup'), body)),
    finishSetup: (): Promise<BrandPayload> => watched(api.post(url('brand/setup'))),
    refreshKnowledge: (): Promise<BrandPayload> => watched(api.post(url('brand/refresh-knowledge'))),
  }
}

export type ContentApi = ReturnType<typeof contentApi>

export interface ApiFailure {
  status: number
  /** The refusal's snake_case code; `invalid` for a refused form; `unknown` for any other body; `network` when no answer came; '' for none. */
  code: string
  message: string
  /** A stale save's post as it is now (`changed_elsewhere`). */
  post?: PostDetail
  /** A refused form's messages by field (Laravel's `errors`). */
  fields?: Record<string, string[]>
  /** An audience_in_use refusal: how many posts use the audience. */
  posts?: number
}

/** What went wrong, from an axios error (or anything else that was thrown). Pure: no i18n, no side effects. */
export function failureOf(error: unknown): ApiFailure {
  if (!error) return { status: 0, code: '', message: '' }

  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (!response) return { status: 0, code: 'network', message: error instanceof Error ? error.message : '' }

  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const snake = (v: unknown): v is string => typeof v === 'string' && /^[a-z_]+$/.test(v)
  // The shared brand middleware keeps its sentence in `error` and its code in `code` (brand_not_allowed).
  const fields = data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined
  const code = snake(data.code) ? data.code : snake(data.error) ? data.error : fields ? 'invalid' : 'unknown'

  return {
    status: response.status ?? 0,
    code,
    message: typeof data.message === 'string' ? data.message : '',
    ...(data.post && typeof data.post === 'object' ? { post: data.post as PostDetail } : {}),
    ...(typeof data.posts === 'number' ? { posts: data.posts } : {}),
    ...(fields ? { fields } : {}),
  }
}
