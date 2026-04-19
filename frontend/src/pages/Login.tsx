import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  Lock, Mail, User, Building2, Check, Phone,
  ShieldCheck, Eye, EyeOff, ArrowLeft,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

// Optional — set VITE_BRAND_LOGO_URL in the frontend .env to render a real
// logo on the login screen instead of the fallback "HT" gradient badge.
const BRAND_LOGO_URL = import.meta.env.VITE_BRAND_LOGO_URL as string | undefined

function BrandMark({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  const Wrapper = onClick ? 'button' : 'div'
  const height = compact ? 28 : 36

  if (BRAND_LOGO_URL && !failed) {
    return (
      <Wrapper onClick={onClick} className="relative z-10 inline-flex items-center gap-3 text-left">
        <img
          src={BRAND_LOGO_URL}
          alt="HotelTech"
          onError={() => setFailed(true)}
          style={{ height, width: 'auto', display: 'block' }}
          className="drop-shadow-lg"
        />
      </Wrapper>
    )
  }

  return (
    <Wrapper onClick={onClick} className="relative z-10 inline-flex items-center gap-3 text-left">
      <span className="w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-[13px] tracking-wide bg-gradient-to-br from-blue-500 to-sky-500 shadow-lg shadow-blue-500/30">HT</span>
      <span className="text-[17px] font-semibold">HotelTech</span>
    </Wrapper>
  )
}

type View = 'login' | 'trial' | 'verify' | 'forgot' | 'reset'
type BillingInterval = 'monthly' | 'yearly'

interface PlanData {
  id: string
  name: string
  slug: string
  description: string
  monthlyAmount: number
  yearlyAmount: number
  currency: string
  trialDays: number
  planProducts?: { product: { name: string } }[]
  planFeatures?: { feature: { name: string; key: string }; value: string }[]
}


/** Hardcoded fallback — mirrors the SaaS plan catalog so prices never go stale. */
const FALLBACK_PLANS: PlanData[] = [
  {
    id: 'starter', name: 'Starter', slug: 'starter',
    description: 'Perfect for small hotels getting started with guest management.',
    monthlyAmount: 14900, yearlyAmount: 149000, currency: 'usd', trialDays: 7,
  },
  {
    id: 'growth', name: 'Growth', slug: 'growth',
    description: 'For growing hotels that need loyalty, bookings, and AI.',
    monthlyAmount: 26900, yearlyAmount: 269000, currency: 'usd', trialDays: 7,
  },
  {
    id: 'enterprise', name: 'Enterprise', slug: 'enterprise',
    description: 'Full-featured solution for hotel groups and chains.',
    monthlyAmount: 35900, yearlyAmount: 359000, currency: 'usd', trialDays: 7,
  },
]

const pathToView = (pathname: string): View => {
  if (pathname.startsWith('/register')) return 'trial'
  if (pathname.startsWith('/forgot-password')) return 'forgot'
  if (pathname.startsWith('/reset-password')) return 'reset'
  return 'login'
}

export function Login() {
  const location = useLocation()
  const initialHasToken = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token')
  const [view, setView] = useState<View>(pathToView(location.pathname))
  const [ssoLoading, setSsoLoading] = useState(initialHasToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('growth')
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Verification state
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const [, setCodeSent] = useState(false)
  const [verified, setVerified] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Password reset state
  const [showPassword, setShowPassword] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()

  // Handle SaaS JWT login via URL param. We deliberately use raw fetch here
  // (not the shared axios `api` instance) because its global 401 interceptor
  // hard-redirects to `/login`, which would strip the `?token=` query and
  // lose the handoff context, leaving the user staring at a blank login form
  // with no error. A direct fetch lets us surface the real failure reason
  // and keep the user on the SSO loading screen until we decide what to do.
  useEffect(() => {
    const saasToken = searchParams.get('token')
    if (!saasToken) { setSsoLoading(false); return }

    // Only honour local paths so an open-redirect via `?redirect=https://evil`
    // isn't possible.
    const rawRedirect = searchParams.get('redirect') || '/'
    const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : '/'

    const base = (api.defaults.baseURL || '').replace(/\/$/, '')
    fetch(base + '/v1/auth/me', {
      headers: { Authorization: 'Bearer ' + saasToken, Accept: 'application/json' },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.message || body?.error || `Sign-in failed (${res.status})`)
        localStorage.setItem('auth_token', saasToken)
        api.defaults.headers.common['Authorization'] = 'Bearer ' + saasToken
        setAuth(saasToken, body, body.staff)
        navigate(redirectTo, { replace: true })
      })
      .catch((err) => {
        setError(err?.message || 'Could not complete single sign-on. Please try signing in below.')
        localStorage.removeItem('auth_token')
        setSsoLoading(false)
      })
  }, [searchParams, setAuth, navigate])

  // Fetch plans on mount — use fallback only if API fails
  useEffect(() => {
    api.get('/v1/plans').then(({ data }) => {
      setPlans(data.plans?.length ? data.plans : FALLBACK_PLANS)
    }).catch(() => setPlans(FALLBACK_PLANS))
  }, [])

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // Sync view with URL path (ignore transient 'verify' state)
  useEffect(() => {
    if (view !== 'verify') {
      setView(pathToView(location.pathname))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/v1/auth/login', { email, password })
      setAuth(data.token, data.user, data.staff)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendCode = async () => {
    if (!email) { setError('Please enter your email first.'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/v1/auth/send-code', { email, name })
      setCodeSent(true)
      setCountdown(60)
      setView('verify')
    } catch (err: any) {
      // If mail service is unavailable (503), skip verification and go directly to trial
      if (err.response?.status === 503) {
        await handleTrial()
        return
      }
      setError(err.response?.data?.error || 'Could not send verification code.')
    } finally {
      setLoading(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newDigits = [...codeDigits]
    newDigits[index] = value.slice(-1)
    setCodeDigits(newDigits)

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits are entered
    const fullCode = newDigits.join('')
    if (fullCode.length === 6) {
      verifyCode(fullCode)
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      const digits = pasted.split('')
      setCodeDigits(digits)
      inputRefs.current[5]?.focus()
      verifyCode(pasted)
    }
  }

  const verifyCode = async (code: string) => {
    setLoading(true)
    setError('')
    try {
      await api.post('/v1/auth/verify-code', { email, code })
      setVerified(true)
      // Small delay for the checkmark animation, then proceed to create account
      setTimeout(() => handleTrial(), 500)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.')
      setCodeDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleTrial = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/v1/auth/trial', {
        name,
        email,
        phone,
        password,
        hotel_name: hotelName,
        plan: selectedPlan,
        billing_interval: billingInterval,
      })
      setAuth(data.token, data.user, data.staff)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed. Please try again.')
      setVerified(false)
      setCodeDigits(['', '', '', '', '', ''])
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/v1/auth/forgot-password', { email })
      setResetSent(true)
      navigate('/reset-password')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send reset code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (resetPassword !== resetConfirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/v1/auth/reset-password', {
        email,
        code: resetCode,
        password: resetPassword,
        password_confirmation: resetConfirm,
      })
      setResetDone(true)
      setTimeout(() => {
        setPassword(resetPassword)
        setResetCode('')
        setResetPassword('')
        setResetConfirm('')
        setResetDone(false)
        setResetSent(false)
        navigate('/login')
      }, 1800)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired reset code.')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number, currency: string) => {
    const amount = cents / 100
    const symbol = currency === 'eur' ? '\u20AC' : '$'
    return symbol + amount.toLocaleString()
  }

  const getPlanPrice = (plan: PlanData) => {
    if (billingInterval === 'yearly') {
      return formatPrice(Math.round(plan.yearlyAmount / 12), plan.currency)
    }
    return formatPrice(plan.monthlyAmount, plan.currency)
  }

  // ─── SSO handoff in progress ────────────────────────────────────────────────
  // While we exchange the SaaS JWT for a loyalty session, don't flash the
  // login form — the user just set their password and expects to be signed in.
  if (ssoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060b1e] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Signing you in…</p>
        </div>
      </div>
    )
  }

  // ─── Verify View ────────────────────────────────────────────────────────────
  if (view === 'verify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] via-[#111118] to-[#0d0d0d] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 ${verified ? 'bg-green-500 shadow-green-500/20' : 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-primary-500/20'}`}>
              {verified ? <Check size={32} className="text-white" /> : <ShieldCheck size={32} className="text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-white">
              {verified ? 'Verified!' : 'Verify Your Email'}
            </h1>
            <p className="text-gray-500 mt-1">
              {verified ? 'Creating your account...' : `Enter the 6-digit code sent to ${email}`}
            </p>
            {verified && (
              <div className="flex justify-center mt-4">
                <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {!verified && (
            <div className="bg-[#141419] rounded-2xl border border-white/[0.06] p-8">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              {/* Code inputs */}
              <div className="flex justify-center gap-3 mb-6" onPaste={handleCodePaste}>
                {codeDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleCodeChange(i, e.target.value)}
                    onKeyDown={e => handleCodeKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-[#1e1e24] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex justify-center mb-4">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <div className="text-center">
                <p className="text-xs text-gray-500 mb-3">
                  Didn't receive the code?
                </p>
                <button
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading}
                  className="text-sm text-primary-400 hover:text-primary-300 font-medium disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
                <button
                  onClick={() => { setView('trial'); setError(''); setCodeDigits(['', '', '', '', '', '']); setVerified(false); navigate('/register') }}
                  className="text-sm text-gray-500 hover:text-gray-400"
                >
                  Back to registration
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Login / Trial / Forgot / Reset Views — Split-screen premium ─────────
  const isTrial = view === 'trial'
  const isForgot = view === 'forgot'
  const isReset = view === 'reset'

  const heroTitle = isTrial
    ? 'Run your whole hotel on one platform'
    : isForgot || isReset
      ? 'Locked out? No problem.'
      : 'The AI-native platform for modern hotels'
  const heroSubtitle = isTrial
    ? 'CRM, loyalty, bookings and a 24/7 AI chatbot — included in your free trial.'
    : isForgot
      ? 'Enter your email and we\'ll send a 6-digit reset code. Valid for 15 minutes.'
      : isReset
        ? 'Enter the code from your email and choose a new password.'
        : 'CRM, loyalty, bookings, live chat and analytics — unified in one workspace.'

  const formTitle = isTrial
    ? 'Start your free trial'
    : isForgot
      ? 'Reset your password'
      : isReset
        ? 'Choose a new password'
        : 'Welcome back'
  const formSubtitle = isTrial
    ? 'No credit card required. Cancel anytime.'
    : isForgot
      ? 'We\'ll email you a 6-digit code.'
      : isReset
        ? `Code sent to ${email}`
        : 'Sign in to your HotelTech workspace'

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-[#060b1e] text-white">
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <aside className="relative overflow-hidden hidden lg:flex flex-col justify-between p-14 border-r border-white/[0.06]"
        style={{
          background:
            'radial-gradient(1200px 600px at 10% 0%, rgba(59,130,246,0.35), transparent 60%),' +
            'radial-gradient(900px 500px at 100% 100%, rgba(14,165,233,0.28), transparent 60%),' +
            'linear-gradient(135deg, #060b1e 0%, #0a1635 45%, #0b2556 100%)',
        }}
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 50% 30%, #000 40%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, #000 40%, transparent 75%)',
          }}
        />
        <div aria-hidden className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full blur-[80px] bg-blue-500/40 pointer-events-none" />
        <div aria-hidden className="absolute -bottom-36 -right-24 w-[380px] h-[380px] rounded-full blur-[80px] bg-sky-400/30 pointer-events-none" />

        <BrandMark onClick={() => navigate('/login')} />

        <div className="relative z-10 max-w-[520px]">
          <span className="inline-block text-[11px] font-medium tracking-[0.08em] uppercase px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25 mb-6">
            AI-native hospitality suite
          </span>
          <h2 className="text-[42px] leading-[1.1] tracking-tight font-semibold mb-4 bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
            {heroTitle}
          </h2>
          <p className="text-[16px] leading-[1.55] text-slate-400 max-w-[460px] mb-7">{heroSubtitle}</p>

          <ul className="space-y-3">
            {[
              'Unified CRM, loyalty and booking engine',
              'AI copilot for staff, smart chatbot for guests',
              'Live chat inbox, visitor tracking and automation',
            ].map((t) => (
              <li key={t} className="flex gap-3 items-start text-sm text-slate-300">
                <span className="shrink-0 w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-[12px] font-bold bg-green-500/15 text-green-400 border border-green-500/25">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} HotelTech. All rights reserved.</div>
      </aside>

      {/* ─── Form column ───────────────────────────────────────── */}
      <main className="relative flex flex-col justify-center px-5 py-8 sm:px-14 sm:py-12"
        style={{
          background:
            'radial-gradient(circle at 80% 10%, rgba(59,130,246,0.08), transparent 55%), #0b1226',
        }}
      >
        <div className="lg:hidden mb-6 self-start">
          <BrandMark onClick={() => navigate('/login')} compact />
        </div>

        <div className="w-full max-w-[440px] mx-auto rounded-2xl border border-white/[0.08] sm:bg-slate-900/50 sm:backdrop-blur-md p-6 sm:p-9 sm:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
          {(isForgot || isReset) && (
            <button
              onClick={() => { navigate('/login'); setError('') }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4"
            >
              <ArrowLeft size={14} /> Back to sign in
            </button>
          )}

          <h1 className="text-[26px] leading-tight tracking-tight font-semibold text-white mb-1.5">{formTitle}</h1>
          <p className="text-sm text-slate-400 mb-6">{formSubtitle}</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {/* ── Login ───────────────────────────────────────── */}
          {view === 'login' && (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      autoFocus required placeholder="you@hotel.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="block text-[13px] font-medium text-slate-300">Password</label>
                    <button type="button" onClick={() => { navigate('/forgot-password'); setError('') }}
                      className="text-xs text-blue-400 hover:text-blue-300">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      required placeholder="Enter password"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-md transition">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 transition disabled:opacity-60 shadow-lg shadow-blue-500/25">
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-slate-400">
                New to HotelTech?{' '}
                <button onClick={() => { navigate('/register'); setError('') }} className="text-blue-400 hover:text-blue-300 font-medium">Start free trial</button>
              </p>
            </>
          )}

          {/* ── Trial / Register ────────────────────────────── */}
          {view === 'trial' && (
            <>
              <div className="bg-green-500/10 border border-green-500/25 text-green-400 text-xs rounded-lg px-3.5 py-2.5 mb-4">
                <strong className="font-semibold">What you get:</strong> full access to CRM, Loyalty, Booking engine and AI Chatbot during your trial.
              </div>
              <form onSubmit={e => { e.preventDefault(); handleSendCode() }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Your Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="John Smith"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Hotel</label>
                    <div className="relative">
                      <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="text" value={hotelName} onChange={e => setHotelName(e.target.value)} required placeholder="Grand Hotel"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value.trim().toLowerCase())} required placeholder="you@hotel.com"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Phone</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+1 234 567 8900"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      required minLength={8} placeholder="At least 8 characters"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-md transition">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-2">Plan</label>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={'text-xs ' + (billingInterval === 'monthly' ? 'text-white' : 'text-slate-500')}>Monthly</span>
                    <button type="button" onClick={() => setBillingInterval(b => b === 'monthly' ? 'yearly' : 'monthly')}
                      className={'relative w-10 h-5 rounded-full transition-colors ' + (billingInterval === 'yearly' ? 'bg-blue-600' : 'bg-white/10')}>
                      <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ' + (billingInterval === 'yearly' ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                    <span className={'text-xs ' + (billingInterval === 'yearly' ? 'text-white' : 'text-slate-500')}>
                      Yearly <span className="text-green-400 text-[10px]">Save ~17%</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {plans.length === 0
                      ? [0, 1, 2].map((i) => (
                          <div key={i} className="rounded-lg border border-white/[0.1] bg-slate-950/50 p-2.5 text-center animate-pulse">
                            <div className="h-3 w-12 mx-auto bg-white/10 rounded" />
                            <div className="h-2 w-14 mx-auto bg-white/5 rounded mt-1.5" />
                            <div className="h-2 w-10 mx-auto bg-white/5 rounded mt-1.5" />
                          </div>
                        ))
                      : plans.map((p) => (
                          <button key={p.slug} type="button" onClick={() => setSelectedPlan(p.slug)}
                            className={'rounded-lg border p-2.5 text-center transition-all ' +
                              (selectedPlan === p.slug
                                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                                : 'border-white/[0.1] bg-slate-950/50 hover:border-white/25')}>
                            <div className="text-xs font-semibold text-white">{p.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{getPlanPrice(p)}/mo</div>
                            <div className="text-[10px] text-blue-400 mt-0.5">{p.trialDays}d trial</div>
                          </button>
                        ))}
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 transition disabled:opacity-60 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2">
                  {loading ? 'Sending code…' : (<><ShieldCheck size={16} /> Verify Email & Start Trial</>)}
                </button>
                <p className="text-[11px] text-slate-500 text-center">We'll send a verification code to your email. No credit card required.</p>
              </form>
              <p className="mt-6 text-center text-sm text-slate-400">
                Already have an account?{' '}
                <button onClick={() => { navigate('/login'); setError('') }} className="text-blue-400 hover:text-blue-300 font-medium">Sign in</button>
              </p>
            </>
          )}

          {/* ── Forgot password ─────────────────────────────── */}
          {view === 'forgot' && (
            <>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required placeholder="you@hotel.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 transition disabled:opacity-60 shadow-lg shadow-blue-500/25">
                  {loading ? 'Sending…' : 'Send reset code'}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-slate-400">
                Remembered it?{' '}
                <button onClick={() => { navigate('/login'); setError('') }} className="text-blue-400 hover:text-blue-300 font-medium">Back to sign in</button>
              </p>
            </>
          )}

          {/* ── Reset password ──────────────────────────────── */}
          {view === 'reset' && (
            resetDone ? (
              <div className="text-center py-4 flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                  <Check size={28} className="text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mt-1">Password updated</h3>
                <p className="text-sm text-slate-400">Redirecting you to sign in…</p>
              </div>
            ) : (
              <>
                {resetSent && (
                  <div className="bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs rounded-lg px-3.5 py-2.5 mb-4">
                    A 6-digit code has been sent to <strong className="text-white">{email}</strong>. It expires in 15 minutes.
                  </div>
                )}
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Reset code</label>
                    <input type="text" value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required maxLength={6} inputMode="numeric" placeholder="123456" autoFocus
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-center text-lg tracking-[0.4em] font-mono text-white placeholder-slate-600 transition" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">New password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type={showPassword ? 'text' : 'password'} value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                        required minLength={8} placeholder="At least 8 characters"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(s => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-md transition">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-slate-300 mb-1.5">Confirm new password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type={showPassword ? 'text' : 'password'} value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
                        required minLength={8} placeholder="Repeat your new password"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-950/60 border border-white/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm text-white placeholder-slate-600 transition" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 transition disabled:opacity-60 shadow-lg shadow-blue-500/25">
                    {loading ? 'Updating…' : 'Update password'}
                  </button>
                </form>
                <p className="mt-6 text-center text-sm text-slate-400">
                  <button onClick={() => { navigate('/login'); setError('') }} className="text-blue-400 hover:text-blue-300 font-medium">Back to sign in</button>
                </p>
              </>
            )
          )}
        </div>
      </main>
    </div>
  )
}
