import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, BookOpen, ChevronRight, ArrowLeft, ArrowRight, FileText,
  HelpCircle, Brain, Sparkles, X, ChevronDown,
  Globe, Users, Star, CreditCard, Bot, Calendar, Settings2, Bell, Briefcase,
  Gift, Crown, Layers, ShieldCheck, MessageSquare, ClipboardList, GitBranch,
} from 'lucide-react'
import { api } from '../lib/api'

/**
 * DocumentationCenter — the help-center landing for Settings →
 * Help & Docs. Three view modes carried in component state:
 *
 *   landing  — hero search + sectioned card grid + FAQ teaser
 *   section  — 2-pane reader: sidebar with all sections + article
 *              list, right pane with the selected article and
 *              Previous / Next links across articles
 *   faq      — searchable + category-filterable FAQ accordion
 *
 * Data shape (from /v1/admin/documentation):
 *   { sections: [{ slug, title, icon, description, articles: [{ title, content }] }],
 *     faq:      [{ question, answer, category }] }
 *
 * The admin AI's knowledge of the platform also derives from this
 * dataset (DocumentationController::getDocumentationText), so when
 * the backend adds a new section here the AI gets it automatically.
 */

interface DocArticle { title: string; content: string }
interface DocSection { slug: string; title: string; icon: string; description: string; articles: DocArticle[] }
interface DocFaq { question: string; answer: string; category: string }

const ICON_MAP: Record<string, any> = {
  Globe, Users, Star, CreditCard, Bot, Calendar, Settings2, Bell, Briefcase,
  Gift, Crown, Layers, ShieldCheck, MessageSquare, ClipboardList, GitBranch,
  BookOpen, FileText, HelpCircle, Sparkles, Brain,
}

// Section accents — semantic mapping by slug. Falls back to a
// neutral slate when a new section slug appears that we don't have
// a colour for yet. Same vocabulary as the other home grids
// (Settings / Pipeline / etc.) so the whole app feels coherent.
const ACCENT_MAP: Record<string, string> = {
  overview:     '#60a5fa', // blue
  brands:       '#a78bfa', // violet
  crm:          '#f472b6', // pink
  loyalty:      '#fbbf24', // gold
  bookings:     '#34d399', // emerald
  chat:         '#a78bfa', // violet
  ai:           '#c084fc', // purple
  marketing:    '#f97316', // orange
  reviews:      '#fbbf24',
  'content-planner': '#8b5cf6', // purple — matches the Marketing hub tile
  analytics:    '#22d3ee', // cyan
  notifications:'#f97316',
  settings:     '#9ca3af',
  integrations: '#a78bfa',
  members:      '#fbbf24',
  pipelines:    '#f472b6',
  planner:      '#22d3ee',
  branding:     '#60a5fa',
}
const accentFor = (slug: string) => ACCENT_MAP[slug] ?? '#9ca3af'

function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Light Markdown-ish formatter. We keep this very narrow on purpose
// — the docs strings are author-controlled in PHP, so we don't need
// a full Markdown engine.
function formatDocContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 text-[12px] font-mono">$1</code>')
    .replace(/\n- /g, '\n• ')
    .replace(/\n/g, '<br/>')
}

type View = 'landing' | 'section' | 'faq'

export function DocumentationCenter() {
  const { data, isLoading } = useQuery<{ sections: DocSection[]; faq: DocFaq[] }>({
    queryKey: ['admin-documentation'],
    queryFn: () => api.get('/v1/admin/documentation').then(r => r.data),
  })

  const [view, setView] = useState<View>('landing')
  const [search, setSearch] = useState('')
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [activeArticleIdx, setActiveArticleIdx] = useState(0)
  const [faqCat, setFaqCat] = useState<string>('All')

  const sections: DocSection[] = data?.sections ?? []
  const faq: DocFaq[] = data?.faq ?? []
  const faqCategories = useMemo(() => ['All', ...Array.from(new Set(faq.map(f => f.category)))], [faq])

  const q = search.trim().toLowerCase()

  // Cross-section search across both article titles AND content so a
  // user typing "wallet" finds the article whether it's in the title
  // or buried in the body.
  const searchResults = useMemo(() => {
    if (!q) return []
    const hits: { slug: string; sectionTitle: string; articleIdx: number; article: DocArticle; accent: string }[] = []
    for (const s of sections) {
      s.articles.forEach((a, i) => {
        if (a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)) {
          hits.push({ slug: s.slug, sectionTitle: s.title, articleIdx: i, article: a, accent: accentFor(s.slug) })
        }
      })
    }
    return hits
  }, [q, sections])

  const activeSection = sections.find(s => s.slug === activeSlug)
  const activeArticle = activeSection?.articles[activeArticleIdx]
  const accent = activeSlug ? accentFor(activeSlug) : '#9ca3af'

  const openArticle = (slug: string, articleIdx = 0) => {
    setActiveSlug(slug)
    setActiveArticleIdx(articleIdx)
    setView('section')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const backToLanding = () => {
    setView('landing')
    setActiveSlug(null)
    setActiveArticleIdx(0)
  }

  const filteredFaq = useMemo(() => {
    return faq.filter(f =>
      (faqCat === 'All' || f.category === faqCat) &&
      (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
    )
  }, [faq, faqCat, q])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-14 bg-white/[0.04] rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-32 bg-white/[0.04] rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  /* ─── Render ──────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Hero — bigger search bar than a typical settings field so it
          reads as the primary entry point for everything below. */}
      <div className="relative rounded-3xl overflow-hidden p-8 border border-emerald-500/15"
        style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.12), rgba(116,200,149,0.02))' }}>
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'rgba(116,200,149,0.18)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={18} className="text-emerald-400" />
            <span className="text-xs uppercase tracking-[0.18em] font-bold text-emerald-300">Help Center</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
            Everything you can do with Hotel Tech
          </h2>
          <p className="text-sm text-t-secondary max-w-2xl">
            Browse by topic, jump to the exact answer, or ask the AI assistant when documentation isn't enough.
          </p>

          <div className="mt-5 relative max-w-2xl">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400/70" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles, features, FAQ…"
              className="w-full pl-11 pr-10 py-3 rounded-xl bg-dark-bg/70 backdrop-blur border border-white/[0.08] text-white text-sm placeholder:text-t-secondary outline-none focus:border-emerald-500/40 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/[0.08] text-t-secondary hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Inline stats — quick scan of how much is in here. */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-t-secondary">
            <span><strong className="text-white">{sections.length}</strong> sections</span>
            <span><strong className="text-white">{sections.reduce((acc, s) => acc + s.articles.length, 0)}</strong> articles</span>
            <span><strong className="text-white">{faq.length}</strong> FAQ items</span>
          </div>
        </div>
      </div>

      {/* When user is actively searching, show consolidated results
          BEFORE the section grid — answer-first UX. */}
      {q && searchResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for "{search}"
            </h3>
          </div>
          <div className="space-y-2">
            {searchResults.slice(0, 8).map((hit, i) => (
              <button key={i}
                onClick={() => openArticle(hit.slug, hit.articleIdx)}
                className="w-full text-left flex items-start gap-3 p-4 rounded-xl border border-white/[0.06] hover:border-current transition-all group"
                style={{ ['--tw-text-opacity' as any]: 1, background: 'rgba(15,28,24,0.4)' } as any}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = hit.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '' }}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: tint(hit.accent, 0.15), border: `1px solid ${tint(hit.accent, 0.35)}` }}>
                  <FileText size={13} style={{ color: hit.accent }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: hit.accent }}>
                      {hit.sectionTitle}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white mt-0.5 group-hover:text-white">{hit.article.title}</h4>
                  <p className="text-xs text-t-secondary mt-1 line-clamp-2">
                    {hit.article.content.replace(/\*\*/g, '').slice(0, 200)}…
                  </p>
                </div>
                <ChevronRight size={14} className="text-t-secondary group-hover:translate-x-0.5 transition-transform flex-shrink-0 mt-2" />
              </button>
            ))}
          </div>
        </div>
      )}

      {q && searchResults.length === 0 && view === 'landing' && (
        <div className="text-center py-8 px-4 rounded-xl border border-white/[0.06] bg-dark-surface">
          <p className="text-sm text-t-secondary">No articles match "{search}".</p>
          <p className="text-xs text-t-secondary/70 mt-2">Try a different keyword — or scroll down for FAQ.</p>
        </div>
      )}

      {/* View switcher — Docs / FAQ */}
      <div className="flex items-center gap-1 border-b border-dark-border">
        <button
          onClick={() => { setView(activeSlug ? 'section' : 'landing') }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view !== 'faq' ? 'border-emerald-500 text-white' : 'border-transparent text-t-secondary hover:text-white'
          }`}
        >
          <BookOpen size={14} /> Documentation
        </button>
        <button
          onClick={() => setView('faq')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === 'faq' ? 'border-emerald-500 text-white' : 'border-transparent text-t-secondary hover:text-white'
          }`}
        >
          <HelpCircle size={14} /> FAQ
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-t-secondary">{faq.length}</span>
        </button>
      </div>

      {/* ── Docs landing: card grid by section ───────────────── */}
      {view === 'landing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sections.map(section => {
            const IconComp = ICON_MAP[section.icon] || FileText
            const ac = accentFor(section.slug)
            return (
              <button key={section.slug}
                onClick={() => openArticle(section.slug, 0)}
                className="group relative text-left bg-dark-surface border border-dark-border rounded-xl p-4 overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ac
                  e.currentTarget.style.boxShadow = `0 8px 30px ${tint(ac, 0.18)}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: ac }} />
                <span aria-hidden className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none"
                  style={{ background: tint(ac, 0.18) }} />
                <div className="relative flex items-start gap-3">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${tint(ac, 0.18)}, ${tint(ac, 0.04)})`,
                      border: `1px solid ${tint(ac, 0.3)}`,
                    }}>
                    <IconComp size={20} style={{ color: ac }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                    <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">{section.description}</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold mt-2" style={{ color: ac }}>
                      {section.articles.length} article{section.articles.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-t-secondary transition-all flex-shrink-0 mt-1 group-hover:translate-x-0.5" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Docs reader: 2-pane (sidebar + article) ──────────── */}
      {view === 'section' && activeSection && activeArticle && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
          {/* Left rail — all sections, current expanded */}
          <aside className="bg-dark-surface border border-dark-border rounded-xl p-2 lg:sticky lg:top-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
            <button onClick={backToLanding}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-t-secondary hover:text-white rounded-md hover:bg-dark-surface2 transition-colors">
              <ArrowLeft size={12} /> All sections
            </button>
            <div className="h-px bg-dark-border my-2" />
            <div className="space-y-1">
              {sections.map(section => {
                const IconComp = ICON_MAP[section.icon] || FileText
                const ac = accentFor(section.slug)
                const expanded = section.slug === activeSlug
                return (
                  <div key={section.slug}>
                    <button
                      onClick={() => openArticle(section.slug, 0)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                        expanded ? 'bg-dark-surface2 text-white' : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                      }`}
                    >
                      <IconComp size={13} style={{ color: ac }} />
                      <span className="flex-1 text-left truncate">{section.title}</span>
                      <span className="text-[9px] text-t-secondary">{section.articles.length}</span>
                    </button>
                    {expanded && (
                      <div className="ml-7 mt-0.5 mb-1 space-y-0.5 border-l border-dark-border">
                        {section.articles.map((a, i) => {
                          const isActive = i === activeArticleIdx
                          return (
                            <button key={i}
                              onClick={() => { setActiveArticleIdx(i); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                              className={`w-full text-left text-xs px-2.5 py-1.5 -ml-px border-l-2 transition-colors ${
                                isActive
                                  ? 'text-white font-semibold'
                                  : 'text-t-secondary hover:text-white border-transparent'
                              }`}
                              style={isActive ? { borderColor: ac } : {}}
                            >
                              {a.title}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Reader pane */}
          <article className="bg-dark-surface border border-dark-border rounded-xl p-6 md:p-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-t-secondary mb-3">
              <button onClick={backToLanding} className="hover:text-white transition-colors">Help</button>
              <ChevronRight size={11} />
              <span style={{ color: accent }} className="font-semibold">{activeSection.title}</span>
              <ChevronRight size={11} />
              <span className="text-white truncate">{activeArticle.title}</span>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">{activeArticle.title}</h1>
            <p className="text-xs text-t-secondary mb-6">
              From <span style={{ color: accent }} className="font-semibold">{activeSection.title}</span>
              {' · '}Article {activeArticleIdx + 1} of {activeSection.articles.length}
            </p>

            <div className="prose prose-invert max-w-none text-sm text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatDocContent(activeArticle.content) }} />

            {/* Prev / Next within section */}
            {activeSection.articles.length > 1 && (
              <div className="mt-8 pt-6 border-t border-dark-border grid grid-cols-2 gap-3">
                {activeArticleIdx > 0 ? (
                  <button onClick={() => setActiveArticleIdx(activeArticleIdx - 1)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-dark-border hover:border-current transition-colors text-left"
                    style={{ color: accent }}
                  >
                    <ArrowLeft size={14} className="flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-t-secondary">Previous</p>
                      <p className="text-xs font-semibold text-white truncate">{activeSection.articles[activeArticleIdx - 1].title}</p>
                    </div>
                  </button>
                ) : <span />}
                {activeArticleIdx < activeSection.articles.length - 1 ? (
                  <button onClick={() => setActiveArticleIdx(activeArticleIdx + 1)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-dark-border hover:border-current transition-colors text-right justify-end col-start-2"
                    style={{ color: accent }}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-t-secondary">Next</p>
                      <p className="text-xs font-semibold text-white truncate">{activeSection.articles[activeArticleIdx + 1].title}</p>
                    </div>
                    <ArrowRight size={14} className="flex-shrink-0" />
                  </button>
                ) : <span />}
              </div>
            )}
          </article>
        </div>
      )}

      {/* ── FAQ view ─────────────────────────────────────────── */}
      {view === 'faq' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle size={18} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Frequently Asked Questions</h3>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            {faqCategories.map(cat => (
              <button key={cat} onClick={() => setFaqCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  faqCat === cat
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-dark-bg text-t-secondary border border-dark-border hover:text-white hover:bg-dark-surface2'
                }`}>{cat}</button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredFaq.map((item, i) => (
              <details key={i} className="group rounded-xl border border-dark-border hover:border-white/[0.12] transition-colors overflow-hidden">
                <summary className="px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center gap-3 list-none">
                  <ChevronDown size={14} className="text-t-secondary transition-transform group-open:rotate-180 flex-shrink-0" />
                  <span className="text-sm font-medium text-white flex-1">{item.question}</span>
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-t-secondary bg-white/[0.04] px-2 py-0.5 rounded-full flex-shrink-0">
                    {item.category}
                  </span>
                </summary>
                <div className="px-5 pb-4 pt-1 border-t border-dark-border">
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{item.answer}</p>
                </div>
              </details>
            ))}
            {filteredFaq.length === 0 && (
              <p className="text-sm text-t-secondary text-center py-8">
                No FAQ items match your filter.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ask AI CTA — always visible. The admin AI has access to the
          same documentation dataset via DocumentationController, so
          this is meaningfully more capable than search alone. */}
      <div className="relative rounded-2xl border border-purple-500/20 overflow-hidden p-5"
        style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.10), rgba(168,85,247,0.02))' }}>
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'rgba(168,85,247,0.16)' }} />
        <div className="relative flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.35)' }}>
            <Brain size={18} className="text-purple-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">Need more help?</h4>
              <Sparkles size={12} className="text-purple-300" />
            </div>
            <p className="text-xs text-t-secondary mt-1">
              Click the <strong className="text-purple-300">AI Chat button</strong> at the bottom right of any page and ask anything about the platform — setup, troubleshooting, best practices, or how a specific feature works. The AI has read everything on this page and a lot more.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
