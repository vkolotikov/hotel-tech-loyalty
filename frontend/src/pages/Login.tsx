import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Hotel, Lock, Mail, User, Building2, ArrowRight, Star,
  Users, BarChart3, CreditCard, Shield, Sparkles, Check, ChevronRight,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

type View = 'intro' | 'login' | 'trial'

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
  const [selectedPlan, setSelectedPlan] = useState('starter')
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()

  // Handle SaaS JWT login via URL param (from SaaS "Launch" button)
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

  // Fetch plans on mount
  useEffect(() => {
    api.get('/v1/plans').then(({ data }) => {
      if (data.plans) setPlans(data.plans)
    }).catch(() => {})
  }, [])

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

  const handleTrial = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/v1/auth/trial', {
        name,
        email,
        password,
        hotel_name: hotelName,
        plan: selectedPlan,
      })
      setAuth(data.token, data.user, data.staff)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number, currency: string) => {
    const amount = cents / 100
    const symbol = currency === 'eur' ? '\u20AC' : '$'
    return symbol + amount.toLocaleString()
  }

  // ─── Intro View ─────────────────────────────────────────────────────────────
  if (view === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] via-[#111118] to-[#0d0d0d] flex flex-col">
        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-primary-500/20">
            <Hotel size={40} className="text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-3">
            Hotel Loyalty Platform
          </h1>
          <p className="text-lg text-gray-400 text-center max-w-xl mb-10">
            The all-in-one guest experience platform. CRM, loyalty program,
            booking engine, and AI insights &mdash; built for modern hotels.
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

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:border-primary-500/20 transition-colors">
                <f.icon size={22} className="text-primary-400 mb-3" />
                <h3 className="text-white font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Plans preview */}
          {plans.length > 0 && (
            <div className="mt-16 w-full max-w-4xl">
              <h2 className="text-xl font-bold text-white text-center mb-2">Plans &amp; Pricing</h2>
              <p className="text-gray-500 text-center text-sm mb-8">All plans include a free trial. No credit card required.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const isPopular = plan.slug === 'growth'
                  return (
                    <div key={plan.id} className={'rounded-xl border p-6 relative ' + (isPopular ? 'border-primary-500/50 bg-primary-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]')}>
                      {isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-black text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                          Most Popular
                        </div>
                      )}
                      <h3 className="text-white font-bold text-lg">{plan.name}</h3>
                      <div className="mt-2 mb-1">
                        <span className="text-3xl font-bold text-white">{formatPrice(plan.monthlyAmount, plan.currency)}</span>
                        <span className="text-gray-500 text-sm">/month + VAT</span>
                      </div>
                      <p className="text-gray-500 text-xs mb-4">{plan.trialDays}-day free trial</p>
                      <p className="text-gray-400 text-xs leading-relaxed mb-4">{plan.description}</p>

                      {plan.planProducts && plan.planProducts.length > 0 && (
                        <div className="space-y-1.5 mb-5">
                          {plan.planProducts.map((pp: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Check size={12} className="text-green-400 shrink-0" />
                              <span className="text-gray-300">{pp.product?.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => { setSelectedPlan(plan.slug); setView('trial') }}
                        className={'w-full py-2.5 rounded-lg font-medium text-sm transition-colors ' + (isPopular ? 'bg-primary-600 hover:bg-primary-500 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10')}
                      >
                        Start {plan.trialDays}-Day Trial
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-gray-600 text-xs">
          Powered by <span className="text-gray-400">HotelTech</span> &middot; saas.hotel-tech.ai
        </div>
      </div>
    )
  }

  // ─── Login / Trial Form Views ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] via-[#111118] to-[#0d0d0d] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <button onClick={() => setView('intro')} className="inline-block">
            <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/20">
              <Hotel size={32} className="text-white" />
            </div>
          </button>
          <h1 className="text-2xl font-bold text-white">Hotel Loyalty</h1>
          <p className="text-gray-500 mt-1">
            {view === 'login' ? 'Admin Dashboard' : 'Start Your Free Trial'}
          </p>
        </div>

        {/* Form Card */}
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
            <form onSubmit={handleTrial} className="space-y-4">
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

              {plans.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Select Plan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {plans.map((p) => (
                      <button key={p.slug} type="button" onClick={() => setSelectedPlan(p.slug)}
                        className={'rounded-lg border p-2.5 text-center transition-all ' +
                          (selectedPlan === p.slug
                            ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                            : 'border-white/[0.08] bg-[#1e1e24] hover:border-white/20')}>
                        <div className="text-xs font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{formatPrice(p.monthlyAmount, p.currency)}/mo</div>
                        <div className="text-[10px] text-primary-400 mt-0.5">{p.trialDays}d trial</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                {loading ? 'Creating account...' : 'Start Free Trial'}
              </button>

              <p className="text-[11px] text-gray-600 text-center">
                No credit card required. Full access during your trial period.
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
