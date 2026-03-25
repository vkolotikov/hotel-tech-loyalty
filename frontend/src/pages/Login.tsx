import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Hotel, Lock, Mail } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export function Login() {
  const [email, setEmail] = useState('admin@hotel-loyalty.com')
  const [password, setPassword] = useState('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/v1/auth/login', { email, password })
      setAuth(data.token, data.user, data.staff)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0d0d] to-[#1a1a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Hotel size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Hotel Loyalty</h1>
          <p className="text-[#8e8e93] mt-1">Admin Dashboard</p>
        </div>

        {/* Form */}
        <div className="bg-dark-surface rounded-2xl border border-dark-border p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Sign in to your account</h2>

          {error && (
            <div className="bg-[#ff375f]/15 border border-[#ff375f]/30 text-[#ff375f] px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e1e] border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-[#636366]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#a0a0a0] mb-1">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#1e1e1e] border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-white placeholder-[#636366]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-xs text-[#636366] text-center mt-4">
            Demo: admin@hotel-loyalty.com / password
          </p>
        </div>
      </div>
    </div>
  )
}
