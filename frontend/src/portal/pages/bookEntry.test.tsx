import { describe, expect, it, vi } from 'vitest'
import { render, base } from './book/testUtils'
import { BookEntry, bookDestination } from './BookEntry'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))
vi.mock('./book/Book', () => ({ Book: () => <div data-flow="appointment" /> }))
vi.mock('./stay/StayBook', () => ({ StayBook: () => <div data-flow="stay" /> }))

const caps = (services: boolean, stays: boolean) => ({ ...base, capabilities: { ...base.capabilities, services, stays } })

describe('bookDestination', () => {
  it('goes straight to the only thing the venue sells', () => {
    expect(bookDestination({ services: true, stays: false }, false)).toBe('appointment')
    expect(bookDestination({ services: false, stays: true }, false)).toBe('stay')
  })

  it('asks when the venue sells both — unless the link already names a service', () => {
    expect(bookDestination({ services: true, stays: true }, false)).toBe('choose')
    expect(bookDestination({ services: true, stays: true }, true)).toBe('appointment')
  })

  it('has nowhere to go when the venue sells neither', () => {
    expect(bookDestination({ services: false, stays: false }, false)).toBe('none')
    expect(bookDestination({ services: false, stays: false }, true)).toBe('none')
  })

  it('goes to stay even with a service param, for a venue that only sells stays', () => {
    expect(bookDestination({ services: false, stays: true }, true)).toBe('stay')
  })
})

describe('BookEntry', () => {
  it('opens the appointment flow for a venue that only takes appointments', () => {
    expect(render(<BookEntry />, caps(true, false))).toContain('data-flow="appointment"')
  })

  it('opens the stay flow for a venue that only sells stays', () => {
    expect(render(<BookEntry />, caps(false, true))).toContain('data-flow="stay"')
  })

  it('offers both, as two links a thumb can reach', () => {
    const html = render(<BookEntry />, caps(true, true))
    expect(html).toContain('What would you like to book?')
    expect(html).toContain('href="/portal/book/appointment"')
    expect(html).toContain('href="/portal/book/stay"')
    expect(html).toContain('An appointment')
    expect(html).toContain('A stay')
    expect(html).not.toContain('data-flow=')
  })

  it('lays the two choices side by side from the sm breakpoint', () => {
    const html = render(<BookEntry />, caps(true, true))
    expect(html).toContain('sm:grid-cols-2')
    expect(html).toContain('href="/portal/book/appointment"')
    expect(html).toContain('href="/portal/book/stay"')
  })

  it('keeps a link that names a service working', () => {
    expect(render(<BookEntry />, caps(true, true), undefined, '/portal/book?service=11')).toContain('data-flow="appointment"')
  })

  it('says so when nothing can be booked online', () => {
    expect(render(<BookEntry />, caps(false, false))).toContain('Online booking is not available for this venue yet.')
  })
})
