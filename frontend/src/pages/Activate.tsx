import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Lock, Eye, EyeOff, Check, AlertCircle, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

const BRAND_LOGO_URL =
  (import.meta.env.VITE_BRAND_LOGO_URL as string | undefined) ||
  `${import.meta.env.BASE_URL}hotel-tech-logo.png`

export function Activate() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const token = params.get('token') || ''
  const email = params.get('email') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    if (!token || !email) {
      setError('This activation link is missing required information. Please open the link from your invitation email.')
    }
  }, [token, email])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/v1/auth/activate', { token, email, password })
      setDone(true)
      setAuth(data.token, data.user, data.staff)
      setTimeout(() => navigate('/', { replace: true }), 800)
    } catch (err: any) {
      const msg = err?.response?.data?.error
        || err?.response?.data?.message
        || 'Could not activate your account. The link may be invalid or expired.'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1020] via-[#0d1528] to-[#0a1020] flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(201,168,76,0.12), transparent 50%)' }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          {!logoFailed ? (
            <img
              src={BRAND_LOGO_URL}
              alt="HotelTech"
              onError={() => setLogoFailed(true)}
              style={{ height: 72, width: 'auto', margin: '0 auto' }}
              className="drop-shadow-[0_10px_40px_rgba(201,168,76,0.25)]"
            />
          ) : (
            <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a84c] to-[#a6883c] text-black font-bold text-xl shadow-lg shadow-[#c9a84c]/30">
              HT
            </div>
          )}
        </div>

        <div className="bg-[#0f1527]/90 backdrop-blur rounded-2xl border border-white/[0.06] p-8 shadow-2xl">
          {done ? (
            <div className="text-center py-6">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-full bg-[#c9a84c]/15 text-[#c9a84c] mb-4 ring-1 ring-[#c9a84c]/30">
                <Check size={24} />
              </div>
              <h1 className="text-xl font-semibold text-white mb-1">You're in</h1>
              <p className="text-sm text-white/60">Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">Welcome aboard</h1>
              <p className="text-sm text-white/60 mb-6">
                Set a password to finish activating{email ? ` ${email}` : ' your account'}.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black/30 border border-white/[0.08] rounded-lg py-2.5 pl-10 pr-10 text-white text-sm focus:border-[#c9a84c]/50 focus:ring-1 focus:ring-[#c9a84c]/30 focus:outline-none transition"
                      placeholder="At least 8 characters"
                      autoFocus
                      disabled={loading || !token || !email}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 uppercase tracking-wider mb-1.5">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full bg-black/30 border border-white/[0.08] rounded-lg py-2.5 pl-10 pr-3 text-white text-sm focus:border-[#c9a84c]/50 focus:ring-1 focus:ring-[#c9a84c]/30 focus:outline-none transition"
                      placeholder="Re-enter password"
                      disabled={loading || !token || !email}
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-xs text-red-300">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !token || !email}
                  className="w-full py-3 rounded-lg font-semibold text-sm text-black bg-gradient-to-br from-[#d4b357] via-[#c9a84c] to-[#a6883c] hover:from-[#dcbc60] hover:to-[#b59244] transition shadow-lg shadow-[#c9a84c]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? 'Activating…' : <>Activate Account <ArrowRight size={16} /></>}
                </button>
              </form>

              <p className="text-center text-xs text-white/40 mt-6">
                Already set up?{' '}
                <Link to="/login" className="text-[#c9a84c] hover:text-[#dcbc60] hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-white/30 mt-5">
          &copy; {new Date().getFullYear()} Hotel Tech &middot; hotel-tech.ai
        </p>
      </div>
    </div>
  )
}

export default Activate
