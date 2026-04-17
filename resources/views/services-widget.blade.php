<!DOCTYPE html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book a Service</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --primary: {{ $color ?: '#2d6a4f' }};
  --primary-hover: color-mix(in srgb, var(--primary) 85%, #000);
  --primary-light: color-mix(in srgb, var(--primary) 12%, transparent);
  --bg: #faf8f5;
  --surface: #ffffff;
  --surface-muted: #f6f3ee;
  --border: #e8e4df;
  --text: #1a1a1a;
  --text-secondary: #6b7280;
  --error: #dc2626;
  --error-bg: #fef2f2;
  --success: #16a34a;
  --success-bg: #f0fdf4;
  --radius: 18px;
  --font: 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.04);
  --shadow: 0 2px 8px rgba(0,0,0,.06);
  --shadow-lg: 0 8px 24px rgba(0,0,0,.08);
}
[data-theme="dark"] {
  --bg: #0d0d0d;
  --surface: #1a1a1a;
  --surface-muted: #202020;
  --border: #2c2c2c;
  --text: #f5f5f5;
  --text-secondary: #9b9ba2;
  --error-bg: rgba(220,38,38,.1);
  --success-bg: rgba(22,163,74,.1);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.2);
  --shadow: 0 2px 8px rgba(0,0,0,.3);
  --shadow-lg: 0 8px 24px rgba(0,0,0,.4);
}

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
button{cursor:pointer;font-family:inherit}
input,select,textarea{font-family:inherit}
img{max-width:100%;display:block}

/* Layout */
.widget{max-width:980px;margin:0 auto;padding:20px 16px}
.page-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
@media(max-width:780px){.page-layout{grid-template-columns:1fr}}

/* Header */
.widget-header{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.widget-header img{height:36px;width:auto;border-radius:6px}
.widget-header .prop-name{font-size:18px;font-weight:700;letter-spacing:-.02em}

/* Stepper */
.stepper{display:flex;align-items:flex-start;justify-content:center;gap:0;margin-bottom:28px;padding:0 8px}
.stepper-item{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.stepper-item:not(:last-child)::after{content:'';position:absolute;top:15px;left:calc(50% + 18px);right:calc(-50% + 18px);height:2px;background:var(--border);transition:background .4s}
.stepper-item:not(:last-child).done::after{background:var(--primary)}
.step-circle{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;border:2px solid var(--border);background:var(--surface);color:var(--text-secondary);transition:all .3s;position:relative;z-index:1}
.stepper-item.active .step-circle,.stepper-item.done .step-circle{border-color:var(--primary);background:var(--primary);color:#fff}
.step-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);margin-top:6px;text-align:center;white-space:nowrap}
.stepper-item.active .step-label,.stepper-item.done .step-label{color:var(--primary)}

/* Card */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:16px;box-shadow:var(--shadow-sm)}
.card-title{font-size:18px;font-weight:700;letter-spacing:-.01em;margin-bottom:4px}
.card-sub{font-size:13px;color:var(--text-secondary);margin-bottom:20px}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 20px;border:none;border-radius:10px;font-size:14px;font-weight:600;transition:all .2s;text-decoration:none}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover);transform:translateY(-1px);box-shadow:var(--shadow)}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{border-color:var(--text-secondary);background:var(--primary-light)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important}
.btn-row{display:flex;gap:12px;margin-top:20px}
.btn-row .btn{flex:1}

/* Form fields */
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px}
.field input,.field select,.field textarea{width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.field textarea{resize:vertical;min-height:72px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:600px){.row{grid-template-columns:1fr}}

/* Category tiles */
.cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.cat-tile{border:2px solid var(--border);border-radius:var(--radius);padding:18px 14px;text-align:center;cursor:pointer;transition:all .2s;background:var(--surface);display:flex;flex-direction:column;align-items:center;gap:8px}
.cat-tile:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border));transform:translateY(-1px);box-shadow:var(--shadow)}
.cat-tile.active{border-color:var(--primary);background:var(--primary-light)}
.cat-ico{width:42px;height:42px;border-radius:12px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700}
.cat-name{font-size:13px;font-weight:600}
.cat-count{font-size:11px;color:var(--text-secondary)}

/* Service cards */
.svc-card{display:flex;gap:0;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:14px;transition:all .25s;cursor:pointer;background:var(--surface)}
.svc-card:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border));box-shadow:var(--shadow-lg);transform:translateY(-1px)}
.svc-card.selected{border-color:var(--primary);box-shadow:0 0 0 2px var(--primary)}
.svc-hero{width:200px;min-height:160px;background:var(--surface-muted);flex-shrink:0;overflow:hidden;position:relative}
.svc-hero img{width:100%;height:100%;object-fit:cover;transition:transform .4s}
.svc-card:hover .svc-hero img{transform:scale(1.04)}
.svc-hero-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-family:var(--font-display);font-size:32px;opacity:.35}
.svc-body{padding:16px 18px;flex:1;display:flex;flex-direction:column;min-width:0}
.svc-name{font-family:var(--font-display);font-size:1.35rem;font-weight:600;line-height:1.2}
.svc-desc{font-size:12px;color:var(--text-secondary);margin:6px 0 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.svc-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary);margin-bottom:10px}
.svc-tag{padding:3px 9px;background:color-mix(in srgb, var(--primary) 6%, transparent);border-radius:20px;font-size:10px;font-weight:600;color:var(--primary)}
.svc-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:10px;border-top:1px solid var(--border)}
.svc-price{font-size:18px;font-weight:700;color:var(--primary)}
.svc-btn{padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;border:2px solid var(--primary);background:transparent;color:var(--primary);transition:all .2s;white-space:nowrap}
.svc-card.selected .svc-btn,.svc-btn:hover{background:var(--primary);color:#fff}
@media(max-width:600px){.svc-card{flex-direction:column}.svc-hero{width:100%;min-height:140px}}

/* Master cards */
.master-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.master-tile{border:2px solid var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;background:var(--surface);transition:all .2s}
.master-tile:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border));transform:translateY(-1px)}
.master-tile.active{border-color:var(--primary);background:var(--primary-light)}
.master-avatar{width:64px;height:64px;border-radius:50%;margin:0 auto 10px;background:var(--surface-muted);overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--primary)}
.master-avatar img{width:100%;height:100%;object-fit:cover}
.master-name{font-size:14px;font-weight:700}
.master-title{font-size:11px;color:var(--text-secondary);margin-top:2px}

/* Calendar */
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.cal-head h3{font-family:var(--font-display);font-size:1.2rem}
.cal-nav{display:flex;gap:6px}
.cal-nav button{width:32px;height:32px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;transition:all .2s}
.cal-nav button:hover{border-color:var(--primary);color:var(--primary)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.cal-dow{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);text-align:center;padding:4px}
.cal-day{aspect-ratio:1;border:1px solid var(--border);border-radius:10px;background:var(--surface);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;color:var(--text);transition:all .15s}
.cal-day.empty{border-color:transparent;background:transparent;cursor:default}
.cal-day.disabled{color:var(--text-secondary);opacity:.35;cursor:not-allowed;background:var(--surface-muted)}
.cal-day.available{cursor:pointer}
.cal-day.available:hover{border-color:var(--primary);color:var(--primary)}
.cal-day.selected{background:var(--primary);color:#fff;border-color:var(--primary)}
.cal-day.today{font-weight:800;border-color:color-mix(in srgb, var(--primary) 40%, var(--border))}

/* Slot grid */
.slot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;margin-top:16px}
.slot-btn{padding:10px 8px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;font-weight:600;transition:all .15s}
.slot-btn:hover{border-color:var(--primary);color:var(--primary)}
.slot-btn.selected{background:var(--primary);color:#fff;border-color:var(--primary)}
.slot-btn:disabled{opacity:.4;cursor:not-allowed}
.slot-empty{padding:30px;text-align:center;color:var(--text-secondary);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius)}

/* Extras */
.extra-card{display:flex;align-items:center;gap:14px;padding:14px;border:2px solid var(--border);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:all .2s;background:var(--surface)}
.extra-card:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border))}
.extra-card.checked{border-color:var(--primary);background:var(--primary-light)}
.extra-check{width:22px;height:22px;border-radius:6px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.extra-card.checked .extra-check{background:var(--primary);border-color:var(--primary)}
.extra-info{flex:1;min-width:0}
.extra-name{font-size:14px;font-weight:600}
.extra-desc{font-size:12px;color:var(--text-secondary)}
.extra-price{font-size:14px;font-weight:700;color:var(--primary);white-space:nowrap}
.extra-hero{width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--surface-muted);flex-shrink:0}
.extra-hero img{width:100%;height:100%;object-fit:cover}

/* Summary */
.summary-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow-sm);position:sticky;top:16px}
.summary-title{font-family:var(--font-display);font-size:1.3rem;font-weight:600;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.summary-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;font-size:13px;padding:6px 0}
.summary-row .lbl{color:var(--text-secondary)}
.summary-row .val{font-weight:600;text-align:right}
.summary-total{margin-top:14px;padding-top:14px;border-top:1.5px solid var(--border);display:flex;justify-content:space-between;font-size:16px;font-weight:700}
.summary-total .val{color:var(--primary);font-size:22px}
.summary-empty{color:var(--text-secondary);font-size:13px;text-align:center;padding:18px 0}

/* Confirmation */
.confirm-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:40px 28px;text-align:center}
.confirm-ico{width:64px;height:64px;border-radius:50%;background:var(--success-bg);color:var(--success);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
.confirm-title{font-family:var(--font-display);font-size:2rem;font-weight:600;margin-bottom:8px}
.confirm-sub{color:var(--text-secondary);font-size:14px;max-width:420px;margin:0 auto 24px}
.confirm-ref{display:inline-block;background:var(--surface-muted);padding:10px 20px;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:700}

/* Loading / error */
.loading{display:flex;flex-direction:column;align-items:center;padding:60px 20px;color:var(--text-secondary)}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:12px}
@keyframes spin{to{transform:rotate(360deg)}}
.error-box{background:var(--error-bg);color:var(--error);border:1px solid var(--error);border-radius:10px;padding:12px 14px;font-size:13px;margin-bottom:16px}

/* Chip */
.chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:var(--primary-light);color:var(--primary);border-radius:20px;font-size:11px;font-weight:600}
</style>
</head>
<body data-theme="">
<div class="widget">

  <div id="app">
    <div class="loading">
      <div class="spinner"></div>
      <div>Loading booking widget…</div>
    </div>
  </div>

</div>

<script>
(function () {
  'use strict'

  // ─── Config (from Blade) ──────────────────────────────────────────
  var CFG = {
    orgToken: @json($orgId),
    apiBase: @json($apiBase),
    lang: @json($lang),
    initialColor: @json($color ?: ''),
    presetCategory: @json(request('category', '')),
    presetService: @json(request('service', '')),
  }

  // ─── State ────────────────────────────────────────────────────────
  var state = {
    config: null,
    error: null,
    step: 1, // 1=service, 2=master, 3=date, 4=slot, 5=details, 6=payment, 7=confirm
    categoryId: null,
    serviceId: null,
    masterId: null,
    date: null,             // YYYY-MM-DD
    startAt: null,          // ISO
    partySize: 1,
    extras: [],             // [{id, quantity}]
    customer: { name: '', email: '', phone: '', notes: '' },
    quote: null,
    availability: { date: null, slots: [], loading: false, error: null },
    calendar: { month: null, dates: {}, loading: false },
    submitting: false,
    booking: null,
    idempotencyKey: null,
    paymentIntent: null,
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0
      var v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
  state.idempotencyKey = uuid()

  // ─── Fetch helpers ─────────────────────────────────────────────────
  function api(path, params) {
    var url = CFG.apiBase + path
    params = params || {}
    params.org = CFG.orgToken
    var qs = Object.keys(params).filter(function (k) { return params[k] != null && params[k] !== '' })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]) })
      .join('&')
    if (qs) url += (url.indexOf('?') > -1 ? '&' : '?') + qs
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body } }) })
  }

  function post(path, payload, extraHeaders) {
    var headers = Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, extraHeaders || {})
    payload = payload || {}
    payload.org = CFG.orgToken
    return fetch(CFG.apiBase + path, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body } }) })
  }

  // ─── Bootstrap ────────────────────────────────────────────────────
  function loadConfig() {
    api('/v1/services/config').then(function (res) {
      if (!res.ok) {
        state.error = (res.body && res.body.error) || 'Failed to load services configuration.'
        render()
        return
      }
      state.config = res.body

      // apply theme
      if (state.config.style && state.config.style.theme) {
        document.body.setAttribute('data-theme', state.config.style.theme)
      }
      var color = CFG.initialColor || (state.config.style && state.config.style.primary_color) || ''
      if (color) document.documentElement.style.setProperty('--primary', color)

      // preselect
      if (CFG.presetCategory) state.categoryId = Number(CFG.presetCategory)
      if (CFG.presetService) {
        state.serviceId = Number(CFG.presetService)
        state.step = 2
      }

      render()
    }).catch(function (e) {
      state.error = 'Network error: ' + e.message
      render()
    })
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  function getService(id) {
    if (!state.config) return null
    id = id || state.serviceId
    return state.config.services.find(function (s) { return s.id === id }) || null
  }
  function getCategory(id) {
    if (!state.config) return null
    id = id || state.categoryId
    return state.config.categories.find(function (c) { return c.id === id }) || null
  }
  function getMaster(id) {
    if (!state.config) return null
    id = id || state.masterId
    return state.config.masters.find(function (m) { return m.id === id }) || null
  }
  function getExtrasForService() {
    if (!state.config) return []
    return state.config.extras
  }
  function servicesInCategory(catId) {
    if (!state.config) return []
    return state.config.services.filter(function (s) { return !catId || s.category_id === catId })
  }
  function mastersForService(svc) {
    if (!svc || !state.config) return []
    return state.config.masters.filter(function (m) { return (svc.master_ids || []).indexOf(m.id) > -1 })
  }
  function fmtMoney(amount, ccy) {
    var n = Number(amount) || 0
    return (ccy || state.config.currency || 'EUR') + ' ' + n.toFixed(2)
  }
  function fmtMinutes(m) {
    m = Number(m) || 0
    if (m < 60) return m + ' min'
    var h = Math.floor(m / 60), r = m % 60
    return r ? h + 'h ' + r + 'm' : h + 'h'
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function resolveImg(path) {
    if (!path) return ''
    if (/^https?:/.test(path)) return path
    var base = CFG.apiBase.replace(/\/api$/, '')
    return base + (path[0] === '/' ? '' : '/') + path
  }
  function ymd(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
  }

  // ─── Actions ──────────────────────────────────────────────────────
  function selectCategory(id) {
    state.categoryId = id
    render()
  }
  function selectService(id) {
    state.serviceId = id
    state.masterId = null
    state.date = null
    state.startAt = null
    state.extras = []
    state.step = 2
    render()
  }
  function selectMaster(id) {
    state.masterId = id
    state.step = 3
    loadCalendar()
    render()
  }
  function goToStep(n) {
    state.step = n
    if (n === 3) loadCalendar()
    render()
  }
  function selectDate(d) {
    state.date = d
    state.startAt = null
    state.step = 4
    loadAvailability()
    render()
  }
  function selectSlot(startIso) {
    state.startAt = startIso
    state.step = 5
    refreshQuote()
    render()
  }
  function toggleExtra(id) {
    var i = state.extras.findIndex(function (x) { return x.id === id })
    if (i > -1) state.extras.splice(i, 1)
    else state.extras.push({ id: id, quantity: 1 })
    refreshQuote()
    render()
  }

  function loadCalendar() {
    var svc = getService()
    if (!svc) return
    var today = new Date()
    var start = today
    var end = new Date(today.getTime() + (state.config.max_advance_days || 60) * 86400000)
    var month = state.calendar.month || (today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0'))
    var firstOfMonth = new Date(month + '-01')
    var lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0)
    start = firstOfMonth < today ? today : firstOfMonth
    end = lastOfMonth

    state.calendar.loading = true
    render()
    api('/v1/services/calendar', {
      service_id: svc.id,
      master_id: state.masterId || undefined,
      start: ymd(start),
      end: ymd(end),
    }).then(function (res) {
      state.calendar.loading = false
      state.calendar.month = month
      if (res.ok) {
        var map = {}
        ;(res.body.available_dates || []).forEach(function (d) { map[d] = true })
        state.calendar.dates = map
      }
      render()
    })
  }

  function navMonth(delta) {
    var m = state.calendar.month || new Date().toISOString().slice(0, 7)
    var parts = m.split('-').map(Number)
    var d = new Date(parts[0], parts[1] - 1 + delta, 1)
    state.calendar.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    loadCalendar()
    render()
  }

  function loadAvailability() {
    var svc = getService()
    if (!svc || !state.date) return
    state.availability = { date: state.date, slots: [], loading: true, error: null }
    render()
    api('/v1/services/availability', {
      service_id: svc.id,
      master_id: state.masterId || undefined,
      date: state.date,
    }).then(function (res) {
      state.availability.loading = false
      if (!res.ok) {
        state.availability.error = (res.body && res.body.error) || 'Unable to load available times.'
      } else {
        state.availability.slots = res.body.slots || []
      }
      render()
    })
  }

  function refreshQuote() {
    var svc = getService()
    if (!svc || !state.startAt) return
    post('/v1/services/quote', {
      service_id: svc.id,
      service_master_id: state.masterId || undefined,
      start_at: state.startAt,
      party_size: state.partySize,
      extras: state.extras,
    }).then(function (res) {
      if (res.ok) state.quote = res.body
      else state.quote = null
      render()
    })
  }

  function submitBooking() {
    var svc = getService()
    if (!svc || !state.startAt) return
    if (!state.customer.name || !state.customer.email) {
      alert('Please enter your name and email.')
      return
    }
    state.submitting = true
    render()
    post('/v1/services/confirm', {
      service_id: svc.id,
      service_master_id: state.masterId || undefined,
      start_at: state.startAt,
      party_size: state.partySize,
      customer_name: state.customer.name,
      customer_email: state.customer.email,
      customer_phone: state.customer.phone,
      customer_notes: state.customer.notes,
      extras: state.extras,
      payment_intent_id: state.paymentIntent ? state.paymentIntent.id : null,
    }, { 'Idempotency-Key': state.idempotencyKey }).then(function (res) {
      state.submitting = false
      if (!res.ok) {
        alert((res.body && res.body.error) || 'Booking failed. Please try again.')
      } else {
        state.booking = res.body
        state.step = 7
      }
      render()
    })
  }

  // ─── Render ───────────────────────────────────────────────────────
  function render() {
    var app = document.getElementById('app')
    if (!app) return
    if (state.error) { app.innerHTML = renderError(state.error); postHeight(); return }
    if (!state.config) { app.innerHTML = renderLoading(); postHeight(); return }

    var html = renderHeader()
    html += renderStepper()
    html += '<div class="page-layout">'
    html += '<div>'
    switch (state.step) {
      case 1: html += renderStep1Service(); break
      case 2: html += renderStep2Master(); break
      case 3: html += renderStep3Date(); break
      case 4: html += renderStep4Slot(); break
      case 5: html += renderStep5Details(); break
      case 7: html += renderStep7Confirm(); break
    }
    html += '</div>'
    if (state.step !== 7 && state.step !== 1) html += '<div>' + renderSummary() + '</div>'
    html += '</div>'

    app.innerHTML = html
    bindEvents()
    postHeight()
  }

  function postHeight() {
    try {
      var h = document.documentElement.scrollHeight
      parent.postMessage({ type: 'hoteltech-services-height', height: h }, '*')
    } catch (e) {}
  }

  function renderHeader() {
    var style = state.config.style || {}
    if (!style.show_name && !style.show_logo) return ''
    var h = '<div class="widget-header">'
    if (style.show_logo && style.logo_url) {
      h += '<img src="' + escapeHtml(resolveImg(style.logo_url)) + '" alt="">'
    }
    if (style.show_name && style.property_name) {
      h += '<div class="prop-name">' + escapeHtml(style.property_name) + '</div>'
    }
    h += '</div>'
    return h
  }

  function renderStepper() {
    var steps = ['Service', 'Master', 'Date', 'Time', 'Details', 'Confirm']
    var current = state.step === 7 ? 6 : state.step
    var h = '<div class="stepper">'
    steps.forEach(function (label, i) {
      var idx = i + 1
      var cls = 'stepper-item'
      if (current === idx) cls += ' active'
      else if (current > idx) cls += ' done'
      h += '<div class="' + cls + '">'
      h += '<div class="step-circle">' + (current > idx ? '✓' : idx) + '</div>'
      h += '<div class="step-label">' + label + '</div>'
      h += '</div>'
    })
    h += '</div>'
    return h
  }

  // Step 1: choose category/service
  function renderStep1Service() {
    var cats = state.config.categories || []
    var h = ''
    if (cats.length > 0) {
      h += '<div class="card"><h2 class="card-title">Choose a category</h2><p class="card-sub">Pick what you\'re interested in to see available services.</p>'
      h += '<div class="cat-grid">'
      h += '<div class="cat-tile' + (state.categoryId === null ? ' active' : '') + '" data-act="cat" data-id="">' +
        '<div class="cat-ico">★</div><div class="cat-name">All</div></div>'
      cats.forEach(function (c) {
        var count = state.config.services.filter(function (s) { return s.category_id === c.id }).length
        var ico = c.icon ? escapeHtml(c.icon.slice(0, 2)) : (c.name || '?').charAt(0)
        h += '<div class="cat-tile' + (state.categoryId === c.id ? ' active' : '') + '" data-act="cat" data-id="' + c.id + '">'
        h += '<div class="cat-ico" style="' + (c.color ? 'background:color-mix(in srgb,' + c.color + ' 14%,transparent);color:' + c.color : '') + '">' + escapeHtml(ico) + '</div>'
        h += '<div class="cat-name">' + escapeHtml(c.name) + '</div>'
        h += '<div class="cat-count">' + count + ' service' + (count === 1 ? '' : 's') + '</div>'
        h += '</div>'
      })
      h += '</div></div>'
    }

    var list = servicesInCategory(state.categoryId)
    h += '<div class="card"><h2 class="card-title">Select a service</h2><p class="card-sub">Choose the treatment or appointment you\'d like to book.</p>'
    if (list.length === 0) {
      h += '<div class="slot-empty">No services available in this category yet.</div>'
    } else {
      list.forEach(function (s) {
        var tagsHtml = ''
        ;(s.tags || []).slice(0, 3).forEach(function (t) { tagsHtml += '<span class="svc-tag">' + escapeHtml(t) + '</span>' })
        var metaHtml = '<span>⏱ ' + fmtMinutes(s.duration_minutes) + '</span>'
        h += '<div class="svc-card' + (state.serviceId === s.id ? ' selected' : '') + '" data-act="svc" data-id="' + s.id + '">'
        h += '<div class="svc-hero">'
        if (s.image) h += '<img src="' + escapeHtml(resolveImg(s.image)) + '" alt="">'
        else h += '<div class="svc-hero-placeholder">' + escapeHtml((s.name || '?').charAt(0)) + '</div>'
        h += '</div>'
        h += '<div class="svc-body">'
        h += '<div class="svc-name">' + escapeHtml(s.name) + '</div>'
        if (s.short_description || s.description) {
          h += '<div class="svc-desc">' + escapeHtml(s.short_description || s.description) + '</div>'
        }
        h += '<div class="svc-meta">' + metaHtml + tagsHtml + '</div>'
        h += '<div class="svc-footer"><div class="svc-price">' + fmtMoney(s.price, s.currency) + '</div>'
        h += '<button class="svc-btn">Select</button></div>'
        h += '</div></div>'
      })
    }
    h += '</div>'
    return h
  }

  // Step 2: choose master
  function renderStep2Master() {
    var svc = getService()
    if (!svc) return ''
    var masters = mastersForService(svc)
    var h = '<div class="card">'
    h += '<h2 class="card-title">Choose your provider</h2><p class="card-sub">Pick a specific professional, or let us pair you with the first available.</p>'
    h += '<div class="master-grid">'
    h += '<div class="master-tile' + (state.masterId === null ? ' active' : '') + '" data-act="mst" data-id="">' +
      '<div class="master-avatar">✨</div><div class="master-name">Any available</div>' +
      '<div class="master-title">First free slot</div></div>'
    masters.forEach(function (m) {
      var initial = (m.name || '?').charAt(0)
      h += '<div class="master-tile' + (state.masterId === m.id ? ' active' : '') + '" data-act="mst" data-id="' + m.id + '">'
      h += '<div class="master-avatar">' + (m.avatar ? '<img src="' + escapeHtml(resolveImg(m.avatar)) + '" alt="">' : escapeHtml(initial)) + '</div>'
      h += '<div class="master-name">' + escapeHtml(m.name) + '</div>'
      if (m.title) h += '<div class="master-title">' + escapeHtml(m.title) + '</div>'
      h += '</div>'
    })
    h += '</div>'
    h += '<div class="btn-row"><button class="btn btn-outline" data-act="back" data-to="1">Back</button>'
    h += '<button class="btn btn-primary" data-act="next" data-to="3">Continue</button></div>'
    h += '</div>'
    return h
  }

  // Step 3: date picker
  function renderStep3Date() {
    var month = state.calendar.month || new Date().toISOString().slice(0, 7)
    var parts = month.split('-').map(Number)
    var first = new Date(parts[0], parts[1] - 1, 1)
    var last = new Date(parts[0], parts[1], 0)
    var startDow = first.getDay() === 0 ? 6 : first.getDay() - 1
    var monthLabel = first.toLocaleString(CFG.lang || 'en', { month: 'long', year: 'numeric' })
    var today = ymd(new Date())

    var h = '<div class="card">'
    h += '<h2 class="card-title">Pick a date</h2><p class="card-sub">Greyed-out days are unavailable or outside our booking window.</p>'
    h += '<div class="cal-head"><h3>' + escapeHtml(monthLabel) + '</h3>'
    h += '<div class="cal-nav"><button data-act="cal-prev">‹</button><button data-act="cal-next">›</button></div></div>'

    h += '<div class="cal-grid">'
    ;['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function (d) {
      h += '<div class="cal-dow">' + d + '</div>'
    })
    for (var i = 0; i < startDow; i++) h += '<div class="cal-day empty"></div>'
    for (var day = 1; day <= last.getDate(); day++) {
      var d = parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      var isPast = d < today
      var isAvail = !!state.calendar.dates[d]
      var cls = 'cal-day'
      if (isPast || !isAvail) cls += ' disabled'
      else cls += ' available'
      if (d === state.date) cls += ' selected'
      if (d === today) cls += ' today'
      var dataAttr = (isPast || !isAvail) ? '' : 'data-act="date" data-id="' + d + '"'
      h += '<div class="' + cls + '" ' + dataAttr + '>' + day + '</div>'
    }
    h += '</div>'

    if (state.calendar.loading) h += '<div class="loading" style="padding:14px;"><div class="spinner"></div></div>'

    h += '<div class="btn-row"><button class="btn btn-outline" data-act="back" data-to="2">Back</button></div>'
    h += '</div>'
    return h
  }

  // Step 4: slot picker
  function renderStep4Slot() {
    var dateLabel = ''
    try { dateLabel = new Date(state.date).toLocaleDateString(CFG.lang || 'en', { weekday:'long', month:'long', day:'numeric' }) } catch (e) {}

    var h = '<div class="card">'
    h += '<h2 class="card-title">Pick a time</h2><p class="card-sub">Available start times for ' + escapeHtml(dateLabel) + '.</p>'
    if (state.availability.loading) {
      h += '<div class="loading"><div class="spinner"></div><div>Checking availability…</div></div>'
    } else if (state.availability.error) {
      h += '<div class="error-box">' + escapeHtml(state.availability.error) + '</div>'
    } else if ((state.availability.slots || []).length === 0) {
      h += '<div class="slot-empty">No available times on this day. Try another date.</div>'
    } else {
      h += '<div class="slot-grid">'
      state.availability.slots.forEach(function (s) {
        var sel = s.start === state.startAt ? ' selected' : ''
        h += '<button class="slot-btn' + sel + '" data-act="slot" data-id="' + escapeHtml(s.start) + '">' + escapeHtml(s.time_label) + '</button>'
      })
      h += '</div>'
    }
    h += '<div class="btn-row"><button class="btn btn-outline" data-act="back" data-to="3">Back</button></div>'
    h += '</div>'
    return h
  }

  // Step 5: details + extras
  function renderStep5Details() {
    var extras = getExtrasForService()
    var h = '<div class="card">'
    h += '<h2 class="card-title">Your details</h2><p class="card-sub">We\'ll send confirmation to the email you provide.</p>'
    h += '<div class="row">'
    h += '<div class="field"><label>Full name *</label><input data-act="customer" data-field="name" value="' + escapeHtml(state.customer.name) + '" placeholder="Jane Doe"></div>'
    h += '<div class="field"><label>Email *</label><input type="email" data-act="customer" data-field="email" value="' + escapeHtml(state.customer.email) + '" placeholder="jane@example.com"></div>'
    h += '</div>'
    h += '<div class="row">'
    h += '<div class="field"><label>Phone</label><input data-act="customer" data-field="phone" value="' + escapeHtml(state.customer.phone) + '" placeholder="+1 ..."></div>'
    h += '<div class="field"><label>Party size</label><input type="number" min="1" max="20" data-act="party" value="' + state.partySize + '"></div>'
    h += '</div>'
    h += '<div class="field"><label>Notes (optional)</label><textarea data-act="customer" data-field="notes" placeholder="Anything we should know?">' + escapeHtml(state.customer.notes) + '</textarea></div>'
    h += '</div>'

    if (extras.length > 0) {
      h += '<div class="card"><h2 class="card-title">Add extras</h2><p class="card-sub">Optional upgrades and add-ons.</p>'
      extras.forEach(function (x) {
        var checked = state.extras.some(function (e) { return e.id === x.id })
        var priceNote = x.price_type === 'per_person' ? ' / person' : ''
        h += '<div class="extra-card' + (checked ? ' checked' : '') + '" data-act="extra" data-id="' + x.id + '">'
        if (x.image) h += '<div class="extra-hero"><img src="' + escapeHtml(resolveImg(x.image)) + '" alt=""></div>'
        h += '<div class="extra-check">' + (checked ? '✓' : '') + '</div>'
        h += '<div class="extra-info"><div class="extra-name">' + escapeHtml(x.name) + '</div>'
        if (x.description) h += '<div class="extra-desc">' + escapeHtml(x.description) + '</div>'
        h += '</div>'
        h += '<div class="extra-price">' + fmtMoney(x.price, x.currency) + '<span style="font-weight:500;color:var(--text-secondary);font-size:11px">' + priceNote + '</span></div>'
        h += '</div>'
      })
      h += '</div>'
    }

    h += '<div class="card">'
    h += '<div class="btn-row"><button class="btn btn-outline" data-act="back" data-to="4">Back</button>'
    h += '<button class="btn btn-primary" data-act="submit"' + (state.submitting ? ' disabled' : '') + '>'
    h += (state.submitting ? 'Booking…' : 'Confirm booking') + '</button></div>'
    if (state.config.cancellation_policy) {
      h += '<p style="font-size:11px;color:var(--text-secondary);margin-top:12px;text-align:center">' + escapeHtml(state.config.cancellation_policy) + '</p>'
    }
    h += '</div>'
    return h
  }

  // Step 7: confirmation
  function renderStep7Confirm() {
    var b = state.booking
    if (!b) return ''
    var ref = b.booking_reference || (b.booking && b.booking.booking_reference)
    var booking = b.booking || {}
    var startLabel = ''
    try { startLabel = new Date(booking.start_at).toLocaleString(CFG.lang || 'en', { weekday:'long', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' }) } catch(e) {}
    var h = '<div class="confirm-card">'
    h += '<div class="confirm-ico">'
    h += '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    h += '</div>'
    h += '<div class="confirm-title">Booking confirmed</div>'
    h += '<div class="confirm-sub">Thanks ' + escapeHtml(booking.customer_name || '') + '! We\'ve booked your appointment and sent a confirmation to ' + escapeHtml(booking.customer_email || '') + '.</div>'
    if (startLabel) h += '<div style="margin-bottom:14px;font-size:15px"><strong>' + escapeHtml(startLabel) + '</strong></div>'
    if (ref) h += '<div class="confirm-ref">' + escapeHtml(ref) + '</div>'
    h += '<div style="margin-top:28px"><button class="btn btn-outline" style="width:auto;padding:10px 22px" data-act="again">Book another service</button></div>'
    h += '</div>'
    return h
  }

  function renderSummary() {
    var svc = getService()
    var master = getMaster()
    var h = '<div class="summary-card">'
    h += '<div class="summary-title">Your booking</div>'
    if (!svc) {
      h += '<div class="summary-empty">Select a service to get started.</div>'
      h += '</div>'
      return h
    }
    h += '<div class="summary-row"><span class="lbl">Service</span><span class="val">' + escapeHtml(svc.name) + '</span></div>'
    h += '<div class="summary-row"><span class="lbl">Duration</span><span class="val">' + fmtMinutes(svc.duration_minutes) + '</span></div>'
    if (master) h += '<div class="summary-row"><span class="lbl">Master</span><span class="val">' + escapeHtml(master.name) + '</span></div>'
    else if (state.step >= 3) h += '<div class="summary-row"><span class="lbl">Master</span><span class="val">Any available</span></div>'
    if (state.date) {
      var dateLabel = ''
      try { dateLabel = new Date(state.date).toLocaleDateString(CFG.lang || 'en', { month:'short', day:'numeric', year:'numeric' }) } catch(e) { dateLabel = state.date }
      h += '<div class="summary-row"><span class="lbl">Date</span><span class="val">' + escapeHtml(dateLabel) + '</span></div>'
    }
    if (state.startAt) {
      var t = ''
      try { t = new Date(state.startAt).toLocaleTimeString(CFG.lang || 'en', { hour:'2-digit', minute:'2-digit' }) } catch(e) {}
      h += '<div class="summary-row"><span class="lbl">Time</span><span class="val">' + escapeHtml(t) + '</span></div>'
    }

    var q = state.quote
    if (q) {
      h += '<div class="summary-row"><span class="lbl">Service</span><span class="val">' + fmtMoney(q.service_price, q.currency) + '</span></div>'
      ;(q.extras || []).forEach(function (e) {
        h += '<div class="summary-row"><span class="lbl">' + escapeHtml(e.name) + ' ×' + e.quantity + '</span><span class="val">' + fmtMoney(e.line_total, q.currency) + '</span></div>'
      })
      h += '<div class="summary-total"><span>Total</span><span class="val">' + fmtMoney(q.total_amount, q.currency) + '</span></div>'
    } else if (!state.startAt) {
      h += '<div class="summary-row"><span class="lbl">Total</span><span class="val">' + fmtMoney(svc.price, svc.currency) + '</span></div>'
    }
    h += '</div>'
    return h
  }

  function renderLoading() {
    return '<div class="loading"><div class="spinner"></div><div>Loading…</div></div>'
  }
  function renderError(msg) {
    return '<div class="card"><div class="error-box">' + escapeHtml(msg) + '</div></div>'
  }

  // ─── Event binding ────────────────────────────────────────────────
  function bindEvents() {
    var app = document.getElementById('app')
    app.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.getAttribute('data-act')
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.addEventListener('input', function (e) { handle(act, el, e) })
      } else {
        el.addEventListener('click', function (e) { handle(act, el, e) })
      }
    })
  }

  function handle(act, el, e) {
    if (act === 'cat') { selectCategory(el.getAttribute('data-id') ? Number(el.getAttribute('data-id')) : null); return }
    if (act === 'svc') { selectService(Number(el.getAttribute('data-id'))); return }
    if (act === 'mst') { state.masterId = el.getAttribute('data-id') ? Number(el.getAttribute('data-id')) : null; render(); return }
    if (act === 'back') { goToStep(Number(el.getAttribute('data-to'))); return }
    if (act === 'next') { goToStep(Number(el.getAttribute('data-to'))); return }
    if (act === 'date') { selectDate(el.getAttribute('data-id')); return }
    if (act === 'slot') { selectSlot(el.getAttribute('data-id')); return }
    if (act === 'cal-prev') { navMonth(-1); return }
    if (act === 'cal-next') { navMonth(1); return }
    if (act === 'extra') { toggleExtra(Number(el.getAttribute('data-id'))); return }
    if (act === 'customer') { state.customer[el.getAttribute('data-field')] = el.value; return }
    if (act === 'party') { state.partySize = Math.max(1, Number(el.value) || 1); refreshQuote(); return }
    if (act === 'submit') { submitBooking(); return }
    if (act === 'again') {
      state = Object.assign({}, state, {
        step: 1, categoryId: null, serviceId: null, masterId: null,
        date: null, startAt: null, extras: [], quote: null, booking: null,
        customer: { name: '', email: '', phone: '', notes: '' },
        idempotencyKey: uuid(),
        availability: { date: null, slots: [], loading: false, error: null },
        calendar: { month: null, dates: {}, loading: false },
      })
      render()
      return
    }
  }

  // ─── Go ───────────────────────────────────────────────────────────
  loadConfig()
})()
</script>
</body>
</html>
