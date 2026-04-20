import { useState } from 'react'
import { api } from '../lib/api'
import { Hotel, Sparkles, FileText, ArrowRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  onComplete: () => void
}

export function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<'choose' | 'loading' | 'done'>('choose')
  const [hotelName, setHotelName] = useState('')
  const [withSample, setWithSample] = useState<boolean | null>(null)

  const handleSubmit = async () => {
    if (withSample === null) {
      toast.error('Please choose how to start')
      return
    }
    setStep('loading')
    try {
      await api.post('/v1/admin/setup/initialize', {
        hotel_name: hotelName || undefined,
        with_sample_data: withSample,
      })
      setStep('done')
      setTimeout(() => {
        toast.success('Setup complete! Welcome to your loyalty platform.')
        onComplete()
      }, 1500)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Setup failed')
      setStep('choose')
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-xl font-bold text-white mb-2">Setting up your platform...</h2>
          <p className="text-dark-400 text-sm">
            {withSample ? 'Creating tiers, benefits, sample members & guests...' : 'Creating default tiers, benefits & settings...'}
          </p>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900 px-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-green-500 rounded-full flex items-center justify-center">
            <Check size={32} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">All set!</h2>
          <p className="text-dark-400 text-sm">Redirecting to your dashboard...</p>
        </div>
      </div>
    )
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

        <div className="bg-dark-800 rounded-2xl p-6 border border-dark-700 space-y-6">
          {/* Hotel name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Hotel / Company Name</label>
            <input
              type="text"
              value={hotelName}
              onChange={e => setHotelName(e.target.value)}
              placeholder="e.g. Grand Hotel Vienna"
              className="w-full px-3 py-2.5 bg-[#1e1e24] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Choose mode */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-3">How would you like to start?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWithSample(true)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  withSample === true
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}
              >
                <Sparkles className={`w-5 h-5 mb-2 ${withSample === true ? 'text-primary-400' : 'text-dark-400'}`} />
                <div className="font-medium text-white text-sm">With Demo Data</div>
                <p className="text-xs text-dark-400 mt-1">Pre-filled members, guests, tiers & benefits to explore</p>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 5 sample loyalty members
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 3 sample CRM guests
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 5 loyalty tiers configured
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 6 default benefits
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setWithSample(false)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  withSample === false
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}
              >
                <FileText className={`w-5 h-5 mb-2 ${withSample === false ? 'text-primary-400' : 'text-dark-400'}`} />
                <div className="font-medium text-white text-sm">Blank System</div>
                <p className="text-xs text-dark-400 mt-1">Start fresh &mdash; add your own data from scratch</p>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 5 loyalty tiers configured
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> 6 default benefits
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-green-400" /> Default settings ready
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-dark-400">
                    <Check size={10} className="text-blue-400" /> No sample data
                  </div>
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={withSample === null}
            className="w-full py-3 px-4 bg-primary-500 hover:bg-primary-600 text-dark-900 font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Get Started <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
