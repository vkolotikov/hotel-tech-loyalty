import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { Login } from './Login'
import { accountStepProblem, productTrialTerms } from './productSignup'
import { fullPhone, guessCountry } from '../lib/dialCodes'

vi.mock('../stores/authStore', () => {
  const state = { token: null, user: null, staff: null, setAuth: vi.fn(), logout: vi.fn() }
  const useAuthStore = (selector?: (s: typeof state) => unknown) => selector ? selector(state) : state
  useAuthStore.getState = () => state
  return { useAuthStore }
})
vi.mock('../lib/api', () => ({ api: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(), defaults: { baseURL: '' } } }))

const render = (path: string, product?: 'appointments' | 'loyalty' | 'content') => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><Login product={product} /></MemoryRouter>,
)

describe('HexaTech Loyalty\'s and Content\'s own sign-in pages (owner 2026-11-02)', () => {
  it('signs in to HexaTech Loyalty in its own words', () => {
    const html = render('/loyalty/login', 'loyalty')
    expect(html).toContain('Sign in to HexaTech Loyalty')
    expect(html).toContain('Turn first visits into regulars.')
    expect(html).toContain('Loyalty programme for service businesses')
    expect(html).not.toContain('One platform. More bookings. Stronger loyalty.')
  })

  it('starts a trial in one centred card: step 1 is the account, with no packages, hero or banners (owner 2026-11-03)', () => {
    const html = render('/content/register', 'content')
    expect(html).toContain('Start your 7-day free trial')
    expect(html).toContain('No credit card required. Cancel anytime.')
    expect(html).toContain('data-trial-step="1"')
    expect(html).toContain('aria-valuenow="1"')
    expect(html).toMatch(/<input[^>]*autoComplete="email"|<input[^>]*autocomplete="email"/)
    expect(html).toMatch(/autocomplete="new-password"/i)
    expect(html).toContain('>Continue<')
    // Step 2's fields are not on the page yet.
    expect(html).not.toMatch(/autocomplete="tel"/i)
    expect(html).not.toContain('About your business')
    // Gone from sign-up: the package cards, the interval switch, the split-screen hero and the banners.
    expect(html).not.toContain('data-package-picker')
    expect(html).not.toContain('data-package=')
    expect(html).not.toContain('Yearly')
    expect(html).not.toContain('Plan a month of social posts in an afternoon.')
    expect(html).not.toContain('Your trial includes everything in HexaTech Content.')
    expect(html).not.toContain('Configuring for')
    // The logo and the language switcher stay.
    expect(html).toContain('HexaTech Content')
    expect(html).toContain('Language:')
  })

  it('shows the same two-step card on HexaTech Loyalty\'s register page', () => {
    const html = render('/loyalty/register', 'loyalty')
    expect(html).toContain('Start your 7-day free trial')
    expect(html).toContain('data-trial-step="1"')
    expect(html).not.toContain('Turn first visits into regulars.')
  })

  it('has HexaTech Appointments\' own sign-in and two-step sign-up (owner 2026-11-04)', () => {
    const login = render('/appointments/login', 'appointments')
    expect(login).toContain('Sign in to HexaTech Appointments')
    expect(login).toContain('Let clients book you, day and night.')
    const register = render('/appointments/register', 'appointments')
    expect(register).toContain('Start your 7-day free trial')
    expect(register).toContain('data-trial-step="1"')
    expect(register).not.toContain('data-package-picker')
  })

  it('leaves the full suite\'s sign-in as it was', () => {
    const html = render('/login')
    expect(html).toContain('One platform. More bookings. Stronger loyalty.')
    expect(html).toContain('Sign in to your HexaTech workspace')
    expect(html).not.toContain('HexaTech Loyalty')
  })
})

describe('the two-step trial\'s rules (owner 2026-11-03)', () => {
  it('starts every trial on Standard, monthly', () => {
    expect(productTrialTerms('loyalty')).toEqual({ plan: 'loyalty', billing_interval: 'MONTHLY' })
    expect(productTrialTerms('content')).toEqual({ plan: 'content', billing_interval: 'MONTHLY' })
  })

  it('moves on from step 1 only with a valid email and an 8-character password', () => {
    expect(accountStepProblem('', 'longenough')).toBe('email')
    expect(accountStepProblem('anna@', 'longenough')).toBe('email')
    expect(accountStepProblem('anna @spa.com', 'longenough')).toBe('email')
    expect(accountStepProblem('anna@spa.com', 'short')).toBe('password')
    expect(accountStepProblem('anna@spa.com', '1234567')).toBe('password')
    expect(accountStepProblem('anna@spa.com', '12345678')).toBeNull()
  })

  it('sends the phone as one string with the chosen country code', () => {
    expect(fullPhone('GB', '07700 900123')).toBe('+44 7700 900123')
    expect(fullPhone('DE', '1512 3456789')).toBe('+49 1512 3456789')
    expect(fullPhone('GB', '+1 202 555 0100')).toBe('+1 202 555 0100')
    expect(fullPhone('GB', '')).toBe('')
  })

  it('guesses the country from the browser\'s languages, else the United Kingdom', () => {
    expect(guessCountry(['de-DE', 'en'])).toBe('DE')
    expect(guessCountry(['en'])).toBe('GB')
    expect(guessCountry(undefined)).toBe('GB')
  })
})
