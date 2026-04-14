// Luxury email template builder: structured block model + HTML renderer.
// Structured content is embedded in the saved HTML inside an invisible
// `<!--builder:{...}-->` comment so the visual editor can round-trip.

export type Palette = {
  page: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  headerBg: string
  headerText: string
  divider: string
  softBg: string
}

export type Block =
  | { type: 'heading'; content: string; align?: 'left' | 'center' }
  | { type: 'text'; content: string; align?: 'left' | 'center' }
  | { type: 'pointsBox'; value: string; label: string }
  | { type: 'tierBadge'; label: string }
  | { type: 'cta'; label: string; url: string }
  | { type: 'divider' }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'quote'; content: string; author?: string }
  | { type: 'spacer'; size?: 'sm' | 'md' | 'lg' }

export type EmailContent = {
  styleId: string
  font: 'sans' | 'serif' | 'mixed'
  palette: Palette
  logoText: string
  preheader?: string
  blocks: Block[]
  footerText: string
}

export type Preset = {
  id: string
  name: string
  category: 'welcome' | 'campaign' | 'transactional' | 'birthday' | 're-engagement'
  tagline: string
  defaultSubject: string
  accentSwatch: string
  content: EmailContent
}

// -- Palettes -------------------------------------------------------------

const P_MIDNIGHT_GOLD: Palette = {
  page: '#0f0f10', surface: '#ffffff', text: '#1c1c1e', muted: '#7b7b80',
  accent: '#c9a84c', accentText: '#ffffff',
  headerBg: '#111113', headerText: '#c9a84c',
  divider: '#ecece7', softBg: '#fbf6e8',
}
const P_IVORY_MINIMAL: Palette = {
  page: '#f6f4ef', surface: '#ffffff', text: '#14110d', muted: '#8a8477',
  accent: '#14110d', accentText: '#ffffff',
  headerBg: '#ffffff', headerText: '#14110d',
  divider: '#e8e3d6', softBg: '#f6f4ef',
}
const P_ROSE_CHAMPAGNE: Palette = {
  page: '#fbeee6', surface: '#ffffff', text: '#3b2a2a', muted: '#9a8380',
  accent: '#b98579', accentText: '#ffffff',
  headerBg: '#f5d9cc', headerText: '#3b2a2a',
  divider: '#f0dfd4', softBg: '#fff6f0',
}
const P_RESORT_CREAM: Palette = {
  page: '#f4ecd8', surface: '#fffcf4', text: '#2c2416', muted: '#8a7e5f',
  accent: '#a8824a', accentText: '#ffffff',
  headerBg: '#e6d6a8', headerText: '#2c2416',
  divider: '#e9dfc4', softBg: '#fbf4e0',
}
const P_EDITORIAL: Palette = {
  page: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#6b6b6b',
  accent: '#111111', accentText: '#ffffff',
  headerBg: '#ffffff', headerText: '#111111',
  divider: '#111111', softBg: '#f3f1ec',
}
const P_VELVET_EMERALD: Palette = {
  page: '#0d1f19', surface: '#ffffff', text: '#0d1f19', muted: '#6e7a73',
  accent: '#0d5f4b', accentText: '#f0e0b0',
  headerBg: '#0d1f19', headerText: '#d4b877',
  divider: '#e3e7e3', softBg: '#ecf3ef',
}

// -- Renderer -------------------------------------------------------------

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))

// Preserve merge tags ({{foo}}) even inside escaped text so they render live.
const escKeepTags = (s: string) => esc(s).replace(/\{\{([a-z_]+)\}\}/g, '{{$1}}')

function renderBlock(b: Block, c: EmailContent): string {
  const p = c.palette
  switch (b.type) {
    case 'heading': {
      const align = b.align ?? 'left'
      return `<h2 style="margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.25;color:${p.text};text-align:${align};">${escKeepTags(b.content)}</h2>`
    }
    case 'text': {
      const align = b.align ?? 'left'
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${p.text};text-align:${align};">${escKeepTags(b.content)}</p>`
    }
    case 'pointsBox':
      return `<table role="presentation" width="100%" style="margin:24px 0;"><tr><td style="background:${p.softBg};border:1px solid ${p.divider};border-radius:12px;padding:28px 20px;text-align:center;">
        <div style="font-size:40px;font-weight:800;color:${p.accent};letter-spacing:1px;line-height:1;">${escKeepTags(b.value)}</div>
        <div style="font-size:12px;color:${p.muted};margin-top:8px;text-transform:uppercase;letter-spacing:2px;">${escKeepTags(b.label)}</div>
      </td></tr></table>`
    case 'tierBadge':
      return `<p style="text-align:center;margin:0 0 20px;"><span style="display:inline-block;padding:8px 22px;border-radius:999px;background:${p.accent};color:${p.accentText};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escKeepTags(b.label)}</span></p>`
    case 'cta':
      return `<p style="text-align:center;margin:28px 0;"><a href="${esc(b.url || '#')}" style="display:inline-block;background:${p.accent};color:${p.accentText};padding:14px 34px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px;">${escKeepTags(b.label)}</a></p>`
    case 'divider':
      return `<hr style="border:none;border-top:1px solid ${p.divider};margin:28px 0;">`
    case 'image':
      return `<p style="margin:20px 0;text-align:center;"><img src="${esc(b.url)}" alt="${esc(b.alt || '')}" style="max-width:100%;height:auto;border-radius:8px;display:inline-block;"></p>`
    case 'quote':
      return `<blockquote style="margin:24px 0;padding:20px 24px;border-left:3px solid ${p.accent};background:${p.softBg};font-style:italic;font-size:16px;line-height:1.6;color:${p.text};">${escKeepTags(b.content)}${b.author ? `<div style="margin-top:8px;font-style:normal;font-size:13px;color:${p.muted};">— ${escKeepTags(b.author)}</div>` : ''}</blockquote>`
    case 'spacer': {
      const h = b.size === 'lg' ? 48 : b.size === 'md' ? 28 : 16
      return `<div style="height:${h}px;"></div>`
    }
  }
}

export function renderEmailHtml(c: EmailContent): string {
  const p = c.palette
  const fontFamily =
    c.font === 'serif'
      ? `'Playfair Display', Georgia, 'Times New Roman', serif`
      : c.font === 'mixed'
        ? `Georgia, 'Times New Roman', serif`
        : `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

  const body = c.blocks.map(b => renderBlock(b, c)).join('\n')
  const preheaderHtml = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escKeepTags(c.preheader)}</div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email</title>
</head>
<body style="margin:0;padding:0;background:${p.page};font-family:${fontFamily};">
${preheaderHtml}
<table role="presentation" width="100%" style="background:${p.page};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" style="max-width:600px;width:100%;background:${p.surface};border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);">
    <tr><td style="background:${p.headerBg};padding:28px 40px;text-align:center;">
      <div style="color:${p.headerText};font-size:15px;font-weight:700;letter-spacing:6px;text-transform:uppercase;">${escKeepTags(c.logoText)}</div>
    </td></tr>
    <tr><td style="padding:40px 40px 16px;">
${body}
    </td></tr>
    <tr><td style="padding:16px 40px 32px;text-align:center;border-top:1px solid ${p.divider};">
      <p style="margin:16px 0 0;color:${p.muted};font-size:12px;line-height:1.6;">${escKeepTags(c.footerText)}</p>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`
}

// -- Round-trip -----------------------------------------------------------

const BUILDER_MARKER = 'builder:'

export function embedContent(html: string, content: EmailContent): string {
  const payload = JSON.stringify(content)
  const comment = `<!--${BUILDER_MARKER}${encodeURIComponent(payload)}-->`
  // Put marker right after DOCTYPE so it's the first thing we see.
  if (html.startsWith('<!DOCTYPE')) {
    const idx = html.indexOf('>') + 1
    return html.slice(0, idx) + '\n' + comment + html.slice(idx)
  }
  return comment + '\n' + html
}

export function extractContent(html: string): EmailContent | null {
  const m = html.match(/<!--builder:([^>]+)-->/)
  if (!m) return null
  try {
    return JSON.parse(decodeURIComponent(m[1])) as EmailContent
  } catch {
    return null
  }
}

// -- Presets --------------------------------------------------------------

export const PRESETS: Preset[] = [
  {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    category: 'campaign',
    tagline: 'Classic hotel loyalty — black & gold',
    defaultSubject: '{{first_name}}, your rewards await',
    accentSwatch: '#c9a84c',
    content: {
      styleId: 'midnight-gold',
      font: 'sans',
      palette: P_MIDNIGHT_GOLD,
      logoText: '{{hotel_name}}',
      preheader: 'An exclusive update for our valued members.',
      blocks: [
        { type: 'heading', content: 'Hello {{first_name}},', align: 'left' },
        { type: 'text', content: 'As a valued {{tier_name}} member, you have access to a private selection of rewards and offers curated for you.' },
        { type: 'pointsBox', value: '{{points_balance}}', label: 'Points Balance' },
        { type: 'text', content: 'Redeem toward complimentary nights, suite upgrades, and bespoke experiences at our property.' },
        { type: 'cta', label: 'View My Rewards', url: '#' },
      ],
      footerText: '© {{current_year}} {{hotel_name}} · Member #{{member_number}} · {{tier_name}} Tier',
    },
  },
  {
    id: 'ivory-welcome',
    name: 'Ivory Welcome',
    category: 'welcome',
    tagline: 'Minimal, refined, editorial',
    defaultSubject: 'Welcome to {{hotel_name}}, {{first_name}}',
    accentSwatch: '#14110d',
    content: {
      styleId: 'ivory-welcome',
      font: 'serif',
      palette: P_IVORY_MINIMAL,
      logoText: '{{hotel_name}}',
      preheader: 'Your journey begins here.',
      blocks: [
        { type: 'tierBadge', label: 'Welcome' },
        { type: 'heading', content: 'A warm welcome, {{first_name}}.', align: 'center' },
        { type: 'text', content: 'It is a privilege to welcome you into our community of discerning travellers. From this moment forward, a more considered way of staying is yours.', align: 'center' },
        { type: 'spacer', size: 'sm' },
        { type: 'text', content: 'Your member number is <strong>#{{member_number}}</strong>. Share your referral code <strong>{{referral_code}}</strong> with friends and you will both receive bonus points on their first stay.', align: 'center' },
        { type: 'cta', label: 'Explore Your Benefits', url: '#' },
        { type: 'divider' },
        { type: 'text', content: 'If we can assist you in any way, simply reply to this message — a member of our team will be delighted to help.', align: 'center' },
      ],
      footerText: '{{hotel_name}} · Member #{{member_number}}',
    },
  },
  {
    id: 'rose-birthday',
    name: 'Rose Champagne',
    category: 'birthday',
    tagline: 'Celebratory, soft, romantic',
    defaultSubject: 'Happy Birthday, {{first_name}} — a gift awaits',
    accentSwatch: '#b98579',
    content: {
      styleId: 'rose-birthday',
      font: 'mixed',
      palette: P_ROSE_CHAMPAGNE,
      logoText: '{{hotel_name}}',
      preheader: 'A small token on your special day.',
      blocks: [
        { type: 'heading', content: 'Happy Birthday, {{first_name}}.', align: 'center' },
        { type: 'text', content: 'From all of us at {{hotel_name}}, we wish you a year filled with extraordinary journeys and memorable moments.', align: 'center' },
        { type: 'pointsBox', value: '500', label: 'Birthday Bonus Points' },
        { type: 'text', content: 'We have added a small gift to your account. Use it toward your next escape — we would be delighted to host you.', align: 'center' },
        { type: 'cta', label: 'Plan a Celebration', url: '#' },
      ],
      footerText: '© {{current_year}} {{hotel_name}} · With love, from our team',
    },
  },
  {
    id: 'resort-seasonal',
    name: 'Resort Cream',
    category: 'campaign',
    tagline: 'Sun-warmed, seasonal, inviting',
    defaultSubject: 'A seasonal escape, just for you',
    accentSwatch: '#a8824a',
    content: {
      styleId: 'resort-seasonal',
      font: 'serif',
      palette: P_RESORT_CREAM,
      logoText: '{{hotel_name}}',
      preheader: 'Limited-time rates for valued members.',
      blocks: [
        { type: 'heading', content: 'Dear {{first_name}},', align: 'left' },
        { type: 'text', content: 'As the season turns, we have reserved a small number of suites at member-only rates. We thought of you first.' },
        { type: 'quote', content: 'There is a season for every journey — and ours is calling you home.' },
        { type: 'cta', label: 'View Member Rates', url: '#' },
        { type: 'divider' },
        { type: 'text', content: 'Available through the end of the month. As a {{tier_name}} member, you also receive complimentary breakfast and a late check-out.', align: 'left' },
      ],
      footerText: '© {{current_year}} {{hotel_name}} · Member #{{member_number}}',
    },
  },
  {
    id: 'editorial-reengagement',
    name: 'Editorial',
    category: 're-engagement',
    tagline: 'Magazine style, big type, confident',
    defaultSubject: 'We have been thinking of you, {{first_name}}',
    accentSwatch: '#111111',
    content: {
      styleId: 'editorial-reengagement',
      font: 'serif',
      palette: P_EDITORIAL,
      logoText: '{{hotel_name}}',
      preheader: 'An invitation to return.',
      blocks: [
        { type: 'heading', content: 'It has been a while, {{first_name}}.', align: 'left' },
        { type: 'text', content: 'Your {{points_balance}} points remain ready for use — and we would love to welcome you back.' },
        { type: 'divider' },
        { type: 'text', content: 'Return before the month ends and we will add a complimentary upgrade to your reservation, subject to availability.' },
        { type: 'cta', label: 'Book a Stay', url: '#' },
        { type: 'text', content: 'Or simply reply to this message and a member of our team will build an itinerary around you.', align: 'left' },
      ],
      footerText: '{{hotel_name}} · {{email}}',
    },
  },
  {
    id: 'velvet-vip',
    name: 'Velvet Emerald',
    category: 'transactional',
    tagline: 'Deep green, discreet, for VIPs',
    defaultSubject: '{{first_name}}, you have been elevated to {{tier_name}}',
    accentSwatch: '#0d5f4b',
    content: {
      styleId: 'velvet-vip',
      font: 'sans',
      palette: P_VELVET_EMERALD,
      logoText: '{{hotel_name}}',
      preheader: 'A quiet upgrade to your membership.',
      blocks: [
        { type: 'tierBadge', label: '{{tier_name}}' },
        { type: 'heading', content: 'Congratulations, {{first_name}}.', align: 'center' },
        { type: 'text', content: 'We are delighted to confirm your elevation to {{tier_name}}. With it comes a collection of considered privileges — reserved for our most loyal guests.', align: 'center' },
        { type: 'pointsBox', value: '{{lifetime_points}}', label: 'Lifetime Points' },
        { type: 'text', content: 'Your dedicated Guest Relations line is now active. We look forward to hosting you again soon.', align: 'center' },
        { type: 'cta', label: 'See My Privileges', url: '#' },
      ],
      footerText: '© {{current_year}} {{hotel_name}} · Member #{{member_number}}',
    },
  },
]

export function blankContent(): EmailContent {
  return JSON.parse(JSON.stringify(PRESETS[0].content))
}
