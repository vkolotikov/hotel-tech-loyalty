import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Hotel, Lock, Mail, User, Building2, ArrowRight, Star,
  Users, BarChart3, CreditCard, Shield, Sparkles, Check, ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

type View = 'intro' | 'login' | 'trial' | 'verify'
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

const PLAN_BULLETS: Record<string, string[]> = {
  starter: [
    'Guest CRM — up to 500 profiles',
    'Basic loyalty program (1 tier)',
    'Email support',
    'Single property',
    'Basic analytics dashboard',
    'Manual booking management',
  ],
  growth: [
    'Guest CRM — unlimited profiles',
    'Full loyalty program (up to 5 tiers)',
    'Booking engine with online payments',
    'AI-powered chatbot for your website',
    'Multi-property support (up to 3)',
    'Advanced analytics & AI insights',
    'Priority email & chat support',
    'NFC member cards',
  ],
  enterprise: [
    'Everything in Growth, plus:',
    'Unlimited properties',
    'Custom loyalty tiers & rules',
    'Dedicated account manager',
    'API access & custom integrations',
    'White-label branding',
    'SLA guarantee (99.9% uptime)',
    'Staff training & onboarding',
  ],
}

/** Hardcoded fallback when SaaS API is unavailable */
const FALLBACK_PLANS: PlanData[] = [
  {
    id: 'starter', name: 'Starter', slug: 'starter',
    description: 'Perfect for small hotels getting started with guest management.',
    monthlyAmount: 2900, yearlyAmount: 29000, currency: 'eur', trialDays: 7,
  },
  {
    id: 'growth', name: 'Growth', slug: 'growth',
    description: 'For growing hotels that need loyalty, bookings, and AI.',
    monthlyAmount: 7900, yearlyAmount: 79000, currency: 'eur', trialDays: 14,
  },
  {
    id: 'enterprise', name: 'Enterprise', slug: 'enterprise',
    description: 'Full-featured solution for hotel groups and chains.',
    monthlyAmount: 19900, yearlyAmount: 199000, currency: 'eur', trialDays: 14,
  },
]

const FEATURES = [
  { icon: Users, title: 'Guest CRM', desc: 'Full guest profiles, tags, segmentation & activity tracking' },
  { icon: Star, title: 'Loyalty Program', desc: 'Points, tiers, rewards, NFC cards & member mobile app' },
  { icon: BarChart3, title: 'Analytics & AI', desc: 'Revenue insights, churn prediction & AI-powered recommendations' },
  { icon: CreditCard, title: 'Booking Engine', desc: 'Reservations, venue management & calendar scheduling' },
  { icon: Shield, title: 'Multi-property', desc: 'Manage multiple hotels from one dashboard' },
  { icon: Sparkles, title: 'AI Concierge', desc: 'Virtual assistant for guests with custom personas' },
]

export function Login() {
  const [view, setView] = useState<View>('intro')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('growth')
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [plans, setPlans] = useState<PlanData[]>(FALLBACK_PLANS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Verification state
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const [, setCodeSent] = useState(false)
  const [verified, setVerified] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()

  // Handle SaaS JWT login via URL param
  useEffect(() => {
    const saasToken = searchParams.get('token')
    if (saasToken) {
      localStorage.setItem('auth_token', saasToken)
      api.defaults.headers.common['Authorization'] = 'Bearer ' + saasToken
      api.get('/v1/auth/me').then(({ data }) => {
        setAuth(saasToken, data, data.staff)
        navigate('/')
      }).catch(() => {
        setError('Invalid or expired session. Please log in.')
        localStorage.removeItem('auth_token')
      })
    }
  }, [searchParams, setAuth, navigate])

  // Fetch plans on mount — use fallback if API fails
  useEffect(() => {
    api.get('/v1/plans').then(({ data }) => {
      if (data.plans?.length) setPlans(data.plans)
    }).catch(() => {})
  }, [])

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

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
        password,
        hotel_name: hotelName,
        plan: selectedPlan,
        billing_interval: billingInterval,
      })
      setAuth(data.token, data.user, data.staff)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed. Please try again.')
      // If verification error, go back to verify
      if (err.response?.data?.error?.includes('verify')) {
        setView('verify')
        setVerified(false)
      }
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

  const getYearlySaving = (plan: PlanData) => {
    const monthlyTotal = plan.monthlyAmount * 12
    const yearlyTotal = plan.yearlyAmount
    if (yearlyTotal >= monthlyTotal) return 0
    return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100)
  }

  // ─── Intro View ─────────────────────────────────────────────────────────────
  if (view === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] via-[#111118] to-[#0d0d0d] flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-primary-500/20">
            <Hotel size={40} className="text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-3">
            Hotel Management System
          </h1>
          <p className="text-lg text-gray-400 text-center max-w-xl mb-10">
            The all-in-one hotel management platform. CRM, loyalty program,
            booking engine, AI chatbot &amp; analytics &mdash; built for modern hotels.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <button
              onClick={() => setView('trial')}
              className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold px-8 py-3.5 rounded-xl text-lg transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
            >
              Start Free Trial <ArrowRight size={20} />
            </button>
            <button
              onClick={() => setView('login')}
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-8 py-3.5 rounded-xl text-lg transition-colors"
            >
              Sign In <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:border-primary-500/20 transition-colors">
                <f.icon size={22} className="text-primary-400 mb-3" />
                <h3 className="text-white font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 w-full max-w-5xl">
            <h2 className="text-xl font-bold text-white text-center mb-2">Plans &amp; Pricing</h2>
            <p className="text-gray-500 text-center text-sm mb-6">All plans include a free trial. No credit card required.</p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <span className={'text-sm font-medium ' + (billingInterval === 'monthly' ? 'text-white' : 'text-gray-500')}>Monthly</span>
              <button
                onClick={() => setBillingInterval(b => b === 'monthly' ? 'yearly' : 'monthly')}
                className={'relative w-12 h-6 rounded-full transition-colors ' + (billingInterval === 'yearly' ? 'bg-primary-600' : 'bg-white/10')}
              >
                <div className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ' + (billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-0.5')} />
              </button>
              <span className={'text-sm font-medium ' + (billingInterval === 'yearly' ? 'text-white' : 'text-gray-500')}>
                Yearly
                <span className="ml-1.5 text-xs text-green-400 font-semibold">Save up to 17%</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((plan) => {
                const isPopular = plan.slug === 'growth'
                const bullets = PLAN_BULLETS[plan.slug] || []
                const saving = getYearlySaving(plan)
                return (
                  <div key={plan.id} className={'rounded-xl border p-6 relative flex flex-col ' + (isPopular ? 'border-primary-500/50 bg-primary-500/[0.04] ring-1 ring-primary-500/20' : 'border-white/[0.06] bg-white/[0.02]')}>
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-black text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                        Most Popular
                      </div>
                    )}
                    <h3 className="text-white font-bold text-lg">{plan.name}</h3>
                    <div className="mt-2 mb-1">
                      <span className="text-3xl font-bold text-white">{getPlanPrice(plan)}</span>
                      <span className="text-gray-500 text-sm">/mo{billingInterval === 'yearly' ? ' (billed yearly)' : ''} + VAT</span>
                    </div>
                    {billingInterval === 'yearly' && saving > 0 && (
                      <p className="text-green-400 text-xs font-medium mb-1">Save {saving}% vs monthly</p>
                    )}
                    <p className="text-gray-500 text-xs mb-3">{plan.trialDays}-day free trial</p>
                    <p className="text-gray-400 text-xs leading-relaxed mb-4">{plan.description}</p>

                    {bullets.length > 0 && (
                      <div className="space-y-2 mb-5 flex-1">
                        {bullets.map((bullet, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <Check size={12} className="text-green-400 shrink-0 mt-0.5" />
                            <span className="text-gray-300">{bullet}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => { setSelectedPlan(plan.slug); setView('trial') }}
                      className={'w-full py-2.5 rounded-lg font-medium text-sm transition-colors mt-auto ' + (isPopular ? 'bg-primary-600 hover:bg-primary-500 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10')}
                    >
                      Start {plan.trialDays}-Day Trial
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="text-center py-6 text-gray-600 text-xs">
          Powered by <span className="text-gray-400">HotelTech</span> &middot; hotel-tech.ai
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
                  onClick={() => { setView('trial'); setError(''); setCodeDigits(['', '', '', '', '', '']); setVerified(false) }}
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

  // ─── Login / Trial Form Views ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] via-[#111118] to-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button onClick={() => setView('intro')} className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/20">
              <Hotel size={32} className="text-white" />
            </div>
          </button>
          <h1 className="text-2xl font-bold text-white">Hotel Management System</h1>
          <p className="text-gray-500 mt-1">
            {view === 'login' ? 'Admin Dashboard' : 'Start Your Free Trial'}
          </p>
        </div>

        <div className="bg-[#141419] rounded-2xl border border-white/[0.06] p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {view === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {view === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                    placeholder="admin@hotel.com" required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                    placeholder="Enter password" required
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); handleSendCode() }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Your Name</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                      placeholder="John Smith" required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Hotel Name</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text" value={hotelName} onChange={e => setHotelName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                      placeholder="Grand Hotel" required
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                    placeholder="you@hotel.com" required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-gray-600"
                    placeholder="Min 8 characters" required minLength={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Plan</label>
                {/* Billing toggle */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={'text-xs ' + (billingInterval === 'monthly' ? 'text-white' : 'text-gray-500')}>Monthly</span>
                  <button type="button"
                    onClick={() => setBillingInterval(b => b === 'monthly' ? 'yearly' : 'monthly')}
                    className={'relative w-10 h-5 rounded-full transition-colors ' + (billingInterval === 'yearly' ? 'bg-primary-600' : 'bg-white/10')}
                  >
                    <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ' + (billingInterval === 'yearly' ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                  <span className={'text-xs ' + (billingInterval === 'yearly' ? 'text-white' : 'text-gray-500')}>
                    Yearly <span className="text-green-400 text-[10px]">Save ~17%</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {plans.map((p) => (
                    <button key={p.slug} type="button" onClick={() => setSelectedPlan(p.slug)}
                      className={'rounded-lg border p-2.5 text-center transition-all ' +
                        (selectedPlan === p.slug
                          ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                          : 'border-white/[0.08] bg-[#1e1e24] hover:border-white/20')}>
                      <div className="text-xs font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{getPlanPrice(p)}/mo</div>
                      <div className="text-[10px] text-primary-400 mt-0.5">{p.trialDays}d trial</div>
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Sending code...' : (
                  <>
                    <ShieldCheck size={16} />
                    Verify Email & Start Trial
                  </>
                )}
              </button>

              <p className="text-[11px] text-gray-600 text-center">
                We'll send a verification code to your email. No credit card required.
              </p>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
            {view === 'login' ? (
              <p className="text-sm text-gray-500">
                No account?{' '}
                <button onClick={() => { setView('trial'); setError('') }} className="text-primary-400 hover:text-primary-300 font-medium">
                  Start free trial
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Already have an account?{' '}
                <button onClick={() => { setView('login'); setError('') }} className="text-primary-400 hover:text-primary-300 font-medium">
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
