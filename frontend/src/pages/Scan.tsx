import { useState, useRef, useEffect } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { QrCode, CreditCard, Award, User, Gift } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import toast from 'react-hot-toast'

type ScanMode = 'qr' | 'nfc'

export function Scan() {
  const [mode, setMode] = useState<ScanMode>('qr')
  const [scanning, setScanning] = useState(false)
  const [member, setMember] = useState<any>(null)
  const [aiUpsell, setAiUpsell] = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [pointsDesc, setPointsDesc] = useState('')
  const [nfcUid, setNfcUid] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const nfcInputRef = useRef<HTMLInputElement>(null)
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopScanning = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
  }

  const startQrScan = async () => {
    if (!videoRef.current) return
    setScanning(true)
    setMember(null)
    try {
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
        if (result) {
          stopScanning()
          try {
            const payload = JSON.parse(result.getText())
            const { data } = await api.post('/v1/admin/scan/qr', { token: payload.token })
            setMember(data.member)
            setAiUpsell(data.ai_upsell_suggestion)
            toast.success(`Member found: ${data.member.name}`)
          } catch {
            toast.error('Invalid QR code')
          }
        }
      })
      controlsRef.current = controls
    } catch (e) {
      toast.error('Camera access denied')
      setScanning(false)
    }
  }

  const scanNfc = async (uidOverride?: string) => {
    const uid = (uidOverride ?? nfcUid).trim()
    if (!uid) { toast.error('Enter NFC UID'); return }
    try {
      const { data } = await api.post('/v1/admin/scan/nfc', { uid })
      setMember(data.member)
      setAiUpsell(data.ai_upsell_suggestion)
      toast.success(`Member found: ${data.member.name}`)
    } catch {
      toast.error('NFC card not found')
    } finally {
      setNfcUid('')
      setTimeout(() => nfcInputRef.current?.focus(), 50)
    }
  }

  const awardPoints = async () => {
    if (!member || !pointsInput) return
    try {
      await api.post('/v1/admin/points/award', {
        member_id: member.id,
        points: parseInt(pointsInput),
        description: pointsDesc || 'Points awarded at front desk',
      })
      toast.success(`${pointsInput} points awarded!`)
      setPointsInput('')
      setPointsDesc('')
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to award points')
    }
  }

  useEffect(() => () => { stopScanning() }, [])

  // Keep the NFC input focused when the NFC tab is active so USB HID readers
  // land their characters in the field even if the user clicks elsewhere. Most
  // USB NFC readers type the UID then press Enter, but a few don't — so we
  // also auto-submit after 300ms of no input (fires once the reader finishes
  // "typing" the UID).
  useEffect(() => {
    if (mode !== 'nfc') return
    nfcInputRef.current?.focus()
    const refocus = () => {
      if (document.activeElement !== nfcInputRef.current) {
        nfcInputRef.current?.focus()
      }
    }
    const interval = setInterval(refocus, 1000)
    return () => clearInterval(interval)
  }, [mode])

  useEffect(() => {
    if (mode !== 'nfc' || !nfcUid.trim()) return
    if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current)
    autoSubmitTimer.current = setTimeout(() => {
      if (nfcUid.trim().length >= 4) scanNfc(nfcUid)
    }, 300)
    return () => {
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current)
    }
  }, [nfcUid, mode])

  // Belt-and-braces: some USB HID NFC readers emit keystrokes at the document
  // level when the input loses focus (e.g. user clicks elsewhere, dev tools
  // open). Capture alphanumeric + Enter globally while the NFC tab is active
  // and route them into the input regardless of focus. Ignores typing while
  // another input/textarea is focused so we don't hijack normal data entry.
  useEffect(() => {
    if (mode !== 'nfc') return
    const globalBuffer = { current: '', timer: null as ReturnType<typeof setTimeout> | null }

    const flush = () => {
      const uid = globalBuffer.current.trim()
      globalBuffer.current = ''
      if (uid.length >= 4) scanNfc(uid)
    }

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      // If the NFC input itself is focused, let the normal handlers run.
      if (target === nfcInputRef.current) return
      // Don't hijack typing in any other input/textarea.
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

      if (e.key === 'Enter') {
        if (globalBuffer.current.trim().length >= 4) {
          e.preventDefault()
          flush()
        }
        return
      }
      // Single printable character — most HID readers emit hex digits + optional colons.
      if (e.key.length === 1 && /[0-9a-fA-F:\-]/.test(e.key)) {
        globalBuffer.current += e.key
        setNfcUid(globalBuffer.current)
        if (globalBuffer.current.length >= 4) {
          if (globalBuffer.timer) clearTimeout(globalBuffer.timer)
          globalBuffer.timer = setTimeout(flush, 300)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (globalBuffer.timer) clearTimeout(globalBuffer.timer)
    }
  }, [mode])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Scan Member</h1>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {(['qr', 'nfc'] as ScanMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMember(null); stopScanning() }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-primary-600 text-white' : 'bg-dark-surface text-[#a0a0a0] border border-dark-border hover:bg-dark-surface2'}`}
          >
            {m === 'qr' ? <QrCode size={16} /> : <CreditCard size={16} />}
            {m.toUpperCase()} Scan
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Scanner */}
        <Card>
          {mode === 'qr' ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">QR Code Scanner</h3>
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video ref={videoRef} className="w-full h-full object-cover" />
                {!scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <QrCode size={48} className="text-[#636366]" />
                  </div>
                )}
                {scanning && (
                  <div className="absolute inset-0 border-4 border-primary-400 rounded-xl animate-pulse" />
                )}
              </div>
              <div className="flex gap-2">
                {!scanning ? (
                  <button onClick={startQrScan} className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors">
                    Start Camera
                  </button>
                ) : (
                  <button onClick={stopScanning} className="flex-1 bg-red-500 text-white py-2.5 rounded-lg font-medium hover:bg-red-600 transition-colors">
                    Stop Camera
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">NFC Card Scan</h3>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-300">
                  <strong>USB NFC Reader:</strong> Place your cursor in the field below, then tap the NFC card on your reader. The UID will be entered automatically.
                </p>
                <p className="text-xs text-blue-300/70 mt-1">
                  If you don't have a USB reader, you can type the card UID manually (e.g. 04:A3:B2:1C:F4).
                </p>
              </div>
              <div className="relative">
                <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
                <input
                  ref={nfcInputRef}
                  type="text"
                  placeholder="Tap NFC card or enter UID..."
                  value={nfcUid}
                  onChange={(e) => setNfcUid(e.target.value)}
                  autoFocus
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-center text-lg tracking-wider"
                  onKeyDown={(e) => e.key === 'Enter' && scanNfc()}
                />
              </div>
              <button onClick={() => scanNfc()} className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Look Up Member
              </button>
            </div>
          )}
        </Card>

        {/* Member Result */}
        {member ? (
          <div className="space-y-4">
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-500/20 rounded-full flex items-center justify-center">
                    <User size={24} className="text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">{member.name}</h3>
                    <p className="text-sm text-t-secondary">{member.email}</p>
                    <p className="text-xs text-[#636366] font-mono">{member.member_number}</p>
                  </div>
                </div>
                <TierBadge tier={member.tier?.name} color={member.tier?.color_hex} />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-dark-surface2 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{member.current_points?.toLocaleString()}</p>
                  <p className="text-xs text-t-secondary">Current Points</p>
                </div>
                <div className="bg-dark-surface2 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-white">{member.lifetime_points?.toLocaleString()}</p>
                  <p className="text-xs text-t-secondary">Lifetime Points</p>
                </div>
              </div>

              {/* Progress to next tier */}
              {member.progress?.next_tier && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-t-secondary mb-1">
                    <span>{member.tier?.name}</span>
                    <span>{member.progress.next_tier.name} — {member.progress.points_needed.toLocaleString()} pts needed</span>
                  </div>
                  <div className="h-2 bg-dark-surface3 rounded-full">
                    <div
                      className="h-2 bg-primary-500 rounded-full transition-all"
                      style={{ width: `${member.progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Award Points */}
              <div className="border-t border-dark-border pt-4">
                <h4 className="text-sm font-semibold text-[#e0e0e0] mb-3 flex items-center gap-2">
                  <Award size={14} /> Award Points
                </h4>
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Points to award"
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="text"
                    placeholder="Description (e.g. Room 205 stay)"
                    value={pointsDesc}
                    onChange={(e) => setPointsDesc(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button onClick={awardPoints} className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                    Award Points
                  </button>
                </div>
              </div>
            </Card>

            {/* AI Upsell */}
            {aiUpsell && (
              <Card>
                <h4 className="text-sm font-semibold text-[#e0e0e0] mb-2 flex items-center gap-2">
                  <Gift size={14} className="text-primary-400" /> AI Upsell Suggestion
                </h4>
                <p className="text-sm text-[#a0a0a0] leading-relaxed italic">"{aiUpsell}"</p>
              </Card>
            )}
          </div>
        ) : (
          <Card className="flex items-center justify-center">
            <div className="text-center text-[#636366] py-8">
              <QrCode size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Scan a QR code or NFC card to see member details</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
