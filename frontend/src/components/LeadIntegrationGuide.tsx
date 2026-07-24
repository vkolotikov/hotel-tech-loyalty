import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Check, Copy, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

/**
 * Self-service integration guide for the public lead-intake API.
 *
 * Lets any user grab a ready-to-use snippet (or a full copy-paste document
 * for a developer / AI) to connect their website forms to the CRM. Fills in
 * the real endpoint, the org's brand IDs, and — optionally — a token the
 * user pastes in, so the examples are runnable as-is.
 */

const TOKEN_PLACEHOLDER = 'YOUR_API_TOKEN'

type BrandLite = { id: number; name: string; is_default?: boolean }
type Tab = 'guide' | 'curl' | 'web'

export function LeadIntegrationGuide({ initialToken }: { initialToken?: string }) {
  const [token, setToken] = useState(initialToken ?? '')
  const [tab, setTab] = useState<Tab>('guide')
  const [copied, setCopied] = useState<string | null>(null)

  // A freshly created token flows in from the parent — adopt it so the
  // examples are immediately runnable.
  useEffect(() => { if (initialToken) setToken(initialToken) }, [initialToken])

  const { data: brandsResp } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get<{ data: BrandLite[] }>('/v1/admin/brands').then(r => r.data),
  })
  const brands: BrandLite[] = brandsResp?.data ?? []

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://loyalty.hotel-tech.ai'
  const endpoint = `${origin}/api/v1/integrations/leads`
  const tok = token.trim() || TOKEN_PLACEHOLDER
  const defaultBrand = brands.find(b => b.is_default) ?? brands[0]
  const exampleBrandId = defaultBrand?.id ?? 1

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 2000); toast.success('Copied') })
      .catch(() => toast.error('Could not copy'))
  }

  /* ─── Snippets ─────────────────────────────────────────────────── */

  const curl = useMemo(() => `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${tok}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{
    "external_source": "website_form",
    "brand_id": ${exampleBrandId},
    "contact": { "name": "Jane Doe", "email": "jane@example.com", "phone": "+371..." }
  }'`, [endpoint, tok, exampleBrandId])

  const web = useMemo(() => `<!-- 1) The form on your website (one hidden brand_id per brand) -->
<form id="lead-form">
  <input type="hidden" name="brand_id" value="${exampleBrandId}" />
  <input name="name"  placeholder="Your name"  required />
  <input name="email" type="email" placeholder="Email" required />
  <input name="phone" placeholder="Phone (optional)" />
  <textarea name="message" placeholder="Message (optional)"></textarea>
  <!-- honeypot: real users leave this empty; bots fill it -->
  <input name="company_website" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true" />
  <button type="submit">Send</button>
</form>

<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target
  if (f.company_website.value) return            // bot caught by honeypot
  f.querySelector('button').disabled = true
  const res = await fetch('/api/lead', {          // -> your server endpoint below
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brand_id: Number(f.brand_id.value),
      name: f.name.value, email: f.email.value,
      phone: f.phone.value, message: f.message.value,
    }),
  })
  f.querySelector('button').disabled = false
  alert(res.ok ? 'Thanks! We\\'ll be in touch.' : 'Something went wrong, please try again.')
  if (res.ok) f.reset()
})
</script>

/* 2) Astro server endpoint — keeps your token OFF the browser.
   File: src/pages/api/lead.ts   (Node/Express is the same fetch call) */
import type { APIRoute } from 'astro'
const CRM_TOKEN = import.meta.env.CRM_API_TOKEN   // set in your host env, never in code

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const res = await fetch('${endpoint}', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${CRM_TOKEN}\`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      external_source: 'website_form',
      brand_id: body.brand_id,
      contact: { name: body.name, email: body.email, phone: body.phone || undefined },
      description: body.message || undefined,
    }),
  })
  const data = await res.json()
  return new Response(JSON.stringify(res.ok ? { ok: true, id: data.id } : data), { status: res.status })
}`, [endpoint, exampleBrandId])

  const brandLines = brands.length
    ? brands.map(b => `- ${b.id} → ${b.name}${b.is_default ? ' (default)' : ''}`).join('\n')
    : '- (create brands in Admin → Brands to get their IDs)'

  const fullGuide = useMemo(() => `# Connect your website forms to our CRM

Send form submissions from your website straight into our CRM as leads.
Give this document to your developer or paste it into an AI assistant.

## Endpoint
POST ${endpoint}
Header: Authorization: Bearer ${tok}
Content-Type: application/json

${token.trim() ? '' : '> Replace ' + TOKEN_PLACEHOLDER + ' with the API token from Settings → Integrations & API.\n> Keep the token on your SERVER, never in browser code.\n'}
## Request body
Required:
- external_source (string)  — any tag identifying the form, e.g. "website_form"
- contact.name  (string)
- contact.email (email)

Optional:
- brand_id (number)      — routes the lead to a specific brand (see IDs below).
                           Omit to use your default brand.
- contact.phone (string)
- contact.company (string)
- contact.position (string)
- description (string)   — free text / message
- amount (number), currency (3-letter) — for order value; default 0 / EUR
- external_id (string)   — your unique id per submission. Send it to make
                           retries safe (same id returns the same lead, no dupes).
- submitted_at (ISO date) — defaults to now.

## Your brand IDs
${brandLines}

## Minimal example
${curl}

## Response
201 Created (or 200 on a repeat with the same external_id):
{ "id": 123, "url": "${origin}/inquiries/123" }

## Notes
- Rate limit: 60 requests/minute per token.
- Add a hidden "honeypot" field to your form and drop submissions that fill it.
- Never expose the token in client-side JavaScript — proxy through your own
  server endpoint (example below).

## Full web example (form + server endpoint)
${web}
`, [endpoint, tok, token, brandLines, curl, web, origin])

  const snippet = tab === 'guide' ? fullGuide : tab === 'curl' ? curl : web
  const snippetKey = tab

  const TABS: { key: Tab; label: string }[] = [
    { key: 'guide', label: 'Full guide (for dev / AI)' },
    { key: 'curl', label: 'cURL' },
    { key: 'web', label: 'Website form' },
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-white/[0.04]">
        <BookOpen size={14} className="text-emerald-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white">Connect your website forms</div>
          <div className="text-[11px] text-gray-500">Copy a ready-to-use snippet — or the whole guide for a developer / AI.</div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Optional token bake-in */}
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Include a token in the examples (optional)</label>
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste a token to bake it into the snippets — otherwise they show YOUR_API_TOKEN"
            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-[12px] text-white placeholder-gray-600 font-mono outline-none focus:border-emerald-500/50"
          />
          {token.trim() && (
            <p className="mt-1 text-[10px] text-amber-400/80">The token is only inserted into the text you copy — it isn't stored or sent anywhere.</p>
          )}
        </div>

        {/* Brand id reference */}
        {brands.length > 0 && (
          <div className="rounded-lg border border-white/[0.04] bg-black/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Brand IDs (use as <code className="text-emerald-300">brand_id</code>)</div>
            <div className="flex flex-wrap gap-1.5">
              {brands.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px]">
                  <span className="font-mono text-emerald-300">{b.id}</span>
                  <span className="text-gray-400">→ {b.name}{b.is_default ? ' (default)' : ''}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                tab === t.key ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-black/30 text-gray-400 border border-white/[0.06] hover:text-white'
              }`}>
              {t.key === 'guide' && <Sparkles size={11} className="inline mr-1 -mt-0.5" />}
              {t.label}
            </button>
          ))}
          <button
            onClick={() => copy(snippet, snippetKey)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25 transition"
          >
            {copied === snippetKey ? <><Check size={12} /> Copied</> : <><Copy size={12} /> {tab === 'guide' ? 'Copy guide' : 'Copy'}</>}
          </button>
        </div>

        {/* Snippet */}
        <pre className="max-h-72 overflow-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-gray-300 font-mono whitespace-pre-wrap break-words">{snippet}</pre>
      </div>
    </div>
  )
}
