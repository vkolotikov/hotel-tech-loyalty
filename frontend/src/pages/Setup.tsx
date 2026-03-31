import { useState } from 'react'
import { api } from '../lib/api'
import { Hotel, Sparkles, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  onComplete: () => void
}

export function Setup({ onComplete }: Props) {
  const [hotelName, setHotelName] = useState('')
  const [withSample, setWithSample] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/v1/admin/setup/initialize', {
        hotel_name: hotelName || undefined,
        with_sample_data: withSample,
      })
      toast.success('Setup complete! Welcome to your loyalty platform.')
      onComplete()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-500/20 mb-4">
            <Hotel className="w-8 h-8 text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to Hotel Loyalty</h1>
          <p className="text-dark-400 mt-2">Let's set up your platform in a few seconds</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-800 rounded-2xl p-6 border border-dark-700 space-y-6">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Hotel / Company Name</label>
            <input
              type="text"
              value={hotelName}
              onChange={e => setHotelName(e.target.value)}
              placeholder="e.g. Grand Hotel Vienna"
              className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-3">How would you like to start?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWithSample(true)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  withSample
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}
              >
                <Sparkles className={`w-5 h-5 mb-2 ${withSample ? 'text-primary-400' : 'text-dark-400'}`} />
                <div className="font-medium text-white text-sm">With Sample Data</div>
                <p className="text-xs text-dark-400 mt-1">Pre-filled members, guests, tiers & benefits to explore</p>
              </button>
              <button
                type="button"
                onClick={() => setWithSample(false)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  !withSample
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}
              >
                <FileText className={`w-5 h-5 mb-2 ${!withSample ? 'text-primary-400' : 'text-dark-400'}`} />
                <div className="font-medium text-white text-sm">Blank System</div>
                <p className="text-xs text-dark-400 mt-1">Start fresh with default tiers & settings only</p>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-primary-500 hover:bg-primary-600 text-dark-900 font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
