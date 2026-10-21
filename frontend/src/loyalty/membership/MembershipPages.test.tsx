import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can, MemberRow } from '../lib/types'
import { duplicatesKey, importKey, importsKey } from './api'
import { PrintableCard } from './CardDialog'
import { DuplicatesPage } from './DuplicatesPage'
import { ImportPage } from './ImportPage'
import type { DuplicatePair, ImportBatch } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true },
  staff: { id: 5, name: 'Ada', role: c.manage_members ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const row = (more: Partial<MemberRow>): MemberRow => ({
  id: 1, name: 'Ada Lovelace', email: 'ada@example.test', phone: '+371 26 123 456', member_number: 'HL-2026-000001', tier_id: 1, points: 1500,
  lifetime_points: 1500, is_active: true, joined_at: '2026-01-05T10:00:00+00:00', last_activity_at: null, ...more,
})
const pairs: DuplicatePair[] = [{
  a: row({ id: 4 }), b: row({ id: 9, name: 'Ada L.', points: 120, member_number: 'HL-2026-000009', is_active: false }), reasons: ['same_email', 'same_phone'], keep: 4,
}]
const batch = (more: Partial<ImportBatch> = {}): ImportBatch => ({
  id: 7, filename: 'guests.csv', state: 'pending', finished: false, rows: 130, file_rows: 131, processed: 0, progress: 0, created: 0, skipped: 0, refused: 0,
  points: 0, columns_used: ['name', 'email'], columns_ignored: [], failure: null, by: 'Ada', created_at: '2026-10-20T08:00:00+00:00', started_at: null,
  completed_at: null, ...more,
})

function render(node: React.ReactNode, c: Can, seed: (client: QueryClient) => void = () => {}, path = '/') {
  const client = new QueryClient()
  seed(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          {node}
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const manager = can({ manage_members: true })

describe('Duplicates (release 2 §4.1)', () => {
  it('shows each pair with why it matches, the oldest kept, and Merge', () => {
    const html = render(<DuplicatesPage />, manager, client => client.setQueryData(duplicatesKey, { pairs }))
    const words = text(html)
    expect(words).toContain('Same email')
    expect(words).toContain('Same phone')
    expect(words).toContain('Keeps Ada Lovelace; Ada L. is merged into it.')
    expect(words).toContain('Merge…')
    expect(words).toContain('Account switched off')
    expect(html).toMatch(/data-side="4"[^>]*border-a-accent-text[\s\S]*?checked=""/)
    expect(html).toContain('href="/loyalty/members/9"')
  })

  it('says when there is nothing to merge', () => {
    expect(text(render(<DuplicatesPage />, manager, client => client.setQueryData(duplicatesKey, { pairs: [] })))).toContain('No likely duplicates.')
  })

  it('tells a staff member calmly that it is a manager’s page', () => {
    const words = text(render(<DuplicatesPage />, can(), client => client.setQueryData(duplicatesKey, { pairs })))
    expect(words).toContain('Finding and merging duplicates is for an owner or a manager.')
    expect(words).not.toContain('Merge…')
  })
})

describe('Import (release 2 §4.1)', () => {
  const columns = ['name', 'first_name', 'email', 'points', 'shoe_size']

  it('starts with the file, the columns it reads in the workspace’s words, and the past imports', () => {
    const html = render(<ImportPage />, manager, client => client.setQueryData(importsKey, {
      imports: [batch({ id: 3, state: 'completed', finished: true, created: 120, skipped: 4, refused: 2 })], columns,
    }), '/loyalty/members/import')
    const words = text(html)
    expect(words).toContain('Choose a CSV file')
    expect(words).toContain('Check the file')
    expect(html).toMatch(/data-columns=""[\s\S]*Name[\s\S]*First name[\s\S]*Email[\s\S]*Points[\s\S]*shoe_size/)
    expect(words).toContain('Past imports')
    expect(words).toContain('120 created · 4 passed over · 2 refused')
    expect(words).toContain('Done')
    expect(words).toContain('Open')
  })

  it('shows a batch that waits with Import, a running one with its progress, and a finished one with every row not taken', () => {
    const seed = (b: ImportBatch) => (client: QueryClient) => {
      client.setQueryData(importsKey, { imports: [b], columns })
      client.setQueryData(importKey(7), { batch: b })
    }
    const ready = text(render(<ImportPage />, manager, seed(batch()), '/loyalty/members/import?batch=7'))
    expect(ready).toContain('130 rows are ready to import.')
    expect(ready).toContain('Import another file')
    expect(ready).toContain('Ready to import')

    const running = render(<ImportPage />, manager, seed(batch({ state: 'running', processed: 100, progress: 76, created: 98 })), '/loyalty/members/import?batch=7')
    expect(text(running)).toContain('100 of 130 rows · 98 members created')
    expect(text(running)).toContain('This import is paused.')
    expect(text(running)).toContain('Continue')
    expect(text(running)).toContain('Stop the import')
    expect(running).toContain('aria-valuenow="76"')

    const done = text(render(<ImportPage />, manager, seed(batch({
      state: 'completed', finished: true, processed: 130, progress: 100, created: 127, skipped: 2, refused: 1, points: 1270,
      problems: [
        { line: 3, email: 'ada@example.test', kind: 'skipped', code: 'already_member' },
        { line: 9, email: 'kurt@example.test', kind: 'refused', code: 'unknown_tier', tier: 'Diamond' },
        { line: 12, email: 'alan@example.test', kind: 'skipped', code: 'repeated', first_line: 2 },
        { line: 14, email: '', kind: 'refused', code: 'something_new' },
      ],
    })), '/loyalty/members/import?batch=7'))
    expect(done).toContain('Members created 127')
    expect(done).toContain('Points written 1,270')
    expect(done).toContain('Line 3 ada@example.test Passed over: Already a member.')
    expect(done).toContain('Refused: There is no tier called “Diamond”.')
    expect(done).toContain('The same address is on line 2.')
    expect(done).toContain('Refused: This row was not imported.')
    expect(done).toContain('See the members')
  })

  it('tells a staff member calmly that it is a manager’s page', () => {
    const words = text(render(<ImportPage />, can(), () => {}, '/loyalty/members/import'))
    expect(words).toContain('Importing members is for an owner or a manager.')
    expect(words).not.toContain('Check the file')
  })
})

describe('The member card (release 2 §4.1)', () => {
  it('is the QR code with the name and number, marked as what is printed', () => {
    const html = render(<PrintableCard card={{ member_number: 'HL-2026-000001', name: 'Ada Lovelace', qr_svg: 'data:image/svg+xml;base64,PHN2Zy8+' }} />, can())
    expect(html).toContain('data-print-card=""')
    expect(html).toContain('src="data:image/svg+xml;base64,PHN2Zy8+"')
    expect(html).toContain('alt="QR code of member number HL-2026-000001"')
    expect(text(html)).toContain('Lumière Ada Lovelace HL-2026-000001')
  })
})
