import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Bootstrap, SetupPayload, SetupTeamMember } from '../lib/types'

// Keys built at run time (`setup.hours.problem.${problem}`) carry no fallback, so the stub reads them from
// the real English bundle: the test checks the words a person sees.
vi.mock('react-i18next', async () => {
  const en = (await import('../i18n/appointments.en.json')).default as Record<string, unknown>
  const lookup = (key: string): unknown => key.replace(/^appointments\./, '').split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en)
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
        const found = lookup(key)
        // Like i18next: the bundle's words win, the fallback only covers a key the bundle lacks.
        const text = typeof found === 'string' ? found : typeof fallback === 'string' ? fallback : key
        return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
      },
      i18n: { language: 'en' },
    }),
  }
})

vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { WeekEditor } = await import('./WeekEditor')
const { TimeOffEditor } = await import('./TimeOffEditor')
const { TeamEditor, automaticColourKey, teamBodyOf, teamDraftOf } = await import('./TeamEditor')
const { AppointmentsContext } = await import('../AppointmentsProvider')
const { MemoryRouter } = await import('react-router-dom')

const rows = [
  { day_of_week: 1, start_time: '09:00', end_time: '13:00' },
  { day_of_week: 1, start_time: '14:00', end_time: '18:00' },
  { day_of_week: 0, start_time: '10:00', end_time: '24:00' },
]

describe('WeekEditor', () => {
  it('lists Monday first, shows each range, says Off for a day without hours, and offers to save', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html.indexOf('Monday')).toBeLessThan(html.indexOf('Sunday'))
    expect(html).toContain('value="14:00"')
    expect(html).toContain('value="24:00"')
    expect(html).toContain('Off')
    expect(html).toContain('Copy to Monday–Friday')
    expect(html).toContain('Save hours')
  })

  it('says what is wrong with a day and will not save it', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={[{ day_of_week: 2, start_time: '17:00', end_time: '09:00' }]} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).toContain('The end must be after the start.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Save hours/)
  })

  it('takes times from any keyboard: a phone number pad has no ":"', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly={false} locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).not.toContain('inputmode="numeric"')
    expect(html).not.toContain('inputMode="numeric"')
  })

  it('only shows the week when read-only', () => {
    const html = renderToStaticMarkup(<WeekEditor rows={rows} readOnly locale="en-GB" saving={false} onSave={() => {}} />)
    expect(html).not.toContain('Save hours')
    expect(html).not.toContain('Add hours')
  })
})

describe('TimeOffEditor', () => {
  const entries = [
    { id: 1, date: '2026-10-09', start_time: null, end_time: null, reason: 'Holiday' },
    { id: 2, date: '2026-10-12', start_time: '12:00', end_time: '14:00', reason: null },
  ]

  it('lists time off with all-day or the hours, and a way to remove each', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={entries} canEdit locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('All day')
    expect(html).toContain('Holiday')
    expect(html).toContain('12:00–14:00')
    expect(html).toContain('Remove')
    expect(html).toContain('Add time off')
    expect(html).toContain('min="2026-10-05"')
  })

  it('says when nothing is planned, and offers nothing to someone who may not change it', () => {
    const html = renderToStaticMarkup(<TimeOffEditor entries={[]} canEdit={false} locale="en-GB" today="2026-10-05" saving={false} onAdd={() => {}} onRemove={() => {}} />)
    expect(html).toContain('No time off planned.')
    expect(html).not.toContain('Add time off')
  })
})

describe('TeamEditor — the calendar colour (spec 5.3)', () => {
  // The server sends the palette; these are the test's own fixtures.
  const PALETTE = [
    { key: 'blue', hex: '#3b7dd8' }, { key: 'orange', hex: '#c46f1b' }, { key: 'violet', hex: '#8e5bd0' }, { key: 'raspberry', hex: '#c34b7d' },
    { key: 'teal', hex: '#2d9a80' }, { key: 'ochre', hex: '#a0832a' }, { key: 'green', hex: '#5c8f2e' }, { key: 'coral', hex: '#d0553f' },
    { key: 'indigo', hex: '#5a73dc' }, { key: 'brown', hex: '#9c6b4e' },
  ]
  const WORDS = ['Blue', 'Orange', 'Violet', 'Raspberry', 'Teal', 'Ochre', 'Green', 'Coral', 'Indigo', 'Brown']
  const HINT = 'Shown as a dot on their appointments and a ring on their column.'
  const mara: SetupTeamMember = {
    id: 2, name: 'Mara Ilves', title: null, email: null, phone: null, user_id: null, is_active: true, color: null,
    services: [], week: [], time_off: [],
  }
  const data: SetupPayload = {
    can_manage: true, my_team_member_id: null, services: [], categories: [], team: [mara], staff_accounts: [],
    checklist: { steps: [], complete: true }, settings: {} as SetupPayload['settings'],
    palette: PALETTE, team_colors: { '2': PALETTE[0].hex },
  }
  const boot = { venue: { today: '2026-10-05', timezone: 'Europe/Riga', timezone_named: true, currency: 'EUR' }, organization: { id: 1, name: 'Lumière', industry: 'beauty' } } as Bootstrap
  const render = (member: SetupTeamMember | null, payload: SetupPayload = data) => renderToStaticMarkup(
    <MemoryRouter>
      <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
        <TeamEditor member={member} data={payload} onClose={() => {}} onChanged={() => {}} />
      </AppointmentsContext.Provider>
    </MemoryRouter>,
  )
  const words = (html: string) => html.replace(/<[^>]+>/g, '')
  /** The picker: its fieldset tag, the row holding the choices, each choice (label) in order, and the hint under it. */
  const picker = (html: string) => {
    const m = html.match(/<fieldset([^>]*)><legend[^>]*>Colour on the calendar<\/legend><div([^>]*)>([\s\S]*?)<\/div><p id="team-colour-hint"[^>]*>([^<]*)<\/p>/)
    if (!m) throw new Error('no colour picker in the editor')
    return { group: m[1], row: m[2], choices: m[3].match(/<label[^>]*>[\s\S]*?<\/label>/g) ?? [], hint: m[4] }
  }
  const checkedNames = (html: string) => picker(html).choices.filter(c => /<input[^>]*\bchecked=""/.test(c)).map(words)

  it('offers Automatic and one named radio per palette colour, in a fieldset named once, by its legend, and described by the hint', () => {
    const { group, row, choices } = picker(render(mara))
    expect(group).toContain('aria-describedby="team-colour-hint"')
    // The legend names the group; a radiogroup with its own label inside it would name it a second time.
    expect(row).not.toContain('role=')
    expect(row).not.toContain('aria-label')
    expect(row).not.toContain('aria-describedby')
    expect(choices.map(words)).toEqual(['Automatic', ...WORDS])
    for (const choice of choices) expect(choice).toMatch(/<input[^>]*type="radio"[^>]*name="team-colour"/) // native radios: the arrow keys move between them
  })

  it('names each swatch on hover with its colour word, for a manager who cannot tell blue, indigo and violet apart', () => {
    const { choices } = picker(render(mara))
    choices.slice(1).forEach((choice, i) => {
      expect(choice).toMatch(new RegExp(`^<label[^>]*title="${WORDS[i]}"`))
    })
    expect(choices[0]).not.toContain('title=') // Automatic says its name already
  })

  it('draws each swatch in the palette\'s own colour, for the eye only', () => {
    const { choices } = picker(render(mara))
    choices.slice(1).forEach((choice, i) => {
      expect(choice).toMatch(new RegExp(`<span[^>]*aria-hidden="true"[^>]*class="a-member-dot [^"]*"[^>]*style="--a-m:${PALETTE[i].hex}"`))
    })
  })

  it('shows the selected swatch with a ring in accent-text, and the focused one with an outline beyond it', () => {
    const { choices } = picker(render(mara))
    // Focus is an outline outside the selected ring, so a checked swatch with the focus looks different from one without.
    const focus = ['has-[:focus-visible]:outline', 'has-[:focus-visible]:outline-2', 'has-[:focus-visible]:outline-a-accent-text']
    for (const swatch of choices.slice(1)) {
      const classes = swatch.match(/^<label[^>]*class="([^"]*)"/)?.[1].split(/\s+/) ?? []
      expect(classes).toEqual(expect.arrayContaining(['has-[:checked]:ring-2', 'has-[:checked]:ring-offset-2', 'has-[:checked]:ring-a-accent-text', ...focus]))
      expect(classes).toContain('has-[:checked]:ring-offset-a-surface') // the gap around the selected swatch is the panel's own colour, not white, in the dark theme
      // The ring reaches 4 px out (offset 2 + width 2): the outline starts beyond it.
      const offset = Number(classes.find(c => c.startsWith('has-[:focus-visible]:outline-offset-'))?.match(/(\d+)(?:px\])?$/)?.[1])
      expect(offset).toBeGreaterThan(4)
      expect(classes.some(c => c.startsWith('has-[:focus-visible]:ring'))).toBe(false)
    }
    const auto = choices[0]?.match(/^<label[^>]*class="([^"]*)"/)?.[1]?.split(/\s+/) ?? []
    expect(auto).toEqual(expect.arrayContaining(['has-[:checked]:border-a-accent-text', 'has-[:checked]:ring-a-accent-text', ...focus, 'has-[:focus-visible]:outline-offset-2']))
    expect(auto.some(c => c.startsWith('has-[:focus-visible]:ring'))).toBe(false)
  })

  it('checks Automatic when the member has no stored colour, and the stored colour when they have one', () => {
    expect(checkedNames(render(mara))).toEqual(['Automatic'])
    expect(checkedNames(render({ ...mara, color: PALETTE[2].hex }))).toEqual(['Violet'])
    expect(checkedNames(render({ ...mara, color: PALETTE[9].hex }))).toEqual(['Brown'])
    expect(checkedNames(render(null))).toEqual(['Automatic']) // a new person starts on Automatic
  })

  it('names the automatic colour in the hint, and only while the member is on Automatic', () => {
    expect(picker(render(mara)).hint).toBe(`${HINT} (Blue)`)
    expect(picker(render({ ...mara, color: PALETTE[1].hex })).hint).toBe(HINT) // a chosen colour needs no naming
    expect(picker(render(mara, { ...data, team_colors: {} })).hint).toBe(HINT) // nothing assigned yet (a new person)
    expect(picker(render(null)).hint).toBe(HINT)
    expect(picker(render(mara, { ...data, team_colors: { '2': '#000000' } })).hint).toBe(HINT) // not a palette colour: nothing to name
  })

  it('names nothing while a saved colour is being switched back to Automatic: the server\'s colour for them is still that choice', () => {
    const violet = { ...mara, color: PALETTE[2].hex }
    const served = { '2': PALETTE[2].hex } // a saved choice is what the server assigns them
    expect(automaticColourKey(violet, null, PALETTE, served)).toBeUndefined()
    expect(automaticColourKey(violet, PALETTE[2].hex, PALETTE, served)).toBeUndefined()
    // On Automatic and staying there: the server's colour is named.
    expect(automaticColourKey(mara, null, PALETTE, { '2': PALETTE[0].hex })).toBe('blue')
    expect(automaticColourKey(mara, null, PALETTE, { '2': PALETTE[0].hex.toUpperCase() })).toBe('blue')
    // Choosing a colour in the draft: nothing to name.
    expect(automaticColourKey(mara, PALETTE[1].hex, PALETTE, { '2': PALETTE[0].hex })).toBeUndefined()
    expect(automaticColourKey(null, null, PALETTE, {})).toBeUndefined()
    expect(automaticColourKey(mara, null, PALETTE, {})).toBeUndefined()
  })

  // During the deploy a page can meet a server from before the colours: its Setup payload has neither key.
  it('still opens when the server sent no palette and no team colours: Automatic alone, the plain hint', () => {
    const old = { ...data } as Partial<SetupPayload>
    delete old.palette
    delete old.team_colors
    let html = ''
    expect(() => { html = render(mara, old as SetupPayload) }).not.toThrow()
    expect(picker(html).choices.map(words)).toEqual(['Automatic'])
    expect(picker(html).hint).toBe(HINT)
    expect(html).toContain('Save profile')
    expect(() => render(null, old as SetupPayload)).not.toThrow()
  })

  it('reads the stored colour into the draft', () => {
    expect(teamDraftOf(mara, []).color).toBeNull()
    expect(teamDraftOf(null, []).color).toBeNull()
    expect(teamDraftOf({ ...mara, color: PALETTE[3].hex }, []).color).toBe(PALETTE[3].hex)
  })

  // Sent every time, an unchanged colour would overwrite another manager's change made meanwhile, and a stored colour
  // the palette no longer has would be refused (422) on every save of the profile.
  it('sends the colour only when the manager changed it: a palette hex, or null for back to Automatic', () => {
    const chosen = { ...mara, color: PALETTE[3].hex }
    // Unchanged: left out of the body, whatever it is.
    expect(teamBodyOf(teamDraftOf(chosen, []), chosen)).not.toHaveProperty('color')
    expect(teamBodyOf(teamDraftOf(mara, []), mara)).not.toHaveProperty('color')
    const retired = { ...mara, color: '#123456' } // a colour from an older palette
    expect(teamBodyOf(teamDraftOf(retired, []), retired)).not.toHaveProperty('color')
    expect(teamBodyOf({ ...teamDraftOf(chosen, []), color: PALETTE[3].hex.toUpperCase() }, chosen)).not.toHaveProperty('color') // the same colour, written otherwise
    // Changed: sent.
    expect(teamBodyOf({ ...teamDraftOf(mara, []), color: PALETTE[1].hex }, mara)).toHaveProperty('color', PALETTE[1].hex)
    expect(teamBodyOf({ ...teamDraftOf(chosen, []), color: PALETTE[0].hex }, chosen)).toHaveProperty('color', PALETTE[0].hex)
    expect(teamBodyOf({ ...teamDraftOf(chosen, []), color: null }, chosen)).toHaveProperty('color', null) // back to Automatic is sent, not left out
    expect(teamBodyOf({ ...teamDraftOf(retired, []), color: PALETTE[2].hex }, retired)).toHaveProperty('color', PALETTE[2].hex)
    // A new person: a chosen colour is sent, Automatic needs nothing.
    expect(teamBodyOf({ ...teamDraftOf(null, []), name: 'Ilze', color: PALETTE[4].hex }, null)).toHaveProperty('color', PALETTE[4].hex)
    expect(teamBodyOf({ ...teamDraftOf(null, []), name: 'Ilze' }, null)).not.toHaveProperty('color')
    // The rest of the body is unchanged by it.
    expect(teamBodyOf(teamDraftOf(chosen, []), chosen)).toEqual({ name: 'Mara Ilves', title: null, email: null, phone: null, user_id: null, is_active: true, services: [] })
  })

  it('saves the profile with the body measured against the member as last saved', () => {
    const source = readFileSync(new URL('./TeamEditor.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/const body = teamBodyOf\(draft, member\)/)
  })
})
