<!DOCTYPE html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book Your Stay</title>
<style>
:root {
  --primary: {{ $color ?: '#c9a84c' }};
  --bg: #0d0d0d;
  --surface: #161616;
  --border: #2c2c2c;
  --text: #ffffff;
  --text2: #8e8e93;
  --radius: 12px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased}
button{cursor:pointer;font-family:inherit}
input,select{font-family:inherit}

.widget{max-width:560px;margin:0 auto;padding:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px}
.card h2{font-size:16px;font-weight:700;margin-bottom:4px}
.card p.sub{font-size:12px;color:var(--text2);margin-bottom:16px}

/* Steps indicator */
.steps{display:flex;gap:8px;margin-bottom:20px}
.step{flex:1;height:3px;border-radius:2px;background:var(--border);transition:background .3s}
.step.active{background:var(--primary)}
.step.done{background:var(--primary);opacity:.5}

/* Form elements */
.field{margin-bottom:14px}
.field label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:5px}
.field input,.field select{width:100%;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:border-color .2s}
.field input:focus,.field select:focus{border-color:var(--primary)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px 20px;border:none;border-radius:10px;font-size:14px;font-weight:600;transition:all .2s}
.btn-primary{background:var(--primary);color:#000}
.btn-primary:hover{opacity:.9}
.btn-secondary{background:rgba(255,255,255,.06);color:var(--text);border:1px solid var(--border)}
.btn-secondary:hover{background:rgba(255,255,255,.1)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-row{display:flex;gap:10px;margin-top:16px}
.btn-row .btn{flex:1}

/* Unit cards */
.unit{display:flex;gap:14px;padding:14px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;cursor:pointer;transition:all .2s}
.unit:hover,.unit.selected{border-color:var(--primary);background:rgba(255,255,255,.02)}
.unit.selected{box-shadow:0 0 0 1px var(--primary)}
.unit-img{width:90px;height:68px;border-radius:8px;object-fit:cover;background:var(--border);flex-shrink:0}
.unit-info{flex:1;min-width:0}
.unit-name{font-size:14px;font-weight:600}
.unit-desc{font-size:11px;color:var(--text2);margin:2px 0 4px}
.unit-price{font-size:15px;font-weight:700;color:var(--primary)}
.unit-price span{font-size:11px;color:var(--text2);font-weight:400}

/* Extras */
.extra{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px}
.extra label{flex:1;font-size:13px;cursor:pointer}
.extra .price{font-size:13px;font-weight:600;color:var(--primary);white-space:nowrap}
.extra input[type="checkbox"]{width:18px;height:18px;accent-color:var(--primary)}

/* Summary */
.summary-line{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
.summary-line.total{border-top:1px solid var(--border);padding-top:12px;margin-top:8px;font-size:15px;font-weight:700}
.summary-line.total .amount{color:var(--primary)}

/* Success */
.success{text-align:center;padding:32px 16px}
.success .icon{width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,.12);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
.success .icon svg{color:#22c55e}
.success h2{font-size:20px;margin-bottom:8px}
.success p{color:var(--text2);font-size:13px}
.success .ref{display:inline-block;margin-top:12px;padding:8px 16px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:14px;letter-spacing:1px}

/* Loading */
.loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text2);font-size:13px}
.spinner{width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .6s linear infinite;margin-right:10px}
@keyframes spin{to{transform:rotate(360deg)}}

/* Error */
.error-box{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:#f87171}

/* Powered by */
.powered{text-align:center;padding:12px;font-size:10px;color:var(--text2);opacity:.6}
.powered a{color:var(--text2);text-decoration:none}
</style>
</head>
<body>
<div class="widget" id="app">
  <div class="loading"><div class="spinner"></div> Loading booking widget&hellip;</div>
</div>

<script>
;(function(){
'use strict';

var ORG_ID  = '{{ $orgId }}';
var API_BASE = '{{ $apiBase }}';
var LANG    = '{{ $lang }}';

/* ─── State ───────────────────────────────────────────────────────────── */
var state = {
  step: 1,         // 1=search, 2=select unit, 3=extras, 4=guest details, 5=success
  config: null,
  loading: true,
  error: null,
  // Search
  checkIn: '',
  checkOut: '',
  adults: 2,
  children: 0,
  // Results
  available: [],
  selectedUnit: null,
  // Extras
  selectedExtras: {},
  // Quote
  quote: null,
  quoteLoading: false,
  // Guest
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  // Confirm
  confirming: false,
  confirmation: null,
};

var $app = document.getElementById('app');

/* ─── API helper ──────────────────────────────────────────────────────── */
function apiGet(path, params) {
  params = params || {};
  params.org = ORG_ID;
  var qs = Object.keys(params).map(function(k){ return k+'='+encodeURIComponent(params[k]); }).join('&');
  return fetch(API_BASE + '/v1/booking/' + path + '?' + qs)
    .then(function(r){ return r.json(); });
}
function apiPost(path, body) {
  body = body || {};
  body.org = ORG_ID;
  return fetch(API_BASE + '/v1/booking/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Org-Token': ORG_ID },
    body: JSON.stringify(body)
  }).then(function(r){ return r.json(); });
}

/* ─── Render ──────────────────────────────────────────────────────────── */
function render() {
  var html = '';

  // Steps
  html += '<div class="steps">';
  for (var i = 1; i <= 4; i++) {
    var cls = i < state.step ? 'step done' : (i === state.step ? 'step active' : 'step');
    html += '<div class="' + cls + '"></div>';
  }
  html += '</div>';

  if (state.loading) {
    html += '<div class="loading"><div class="spinner"></div> Loading&hellip;</div>';
  } else if (state.step === 1) {
    html += renderSearch();
  } else if (state.step === 2) {
    html += renderUnits();
  } else if (state.step === 3) {
    html += renderExtras();
  } else if (state.step === 4) {
    html += renderGuest();
  } else if (state.step === 5) {
    html += renderSuccess();
  }

  html += '<div class="powered">Powered by <a href="#">Hotel Tech</a></div>';

  $app.innerHTML = html;
  bindEvents();
  notifyHeight();
}

/* ─── Step 1: Search ──────────────────────────────────────────────────── */
function renderSearch() {
  var today = new Date().toISOString().slice(0,10);
  var h = '<div class="card">';
  h += '<h2>Find Your Perfect Stay</h2>';
  h += '<p class="sub">Select dates and guests to check availability</p>';
  if (state.error) h += '<div class="error-box">' + esc(state.error) + '</div>';
  h += '<div class="row"><div class="field"><label>Check-in</label>';
  h += '<input type="date" id="w-checkin" min="'+today+'" value="'+esc(state.checkIn)+'"></div>';
  h += '<div class="field"><label>Check-out</label>';
  h += '<input type="date" id="w-checkout" min="'+today+'" value="'+esc(state.checkOut)+'"></div></div>';
  h += '<div class="row"><div class="field"><label>Adults</label>';
  h += '<select id="w-adults">';
  for (var a = 1; a <= 10; a++) h += '<option value="'+a+'"'+(state.adults===a?' selected':'')+'>'+a+'</option>';
  h += '</select></div>';
  h += '<div class="field"><label>Children</label>';
  h += '<select id="w-children">';
  for (var c = 0; c <= 6; c++) h += '<option value="'+c+'"'+(state.children===c?' selected':'')+'>'+c+'</option>';
  h += '</select></div></div>';
  h += '<button class="btn btn-primary" id="w-search">Search Availability</button>';
  h += '</div>';
  return h;
}

/* ─── Step 2: Unit Selection ──────────────────────────────────────────── */
function renderUnits() {
  var h = '<div class="card">';
  h += '<h2>Available Rooms</h2>';
  h += '<p class="sub">' + esc(state.checkIn) + ' &rarr; ' + esc(state.checkOut) + ' &middot; ' + state.adults + ' adult' + (state.adults>1?'s':'') + '</p>';
  if (state.available.length === 0) {
    h += '<p style="text-align:center;padding:24px;color:var(--text2)">No rooms available for the selected dates. Please try different dates.</p>';
  } else {
    state.available.forEach(function(u) {
      var sel = state.selectedUnit && state.selectedUnit.id === u.id;
      h += '<div class="unit'+(sel?' selected':'')+'" data-unit="'+esc(u.id)+'">';
      if (u.image) h += '<img class="unit-img" src="'+esc(u.image)+'" alt="'+esc(u.name)+'">';
      else h += '<div class="unit-img"></div>';
      h += '<div class="unit-info"><div class="unit-name">'+esc(u.name)+'</div>';
      h += '<div class="unit-desc">'+(u.description ? esc(u.description) : 'Max '+u.max_guests+' guests')+'</div>';
      h += '<div class="unit-price">'+formatCurrency(u.price_per_night)+' <span>/ night</span></div>';
      h += '</div></div>';
    });
  }
  h += '<div class="btn-row">';
  h += '<button class="btn btn-secondary" id="w-back1">&larr; Back</button>';
  if (state.available.length > 0) h += '<button class="btn btn-primary'+(state.selectedUnit?'':' disabled')+'" id="w-next2" '+(state.selectedUnit?'':'disabled')+'>Continue &rarr;</button>';
  h += '</div></div>';
  return h;
}

/* ─── Step 3: Extras ──────────────────────────────────────────────────── */
function renderExtras() {
  var extras = (state.config && state.config.extras) || [];
  var h = '<div class="card">';
  h += '<h2>Enhance Your Stay</h2>';
  h += '<p class="sub">Optional extras to make your visit even better</p>';
  if (extras.length === 0) {
    h += '<p style="text-align:center;padding:16px;color:var(--text2)">No extras available.</p>';
  } else {
    extras.forEach(function(ex) {
      var checked = !!state.selectedExtras[ex.id];
      h += '<div class="extra"><input type="checkbox" id="ex-'+esc(ex.id)+'" data-extra="'+esc(ex.id)+'"'+(checked?' checked':'')+'>';
      h += '<label for="ex-'+esc(ex.id)+'">'+esc(ex.name)+(ex.description ? ' <span style="color:var(--text2);font-size:11px">&middot; '+esc(ex.description)+'</span>' : '')+'</label>';
      h += '<span class="price">'+formatCurrency(ex.price)+'</span></div>';
    });
  }
  h += '<div class="btn-row">';
  h += '<button class="btn btn-secondary" id="w-back2">&larr; Back</button>';
  h += '<button class="btn btn-primary" id="w-next3">'+(state.quoteLoading?'Loading...':'Review & Book &rarr;')+'</button>';
  h += '</div></div>';
  return h;
}

/* ─── Step 4: Guest Details & Summary ─────────────────────────────────── */
function renderGuest() {
  var q = state.quote || {};
  var h = '';
  if (state.error) h += '<div class="error-box">' + esc(state.error) + '</div>';

  // Summary
  h += '<div class="card">';
  h += '<h2>Booking Summary</h2>';
  h += '<p class="sub">' + esc(state.checkIn) + ' &rarr; ' + esc(state.checkOut) + '</p>';
  if (state.selectedUnit) {
    h += '<div class="summary-line"><span>'+esc(state.selectedUnit.name)+' &times; '+nights()+' night'+(nights()>1?'s':'')+'</span><span>'+formatCurrency(q.room_total || state.selectedUnit.price_per_night * nights())+'</span></div>';
  }
  if (q.extras && q.extras.length) {
    q.extras.forEach(function(ex){
      h += '<div class="summary-line"><span>'+esc(ex.name)+'</span><span>'+formatCurrency(ex.price)+'</span></div>';
    });
  }
  h += '<div class="summary-line total"><span>Total</span><span class="amount">'+formatCurrency(q.total || 0)+'</span></div>';
  h += '</div>';

  // Guest form
  h += '<div class="card">';
  h += '<h2>Guest Details</h2>';
  h += '<p class="sub">Please fill in your information to complete the booking</p>';
  h += '<div class="row">';
  h += '<div class="field"><label>First Name *</label><input id="w-fname" value="'+esc(state.firstName)+'" placeholder="John"></div>';
  h += '<div class="field"><label>Last Name *</label><input id="w-lname" value="'+esc(state.lastName)+'" placeholder="Doe"></div>';
  h += '</div>';
  h += '<div class="field"><label>Email *</label><input type="email" id="w-email" value="'+esc(state.email)+'" placeholder="john@example.com"></div>';
  h += '<div class="field"><label>Phone</label><input type="tel" id="w-phone" value="'+esc(state.phone)+'" placeholder="+1 234 567 890"></div>';
  h += '<div class="btn-row">';
  h += '<button class="btn btn-secondary" id="w-back3">&larr; Back</button>';
  h += '<button class="btn btn-primary" id="w-confirm"'+(state.confirming?' disabled':'')+'>'+
       (state.confirming ? '<div class="spinner" style="width:16px;height:16px;margin:0"></div> Confirming...' : 'Confirm Booking') + '</button>';
  h += '</div></div>';
  return h;
}

/* ─── Step 5: Success ─────────────────────────────────────────────────── */
function renderSuccess() {
  var c = state.confirmation || {};
  var h = '<div class="card"><div class="success">';
  h += '<div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>';
  h += '<h2>Booking Confirmed!</h2>';
  h += '<p>Thank you for your reservation. A confirmation email has been sent to <strong>'+esc(state.email)+'</strong>.</p>';
  if (c.reference) h += '<div class="ref">'+esc(c.reference)+'</div>';
  h += '<div style="margin-top:20px"><button class="btn btn-secondary" id="w-newbooking">Make Another Booking</button></div>';
  h += '</div></div>';
  return h;
}

/* ─── Event Binding ───────────────────────────────────────────────────── */
function bindEvents() {
  on('w-search', 'click', doSearch);
  on('w-back1', 'click', function(){ state.step = 1; render(); });
  on('w-back2', 'click', function(){ state.step = 2; render(); });
  on('w-back3', 'click', function(){ state.step = 3; render(); });
  on('w-next2', 'click', doSelectUnit);
  on('w-next3', 'click', doQuote);
  on('w-confirm', 'click', doConfirm);
  on('w-newbooking', 'click', function(){
    state.step = 1; state.selectedUnit = null; state.selectedExtras = {};
    state.quote = null; state.confirmation = null; state.error = null;
    state.firstName = ''; state.lastName = ''; state.email = ''; state.phone = '';
    render();
  });

  // Unit selection
  var units = document.querySelectorAll('.unit[data-unit]');
  for (var i = 0; i < units.length; i++) {
    (function(el){
      el.addEventListener('click', function(){
        var uid = el.getAttribute('data-unit');
        state.selectedUnit = state.available.find(function(u){ return String(u.id) === uid; }) || null;
        render();
      });
    })(units[i]);
  }

  // Extra checkboxes
  var exts = document.querySelectorAll('[data-extra]');
  for (var j = 0; j < exts.length; j++) {
    (function(el){
      el.addEventListener('change', function(){
        var eid = el.getAttribute('data-extra');
        if (el.checked) state.selectedExtras[eid] = true;
        else delete state.selectedExtras[eid];
      });
    })(exts[j]);
  }

  // Sync input values on change
  onInput('w-checkin',  function(v){ state.checkIn = v; });
  onInput('w-checkout', function(v){ state.checkOut = v; });
  onInput('w-adults',   function(v){ state.adults = parseInt(v)||2; });
  onInput('w-children', function(v){ state.children = parseInt(v)||0; });
  onInput('w-fname',    function(v){ state.firstName = v; });
  onInput('w-lname',    function(v){ state.lastName = v; });
  onInput('w-email',    function(v){ state.email = v; });
  onInput('w-phone',    function(v){ state.phone = v; });
}

/* ─── Actions ─────────────────────────────────────────────────────────── */
function doSearch() {
  state.error = null;
  if (!state.checkIn || !state.checkOut) { state.error = 'Please select check-in and check-out dates.'; render(); return; }
  if (state.checkIn >= state.checkOut) { state.error = 'Check-out must be after check-in.'; render(); return; }

  state.loading = true; render();
  apiGet('availability', {
    check_in: state.checkIn,
    check_out: state.checkOut,
    adults: state.adults,
    children: state.children
  }).then(function(data) {
    state.available = data.available || [];
    state.selectedUnit = null;
    state.step = 2;
    state.loading = false;
    render();
  }).catch(function(err) {
    state.error = 'Failed to check availability. Please try again.';
    state.loading = false;
    render();
  });
}

function doSelectUnit() {
  if (!state.selectedUnit) return;
  state.step = 3;
  render();
}

function doQuote() {
  state.quoteLoading = true; state.error = null; render();

  var extras = Object.keys(state.selectedExtras).map(function(id){ return { id: id, quantity: 1 }; });

  apiPost('quote', {
    unit_id: String(state.selectedUnit.id),
    check_in: state.checkIn,
    check_out: state.checkOut,
    adults: state.adults,
    children: state.children,
    extras: extras.length ? extras : undefined
  }).then(function(data) {
    state.quoteLoading = false;
    if (data.error) { state.error = data.error; render(); return; }
    state.quote = data;
    state.step = 4;
    render();
  }).catch(function() {
    state.quoteLoading = false;
    state.error = 'Failed to generate quote.';
    render();
  });
}

function doConfirm() {
  if (!state.firstName || !state.lastName || !state.email) {
    state.error = 'Please fill in all required fields.'; render(); return;
  }
  state.confirming = true; state.error = null; render();

  apiPost('confirm', {
    hold_token: state.quote ? state.quote.hold_token : '',
    guest: {
      first_name: state.firstName,
      last_name: state.lastName,
      email: state.email,
      phone: state.phone
    }
  }).then(function(data) {
    state.confirming = false;
    if (data.error) { state.error = data.error; render(); return; }
    state.confirmation = data;
    state.step = 5;
    render();
  }).catch(function() {
    state.confirming = false;
    state.error = 'Booking failed. Please try again.';
    render();
  });
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function on(id, evt, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}
function onInput(id, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('input', function(){ fn(el.value); });
  if (el && el.tagName === 'SELECT') el.addEventListener('change', function(){ fn(el.value); });
}
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function nights() {
  if (!state.checkIn || !state.checkOut) return 1;
  var a = new Date(state.checkIn), b = new Date(state.checkOut);
  return Math.max(1, Math.round((b - a) / 86400000));
}
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '';
  return new Intl.NumberFormat(LANG === 'de' ? 'de-DE' : 'en-US', { style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:2 }).format(amount);
}
function notifyHeight() {
  try {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'hoteltech-widget-height', height: h }, '*');
  } catch(e){}
}

/* ─── Init ────────────────────────────────────────────────────────────── */
apiGet('config').then(function(data) {
  state.config = data;
  state.loading = false;

  // Pre-set tomorrow and day-after as defaults
  var d = new Date();
  d.setDate(d.getDate() + 1);
  state.checkIn = d.toISOString().slice(0,10);
  d.setDate(d.getDate() + 2);
  state.checkOut = d.toISOString().slice(0,10);

  render();
}).catch(function() {
  state.loading = false;
  state.error = 'Unable to load booking configuration.';
  render();
});

})();
</script>
</body>
</html>
