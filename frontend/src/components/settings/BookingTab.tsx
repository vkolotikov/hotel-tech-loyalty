import { useState } from 'react'
import {
  Globe, Shield, ExternalLink, Copy, Palette, Sun, Moon, Bed, Plus, Trash2,
  Image, Star, Clock, Settings2, DollarSign, ToggleLeft, Zap,
} from 'lucide-react'

/**
 * Booking tab — extracted from Settings.tsx (was ~550 LOC inline). Owns all
 * its own state, type defs, and CRUD helpers; only needs the shared
 * settings-getter/setter and the styling tokens from the parent. Pulled out
 * because it's the largest of the eight tabs and was responsible for the bulk
 * of Settings.tsx's bloat.
 */

type BookingUnit = {
  id: string; name: string; description: string; max_guests: number;
  price_per_night: number; bed_type: string; image: string;
}
type BookingExtra = {
  id: string; name: string; description: string; price: number;
  per: 'night' | 'stay' | 'person';
}
type BookingPolicies = {
  check_in_time: string; check_out_time: string;
  cancellation_policy: string; payment_terms: string;
}

const BED_TYPES = ['Single', 'Double', 'Twin', 'King', 'Suite']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'AED', 'SAR', 'THB', 'JPY', 'AUD', 'CAD', 'SGD', 'INR', 'BRL', 'ZAR', 'ILS']

interface Props {
  getVal: (key: string) => string
  handleChange: (key: string, value: string) => void
  widgetToken: string
  cardClass: string
  cardStyle: React.CSSProperties
  inputClass: string
  btnPrimary: string
}

export function BookingTab({ getVal, handleChange, widgetToken, cardClass, cardStyle, inputClass, btnPrimary }: Props) {
  const widgetBaseUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost/hotel-tech/apps/loyalty/backend/public'
  const embedSnippet = `<!-- Hotel Tech Booking Widget -->\n<div id="hoteltech-booking"></div>\n<script src="${widgetBaseUrl}/widget/booking-loader.js"\n        data-org="${widgetToken}"></script>`
  const iframePreviewUrl = `${widgetBaseUrl}/booking-widget?org=${widgetToken}`
  const directBookingUrl = `${widgetBaseUrl}/book/${widgetToken}`

  const [embedCopied, setEmbedCopied] = useState(false)
  const [directUrlCopied, setDirectUrlCopied] = useState(false)

  const parseJsonSetting = <T,>(key: string, fallback: T): T => {
    const raw = getVal(key)
    if (!raw) return fallback
    try { return JSON.parse(raw) } catch { return fallback }
  }

  const bookingUnits: BookingUnit[] = parseJsonSetting('booking_units', [])
  const bookingExtras: BookingExtra[] = parseJsonSetting('booking_extras', [])
  const bookingPolicies: BookingPolicies = parseJsonSetting('booking_policies', {
    check_in_time: '15:00', check_out_time: '11:00', cancellation_policy: '', payment_terms: '',
  })

  const updateUnits = (units: BookingUnit[]) => handleChange('booking_units', JSON.stringify(units))
  const updateExtras = (extras: BookingExtra[]) => handleChange('booking_extras', JSON.stringify(extras))
  const updatePolicies = (policies: BookingPolicies) => handleChange('booking_policies', JSON.stringify(policies))

  const addUnit = () => {
    updateUnits([...bookingUnits, { id: crypto.randomUUID().slice(0, 8), name: '', description: '', max_guests: 2, price_per_night: 0, bed_type: 'Double', image: '' }])
  }
  const removeUnit = (id: string) => updateUnits(bookingUnits.filter(u => u.id !== id))
  const patchUnit = (id: string, patch: Partial<BookingUnit>) => updateUnits(bookingUnits.map(u => u.id === id ? { ...u, ...patch } : u))

  const addExtra = () => {
    updateExtras([...bookingExtras, { id: crypto.randomUUID().slice(0, 8), name: '', description: '', price: 0, per: 'stay' }])
  }
  const removeExtra = (id: string) => updateExtras(bookingExtras.filter(e => e.id !== id))
  const patchExtra = (id: string, patch: Partial<BookingExtra>) => updateExtras(bookingExtras.map(e => e.id === id ? { ...e, ...patch } : e))

  const widgetTheme = getVal('booking_widget_theme') || 'light'
  const widgetColor = getVal('booking_widget_color') || '#2d6a4f'
  const widgetRadius = getVal('booking_widget_radius') || '12'
  const widgetShowName = (getVal('booking_widget_show_name') || 'true') !== 'false'
  const widgetPropertyName = getVal('booking_widget_property_name') || getVal('company_name') || 'Your Hotel'
  const widgetShowLogo = getVal('booking_widget_show_logo') === 'true'

  return (
    <div className="space-y-6">

      {/* ── Section 1: Widget Embed & Preview ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Globe size={15} className="text-blue-400" /> Embeddable Booking Widget
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Copy the code below and paste it into any page on your website. Each company gets a unique widget scoped to their organization.
        </p>

        {!widgetToken ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
            <p className="text-xs text-amber-400">No organization found. Complete the setup wizard first to get your booking widget embed code.</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <pre className="text-xs font-mono bg-black/40 border border-white/[0.06] rounded-xl p-4 overflow-x-auto text-gray-300 whitespace-pre-wrap">{embedSnippet}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(embedSnippet); setEmbedCopied(true); setTimeout(() => setEmbedCopied(false), 2000); }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{ background: embedCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: embedCopied ? '#22c55e' : '#8e8e93', border: embedCopied ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
                {embedCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Shield size={11} /> Widget Token: <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-gray-400 text-[10px]">{widgetToken}</code>
              </span>
              <a href={iframePreviewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={11} /> Preview widget
              </a>
            </div>

            {/* Direct Booking URL */}
            <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-gray-400 font-semibold mb-2">Direct Booking URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-gray-300 overflow-x-auto">{directBookingUrl}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(directBookingUrl); setDirectUrlCopied(true); setTimeout(() => setDirectUrlCopied(false), 2000); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex-shrink-0"
                  style={{ background: directUrlCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: directUrlCopied ? '#22c55e' : '#8e8e93', border: directUrlCopied ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <Copy size={10} /> {directUrlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">A standalone booking page guests can navigate to directly.</p>
            </div>

            {/* Customization hint */}
            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <strong className="text-gray-400">Optional attributes:</strong>{' '}
                <code className="text-gray-400">data-lang="en"</code> for language,{' '}
                <code className="text-gray-400">data-primary-color="#c9a84c"</code> to match your brand,{' '}
                <code className="text-gray-400">data-container="my-id"</code> for a custom container element ID.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Widget Appearance ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Palette size={15} className="text-emerald-400" /> Widget Appearance
        </h3>
        <p className="text-xs text-gray-500 mb-5">Customize how the booking widget looks on your site.</p>

        <div className="space-y-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Theme</label>
              <p className="text-xs text-gray-500 mt-0.5">Light or dark mode for the widget</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1" style={{ background: 'rgba(15,28,24,0.6)' }}>
              <button onClick={() => handleChange('booking_widget_theme', 'light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'light' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Sun size={12} /> Light
              </button>
              <button onClick={() => handleChange('booking_widget_theme', 'dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'dark' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Moon size={12} /> Dark
              </button>
            </div>
          </div>

          {/* Primary Color */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Primary Color</label>
              <p className="text-xs text-gray-500 mt-0.5">Main accent color for buttons and highlights</p>
            </div>
            <div className="flex items-center gap-2 w-48">
              <input type="color" value={widgetColor}
                onChange={e => handleChange('booking_widget_color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
              <input type="text" value={widgetColor}
                onChange={e => handleChange('booking_widget_color', e.target.value)}
                placeholder="#2d6a4f" maxLength={7}
                className={inputClass + ' flex-1 font-mono'} />
            </div>
          </div>

          {/* Border Radius */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Border Radius</label>
              <p className="text-xs text-gray-500 mt-0.5">Roundness of UI elements ({widgetRadius}px)</p>
            </div>
            <div className="flex items-center gap-3 w-48">
              <input type="range" min={0} max={24} value={Number(widgetRadius)}
                onChange={e => handleChange('booking_widget_radius', e.target.value)}
                className="flex-1 accent-emerald-500" />
              <span className="text-xs text-gray-400 font-mono w-8 text-right">{widgetRadius}px</span>
            </div>
          </div>

          {/* Show Property Name */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Show Property Name</label>
              <p className="text-xs text-gray-500 mt-0.5">Display your hotel name in the widget header</p>
            </div>
            <button onClick={() => handleChange('booking_widget_show_name', widgetShowName ? 'false' : 'true')}
              className={`relative w-12 h-6 rounded-full transition-colors ${widgetShowName ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${widgetShowName ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Property Display Name */}
          {widgetShowName && (
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <div>
                <label className="block text-sm font-medium text-white">Property Display Name</label>
                <p className="text-xs text-gray-500 mt-0.5">Name shown in the widget header</p>
              </div>
              <div className="w-48">
                <input type="text" value={widgetPropertyName}
                  onChange={e => handleChange('booking_widget_property_name', e.target.value)}
                  placeholder="Your Hotel" className={inputClass} />
              </div>
            </div>
          )}

          {/* Show Logo */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Show Logo</label>
              <p className="text-xs text-gray-500 mt-0.5">Display your company logo in the widget</p>
            </div>
            <button onClick={() => handleChange('booking_widget_show_logo', widgetShowLogo ? 'false' : 'true')}
              className={`relative w-12 h-6 rounded-full transition-colors ${widgetShowLogo ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${widgetShowLogo ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Live mini-preview */}
        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Live Preview</p>
          <div className="rounded-xl overflow-hidden border border-white/[0.08]"
            style={{
              borderRadius: `${widgetRadius}px`,
              background: widgetTheme === 'dark' ? '#1a1a2e' : '#ffffff',
              maxWidth: 360,
            }}>
            {/* Widget header */}
            <div className="px-4 py-3 flex items-center gap-2.5"
              style={{ borderBottom: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              {widgetShowLogo && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: widgetColor }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>H</span>
                </div>
              )}
              {widgetShowName && (
                <span style={{ color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a', fontSize: 13, fontWeight: 600 }}>{widgetPropertyName}</span>
              )}
            </div>
            {/* Widget body mock */}
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg p-2" style={{
                  background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                }}>
                  <p style={{ fontSize: 9, color: widgetTheme === 'dark' ? '#aaa' : '#666', marginBottom: 2 }}>Check-in</p>
                  <p style={{ fontSize: 11, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a', fontWeight: 600 }}>Apr 15, 2026</p>
                </div>
                <div className="flex-1 rounded-lg p-2" style={{
                  background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                }}>
                  <p style={{ fontSize: 9, color: widgetTheme === 'dark' ? '#aaa' : '#666', marginBottom: 2 }}>Check-out</p>
                  <p style={{ fontSize: 11, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a', fontWeight: 600 }}>Apr 18, 2026</p>
                </div>
              </div>
              <div className="rounded-lg p-2.5" style={{
                background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
              }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a' }}>Deluxe Room</p>
                <p style={{ fontSize: 10, color: widgetTheme === 'dark' ? '#aaa' : '#666' }}>2 guests &middot; King bed</p>
              </div>
              <button style={{
                width: '100%', padding: '8px 0', borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                backgroundColor: widgetColor, color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'default',
              }}>Book Now</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Rooms / Units Configuration ── */}
      <div className={cardClass} style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bed size={15} className="text-emerald-400" /> Rooms / Units
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Configure the rooms or units available for booking.</p>
          </div>
          <button onClick={addUnit}
            className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 text-xs'}>
            <Plus size={13} /> Add Room
          </button>
        </div>

        {bookingUnits.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-white/[0.08]">
            <Bed size={24} className="mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No rooms configured yet.</p>
            <p className="text-xs text-gray-600 mt-1">Click "Add Room" to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingUnits.map((unit, idx) => (
              <div key={unit.id} className="rounded-xl border border-white/[0.06] p-4 hover:border-white/[0.1] transition-colors"
                style={{ background: 'rgba(15,28,24,0.5)' }}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-500 border border-white/[0.06]">
                    Room {idx + 1}
                  </span>
                  <button onClick={() => removeUnit(unit.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Name</label>
                    <input type="text" value={unit.name} placeholder="e.g. Deluxe Room"
                      onChange={e => patchUnit(unit.id, { name: e.target.value })}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Bed Type</label>
                    <select value={unit.bed_type} onChange={e => patchUnit(unit.id, { bed_type: e.target.value })}
                      className={inputClass + ' appearance-none cursor-pointer'}>
                      {BED_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Max Guests</label>
                    <input type="number" value={unit.max_guests} min={1} max={20}
                      onChange={e => patchUnit(unit.id, { max_guests: parseInt(e.target.value) || 1 })}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Price / Night</label>
                    <input type="number" value={unit.price_per_night} min={0} step={0.01}
                      onChange={e => patchUnit(unit.id, { price_per_night: parseFloat(e.target.value) || 0 })}
                      className={inputClass} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Description</label>
                    <input type="text" value={unit.description} placeholder="Short description..."
                      onChange={e => patchUnit(unit.id, { description: e.target.value })}
                      className={inputClass} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Image URL</label>
                    <div className="flex items-center gap-2">
                      <Image size={13} className="text-gray-600 flex-shrink-0" />
                      <input type="text" value={unit.image} placeholder="https://..."
                        onChange={e => patchUnit(unit.id, { image: e.target.value })}
                        className={inputClass + ' flex-1'} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 4: Extras Configuration ── */}
      <div className={cardClass} style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Star size={15} className="text-emerald-400" /> Extras & Add-ons
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Optional extras guests can add to their booking.</p>
          </div>
          <button onClick={addExtra}
            className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 text-xs'}>
            <Plus size={13} /> Add Extra
          </button>
        </div>

        {bookingExtras.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-white/[0.08]">
            <Star size={24} className="mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No extras configured yet.</p>
            <p className="text-xs text-gray-600 mt-1">Add breakfast, parking, spa access, etc.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingExtras.map((extra, idx) => (
              <div key={extra.id} className="rounded-xl border border-white/[0.06] p-4 hover:border-white/[0.1] transition-colors"
                style={{ background: 'rgba(15,28,24,0.5)' }}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-500 border border-white/[0.06]">
                    Extra {idx + 1}
                  </span>
                  <button onClick={() => removeExtra(extra.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Name</label>
                    <input type="text" value={extra.name} placeholder="e.g. Breakfast"
                      onChange={e => patchExtra(extra.id, { name: e.target.value })}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Price</label>
                    <input type="number" value={extra.price} min={0} step={0.01}
                      onChange={e => patchExtra(extra.id, { price: parseFloat(e.target.value) || 0 })}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Per</label>
                    <select value={extra.per} onChange={e => patchExtra(extra.id, { per: e.target.value as 'night' | 'stay' | 'person' })}
                      className={inputClass + ' appearance-none cursor-pointer'}>
                      <option value="night">Per Night</option>
                      <option value="stay">Per Stay</option>
                      <option value="person">Per Person</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Description</label>
                    <input type="text" value={extra.description} placeholder="Short description..."
                      onChange={e => patchExtra(extra.id, { description: e.target.value })}
                      className={inputClass} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 5: Policies ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Shield size={15} className="text-emerald-400" /> Policies
        </h3>
        <p className="text-xs text-gray-500 mb-5">Check-in/out times and booking policies shown to guests.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
              <Clock size={10} /> Check-in Time
            </label>
            <input type="text" value={bookingPolicies.check_in_time} placeholder="15:00"
              onChange={e => updatePolicies({ ...bookingPolicies, check_in_time: e.target.value })}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
              <Clock size={10} /> Check-out Time
            </label>
            <input type="text" value={bookingPolicies.check_out_time} placeholder="11:00"
              onChange={e => updatePolicies({ ...bookingPolicies, check_out_time: e.target.value })}
              className={inputClass} />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cancellation Policy</label>
            <textarea value={bookingPolicies.cancellation_policy}
              onChange={e => updatePolicies({ ...bookingPolicies, cancellation_policy: e.target.value })}
              placeholder="e.g. Free cancellation up to 48 hours before check-in..."
              rows={3} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Payment Terms</label>
            <textarea value={bookingPolicies.payment_terms}
              onChange={e => updatePolicies({ ...bookingPolicies, payment_terms: e.target.value })}
              placeholder="e.g. Full payment required at time of booking..."
              rows={3} className={inputClass} />
          </div>
        </div>
      </div>

      {/* ── Section 6: General Booking Settings ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Settings2 size={15} className="text-emerald-400" /> General Booking Settings
        </h3>
        <p className="text-xs text-gray-500 mb-5">Currency, stay limits, and system modes.</p>

        <div className="space-y-4">
          {/* Currency */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white flex items-center gap-1.5"><DollarSign size={13} className="text-gray-500" /> Currency</label>
              <p className="text-xs text-gray-500 mt-0.5">Currency used for pricing display</p>
            </div>
            <div className="w-40">
              <select value={getVal('booking_currency') || 'EUR'}
                onChange={e => handleChange('booking_currency', e.target.value)}
                className={inputClass + ' appearance-none cursor-pointer'}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Min Nights */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Minimum Nights</label>
              <p className="text-xs text-gray-500 mt-0.5">Minimum stay length required</p>
            </div>
            <div className="w-40">
              <input type="number" value={getVal('booking_min_nights') || '1'} min={1} max={30}
                onChange={e => handleChange('booking_min_nights', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          {/* Max Nights */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Maximum Nights</label>
              <p className="text-xs text-gray-500 mt-0.5">Maximum stay length allowed</p>
            </div>
            <div className="w-40">
              <input type="number" value={getVal('booking_max_nights') || '30'} min={1} max={365}
                onChange={e => handleChange('booking_max_nights', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          {/* Mock Mode */}
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="block text-sm font-medium text-white flex items-center gap-1.5">
                <ToggleLeft size={13} className="text-gray-500" /> Mock Mode
              </label>
              <p className="text-xs text-gray-500 mt-0.5">When enabled, bookings are simulated and no real charges or emails are sent. Useful for testing.</p>
            </div>
            <button onClick={() => handleChange('booking_mock_mode', (getVal('booking_mock_mode') || 'false') === 'true' ? 'false' : 'true')}
              className={`relative w-12 h-6 rounded-full transition-colors ${(getVal('booking_mock_mode') || 'false') === 'true' ? 'bg-amber-500' : 'bg-white/[0.08]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${(getVal('booking_mock_mode') || 'false') === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {(getVal('booking_mock_mode') || 'false') === 'true' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                <Zap size={11} /> Mock mode is active. All bookings will be simulated &mdash; no charges or confirmation emails will be sent.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
