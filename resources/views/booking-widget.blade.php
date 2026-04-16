<!DOCTYPE html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book Your Stay</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --primary: {{ $color ?: '#2d6a4f' }};
  --primary-hover: color-mix(in srgb, var(--primary) 85%, #000);
  --primary-light: color-mix(in srgb, var(--primary) 12%, transparent);
  --bg: #faf8f5;
  --surface: #ffffff;
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
  --border: #2c2c2c;
  --text: #f5f5f5;
  --text-secondary: #8e8e93;
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

/* Layout */
.widget{max-width:980px;margin:0 auto;padding:20px 16px}
.page-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
@media(max-width:780px){.page-layout{grid-template-columns:1fr}}

/* Header */
.widget-header{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.widget-header img{height:36px;width:auto;border-radius:6px}
.widget-header .prop-name{font-size:18px;font-weight:700;letter-spacing:-.02em}

/* Step indicator */
.stepper{display:flex;align-items:flex-start;justify-content:center;gap:0;margin-bottom:28px;padding:0 8px}
.stepper-item{display:flex;flex-direction:column;align-items:center;flex:1;position:relative}
.stepper-item:not(:last-child)::after{content:'';position:absolute;top:15px;left:calc(50% + 18px);right:calc(-50% + 18px);height:2px;background:var(--border);transition:background .4s}
.stepper-item:not(:last-child).done::after{background:var(--primary)}
.step-circle{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;border:2px solid var(--border);background:var(--surface);color:var(--text-secondary);transition:all .3s;position:relative;z-index:1}
.stepper-item.active .step-circle{border-color:var(--primary);background:var(--primary);color:#fff}
.stepper-item.done .step-circle{border-color:var(--primary);background:var(--primary);color:#fff}
.step-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);margin-top:6px;text-align:center;white-space:nowrap}
.stepper-item.active .step-label{color:var(--primary)}
.stepper-item.done .step-label{color:var(--primary)}

/* Cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:16px;box-shadow:var(--shadow-sm);transition:box-shadow .2s}
.card-title{font-size:18px;font-weight:700;letter-spacing:-.01em;margin-bottom:4px}
.card-sub{font-size:13px;color:var(--text-secondary);margin-bottom:20px}

/* Form fields */
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px}
.field input,.field select,.field textarea{width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.field select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.field textarea{resize:vertical;min-height:72px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 20px;border:none;border-radius:10px;font-size:14px;font-weight:600;transition:all .2s;text-decoration:none}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover);transform:translateY(-1px);box-shadow:var(--shadow)}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{border-color:var(--text-secondary);background:var(--primary-light)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important}
.btn-row{display:flex;gap:12px;margin-top:20px}
.btn-row .btn{flex:1}

/* Room cards — horizontal layout (image left, info right) */
.room-card{display:flex;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:16px;transition:all .3s;cursor:pointer;background:var(--surface)}
.room-card:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border));box-shadow:var(--shadow-lg);transform:translateY(-2px)}
.room-card.selected{border-color:var(--primary);box-shadow:0 0 0 2px var(--primary)}
.room-hero{width:280px;min-height:240px;background:var(--border);position:relative;overflow:hidden;flex-shrink:0}
.room-hero img{width:100%;height:100%;object-fit:cover;transition:transform .4s}
.room-card:hover .room-hero img{transform:scale(1.03)}
.room-hero-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);opacity:.4}
.room-tags{position:absolute;top:10px;left:10px;display:flex;gap:5px;flex-wrap:wrap}
.room-tag{padding:3px 9px;background:rgba(255,255,255,.92);backdrop-filter:blur(4px);border-radius:20px;font-size:10px;font-weight:600;color:#1a1a1a}
.room-body{padding:18px;display:flex;flex-direction:column;flex:1;min-width:0}
.room-name{font-family:var(--font-display);font-size:1.4rem;font-weight:600;margin-bottom:4px;line-height:1.2}
.room-specs{display:flex;gap:10px;font-size:11px;color:var(--text-secondary);margin:5px 0 8px;flex-wrap:wrap}
.room-spec{display:flex;align-items:center;gap:4px}
.room-spec svg{flex-shrink:0}
.room-desc{font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.room-amenities{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.room-amenity{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text-secondary);font-weight:500;padding:3px 8px;background:color-mix(in srgb, var(--primary) 6%, transparent);border-radius:6px}
.room-amenity svg{flex-shrink:0;color:var(--primary);opacity:.7;width:13px;height:13px}
.room-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}
.room-pricing{display:flex;align-items:baseline;gap:5px}
.room-price{font-size:20px;font-weight:700;color:var(--primary)}
.room-price-unit{font-size:11px;color:var(--text-secondary)}
.room-total{font-size:10px;color:var(--text-secondary);margin-left:3px}
.room-select-btn{padding:9px 20px;border-radius:10px;font-size:12px;font-weight:600;border:2px solid var(--primary);background:transparent;color:var(--primary);transition:all .2s;white-space:nowrap}
.room-card.selected .room-select-btn,.room-select-btn:hover{background:var(--primary);color:#fff}
@media(max-width:600px){.room-card{flex-direction:column}.room-hero{width:100%;min-height:180px}}

/* Summary sidebar with hero */
.summary-sidebar{position:sticky;top:16px}
.summary-hero{position:relative;height:180px;border-radius:var(--radius) var(--radius) 0 0;overflow:hidden;background:var(--border)}
.summary-hero img{width:100%;height:100%;object-fit:cover}
.summary-hero-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.6) 0%,transparent 60%)}
.summary-hero-title{position:absolute;bottom:14px;left:16px;right:16px;color:#fff;font-family:var(--font-display);font-size:1.25rem;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.4)}

/* Extras */
.extra-card{display:flex;align-items:stretch;gap:0;padding:0;border:2px solid var(--border);border-radius:var(--radius);margin-bottom:14px;transition:all .25s;cursor:pointer;overflow:hidden;background:var(--surface)}
.extra-card:hover{border-color:color-mix(in srgb, var(--primary) 50%, var(--border));box-shadow:var(--shadow-lg);transform:translateY(-1px)}
.extra-hero{width:180px;min-height:140px;background:var(--border);position:relative;overflow:hidden;flex-shrink:0}
.extra-hero img{width:100%;height:100%;object-fit:cover;transition:transform .4s;display:block}
.extra-card:hover .extra-hero img{transform:scale(1.04)}
.extra-body{display:flex;align-items:center;gap:14px;padding:14px 16px;flex:1;min-width:0}
@media(max-width:600px){.extra-card{flex-direction:column}.extra-hero{width:100%;min-height:140px}}
.extra-card.checked{border-color:var(--primary);background:var(--primary-light)}
.extra-check{width:22px;height:22px;border-radius:6px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.extra-card.checked .extra-check{background:var(--primary);border-color:var(--primary)}
.extra-info{flex:1;min-width:0}
.extra-name{font-size:14px;font-weight:600}
.extra-desc{font-size:12px;color:var(--text-secondary)}
.extra-price{font-size:14px;font-weight:700;color:var(--primary);white-space:nowrap}

/* Details layout */
.details-grid{display:grid;grid-template-columns:1fr 280px;gap:16px}
@media(max-width:780px){
  .details-grid{grid-template-columns:1fr}
  .details-grid .summary-card{order:-1}
  .row{grid-template-columns:1fr}
  .stepper{gap:0;padding:0}
  .step-label{font-size:9px}
  .room-card{grid-template-columns:1fr}
  .room-hero{height:200px}
}

/* Summary sidebar */
.summary-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow-sm);position:sticky;top:16px}
.summary-card h3{font-size:15px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.summary-line{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:var(--text-secondary)}
.summary-line span:last-child{font-weight:500;color:var(--text)}
.summary-total{display:flex;justify-content:space-between;padding-top:12px;margin-top:10px;border-top:2px solid var(--border);font-size:17px;font-weight:700}
.summary-total span:last-child{color:var(--primary)}

/* Error */
.error-box{background:var(--error-bg);border:1px solid color-mix(in srgb, var(--error) 20%, transparent);border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--error);display:flex;align-items:center;gap:8px}

/* Success */
.success-wrap{text-align:center;padding:40px 20px}
.success-icon{width:64px;height:64px;border-radius:50%;background:var(--success-bg);display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;animation:scaleIn .4s ease-out}
.success-icon svg{color:var(--success);width:32px;height:32px}
.success-wrap h2{font-size:22px;font-weight:700;margin-bottom:8px}
.success-wrap p{color:var(--text-secondary);font-size:14px;max-width:380px;margin:0 auto}
.success-ref{display:inline-block;margin-top:16px;padding:10px 20px;background:var(--primary-light);border:1px solid color-mix(in srgb, var(--primary) 25%, transparent);border-radius:8px;font-family:'SF Mono',SFMono-Regular,Consolas,monospace;font-size:16px;font-weight:600;letter-spacing:1.5px;color:var(--primary)}

/* Shimmer loading */
.shimmer{background:linear-gradient(90deg,var(--border) 25%,color-mix(in srgb, var(--border) 50%, var(--surface)) 50%,var(--border) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:8px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.shimmer-line{height:14px;margin-bottom:10px;border-radius:6px}
.shimmer-block{height:80px;margin-bottom:12px}
.shimmer-circle{width:30px;height:30px;border-radius:50%}

/* Confetti */
@keyframes scaleIn{0%{transform:scale(0);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
@keyframes confettiDrop{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(60px) rotate(360deg);opacity:0}}
.confetti-container{position:relative;height:0;overflow:visible}
.confetti-piece{position:absolute;width:8px;height:8px;border-radius:2px;animation:confettiDrop 1.2s ease-out forwards;opacity:0}

/* Step transition — only animate on actual step change */
.step-content{animation:fadeSlideIn .35s ease-out}
.step-content-static{}
@keyframes fadeSlideIn{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}

/* Powered by */
.powered{text-align:center;padding:16px 0 4px;font-size:11px;color:var(--text-secondary);opacity:.5}
.powered a{color:var(--text-secondary);text-decoration:none}
.powered a:hover{text-decoration:underline}

/* Calendar date picker */
.date-trigger{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s;font-size:14px;color:var(--text);width:100%;text-align:left}
.date-trigger:hover{border-color:var(--primary)}
.date-trigger.active{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
.date-trigger svg{flex-shrink:0;color:var(--text-secondary)}
.date-trigger .date-text{flex:1}
.date-trigger .date-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);display:block;margin-bottom:2px}
.date-trigger .date-value{font-weight:600}
.date-trigger .date-placeholder{color:var(--text-secondary);font-weight:400}

.cal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.3);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh;animation:fadeIn .15s}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.cal-popup{background:var(--surface);border-radius:16px;box-shadow:var(--shadow-lg);border:1px solid var(--border);padding:24px;max-width:640px;width:95%;max-height:80vh;overflow-y:auto;animation:slideUp .2s ease-out}
@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}

.cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.cal-header h3{font-size:16px;font-weight:700}
.cal-close{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--text-secondary);border-radius:8px;font-size:18px;cursor:pointer}
.cal-close:hover{background:var(--primary-light);color:var(--text)}

.cal-months{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:520px){.cal-months{grid-template-columns:1fr}}
.cal-month-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cal-month-title{font-size:14px;font-weight:600}
.cal-nav{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);background:var(--surface);border-radius:6px;cursor:pointer;color:var(--text-secondary);font-size:12px}
.cal-nav:hover{border-color:var(--primary);color:var(--primary)}

.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:0}
.cal-dow{font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-secondary);text-align:center;padding:4px 0 8px;letter-spacing:.5px}
.cal-day{text-align:center;padding:2px;position:relative;cursor:pointer}
.cal-day.empty{cursor:default}
.cal-day.disabled{cursor:not-allowed;opacity:.35}
.cal-day .day-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:42px;border-radius:8px;transition:all .15s;padding:3px 0}
.cal-day:not(.empty):not(.disabled):hover .day-inner{background:var(--primary-light)}
.cal-day .day-num{font-size:13px;font-weight:500;line-height:1.2}
.cal-day .day-price{font-size:9px;color:var(--text-secondary);font-weight:500;line-height:1.2;margin-top:1px}
.cal-day .day-price.cheap{color:var(--success)}

/* Range selection states */
.cal-day.range-start .day-inner{background:var(--primary);color:#fff;border-radius:8px 0 0 8px}
.cal-day.range-start .day-price{color:rgba(255,255,255,.7)}
.cal-day.range-end .day-inner{background:var(--primary);color:#fff;border-radius:0 8px 8px 0}
.cal-day.range-end .day-price{color:rgba(255,255,255,.7)}
.cal-day.range-start.range-end .day-inner{border-radius:8px}
.cal-day.in-range .day-inner{background:var(--primary-light);border-radius:0}
.cal-day.in-range .day-num{color:var(--primary)}

.cal-footer{display:flex;align-items:center;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
.cal-footer .cal-summary{font-size:13px;color:var(--text-secondary)}
.cal-footer .cal-summary strong{color:var(--text);font-weight:600}
.cal-footer .cal-apply{padding:10px 24px;border:none;border-radius:8px;font-size:13px;font-weight:600;background:var(--primary);color:#fff;cursor:pointer;transition:all .2s}
.cal-footer .cal-apply:hover{opacity:.9}
.cal-footer .cal-apply:disabled{opacity:.4;cursor:not-allowed}
</style>
</head>
<body>
<div class="widget" id="app">
  <div style="padding:60px 0;text-align:center">
    <div class="shimmer shimmer-line" style="width:60%;margin:0 auto 20px"></div>
    <div class="shimmer shimmer-line" style="width:40%;margin:0 auto 20px"></div>
    <div class="shimmer shimmer-block" style="max-width:400px;margin:0 auto"></div>
  </div>
</div>

<script>
;(function(){
'use strict';

var ORG_ID   = @json($orgId);
var API_BASE = @json($apiBase);
var LANG     = @json($lang);
var THEME    = @json($theme ?? 'light');
var CURRENCY = 'EUR';

/* --- State --- */
var state = {
  step: 1,
  config: null,
  style: null,
  loading: true,
  searching: false,
  error: null,
  checkIn: '',
  checkOut: '',
  adults: 2,
  children: 0,
  promo: '',
  available: [],
  selectedUnit: null,
  selectedExtras: {},
  quote: null,
  quoteLoading: false,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  requests: '',
  confirming: false,
  confirmation: null,
  // Payment (Stripe)
  paymentEnabled: false,
  stripePublishableKey: null,
  stripeInstance: null,
  stripeElements: null,
  cardElement: null,
  paymentIntentClientSecret: null,
  paymentIntentId: null,
  paymentProcessing: false,
  paymentError: null,
  calendarOpen: false,
  calendarPrices: {},
  calendarPricesLoading: false,
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  pickingCheckout: false
};

var $app = document.getElementById('app');
var STEPS_NO_PAY = ['Dates & Guests','Rooms & Rates','Extras','Details & Confirm'];
var STEPS_PAY = ['Dates & Guests','Rooms & Rates','Extras','Guest Details','Payment'];
function getSteps() { return state.paymentEnabled ? STEPS_PAY : STEPS_NO_PAY; }
function successStep() { return state.paymentEnabled ? 6 : 5; }

/* Fallback images for known ForRest room names */
var ASSETS_BASE = API_BASE.replace(/\/api$/, '') + '/assets/images/';
var FALLBACK_IMAGES = {
  'ForRest DeLuxe House': 'ForRest-DeLuxe-House.jpg',
  'ForRest Lodge': 'ForRest_Lodge.jpg',
  'ForRest No.5': 'ForRest_No5.jpg',
  'ForRest Sauna Lodge': 'ForRest_Sauna_Lodge.jpg',
  'ForRest Tiny House': 'ForRest_Tiny_House.jpg',
  'Sauna House': 'ForRest_Sauna_house.jpg'
};

/* Resolve a stored image URL (admin uploads land at /storage/...) to an absolute URL the widget host can fetch. */
function resolveStorageImage(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  var origin = API_BASE.replace(/\/api$/, '');
  return origin + (url.charAt(0) === '/' ? url : '/' + url);
}

function getRoomImage(unit) {
  if (unit.image) return unit.image;
  var name = unit.name || '';
  // Exact match first
  if (FALLBACK_IMAGES[name]) return ASSETS_BASE + FALLBACK_IMAGES[name];
  // Partial match
  var lower = name.toLowerCase();
  if (lower.indexOf('deluxe') >= 0) return ASSETS_BASE + 'ForRest-DeLuxe-House.jpg';
  if (lower.indexOf('tiny') >= 0) return ASSETS_BASE + 'ForRest_Tiny_House.jpg';
  if (lower.indexOf('sauna') >= 0 && lower.indexOf('lodge') >= 0) return ASSETS_BASE + 'ForRest_Sauna_Lodge.jpg';
  if (lower.indexOf('sauna') >= 0) return ASSETS_BASE + 'ForRest_Sauna_house.jpg';
  if (lower.indexOf('lodge') >= 0) return ASSETS_BASE + 'ForRest_Lodge.jpg';
  if (lower.indexOf('no.5') >= 0 || lower.indexOf('no5') >= 0) return ASSETS_BASE + 'ForRest_No5.jpg';
  return ASSETS_BASE + 'ForRest_Lodge.jpg';
}

function getRoomAmenities(unit) {
  var name = (unit.name || '').toLowerCase();
  var desc = (unit.description || '').toLowerCase();
  var all = name + ' ' + desc;
  var amenities = [];
  var has = function(kw) { return all.indexOf(kw) >= 0; };
  if (has('kitchen') || has('cook') || has('kitchenette')) amenities.push({icon: 'kitchen', label: 'Kitchen'});
  if (has('sauna')) amenities.push({icon: 'sauna', label: 'Sauna'});
  if (has('jacuzzi') || has('hot tub')) amenities.push({icon: 'jacuzzi', label: 'Jacuzzi'});
  if (has('bbq') || has('grill') || has('fireplace')) amenities.push({icon: 'bbq', label: 'BBQ'});
  if (has('terrace') || has('deck') || has('balcony')) amenities.push({icon: 'terrace', label: 'Terrace'});
  if (has('garden') || has('forest') || has('nature') || has('forrest')) amenities.push({icon: 'nature', label: 'Nature stay'});
  if (has('wifi') || has('wi-fi')) amenities.push({icon: 'wifi', label: 'WiFi'});
  if (has('parking')) amenities.push({icon: 'parking', label: 'Parking'});
  // Defaults for ForRest-type properties
  if (!amenities.some(function(a){ return a.label === 'Nature stay'; })) amenities.push({icon: 'nature', label: 'Nature stay'});
  if (amenities.length < 3) amenities.push({icon: 'wifi', label: 'Free WiFi'});
  if (amenities.length < 4) amenities.push({icon: 'parking', label: 'Free parking'});
  return amenities;
}

function getRoomTags(unit) {
  var name = (unit.name || '').toLowerCase();
  var desc = (unit.description || '').toLowerCase();
  var all = name + ' ' + desc;
  var tags = [];
  if (all.indexOf('forest') >= 0) tags.push('Forest view');
  if (all.indexOf('lake') >= 0 || all.indexOf('water') >= 0) tags.push('Lake view');
  if (all.indexOf('deluxe') >= 0 || all.indexOf('luxury') >= 0) tags.push('Deluxe');
  if (all.indexOf('private') >= 0) tags.push('Private');
  if (all.indexOf('family') >= 0) tags.push('Family');
  if (unit.max_guests && unit.max_guests >= 4) tags.push('Spacious');
  return tags;
}

function svgAmenity(icon) {
  var svgs = {
    kitchen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h3v10H3zM18 2h3v10h-3zM10 2v6a2 2 0 004 0V2M12 12v10M3 12h18"/></svg>',
    sauna: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 10c0 0-1 2-1 4s1 4 1 4M12 10c0 0-1 2-1 4s1 4 1 4M17 10c0 0-1 2-1 4s1 4 1 4M4 20h16M8 4a2 2 0 114 0"/></svg>',
    jacuzzi: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12h20M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6M6 12V6a2 2 0 014 0v1M9 4c1-1 3-1 4 0"/></svg>',
    bbq: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="10" r="6"/><path d="M12 16v4M8 20h8M9 6c0-2 6-2 6 0"/></svg>',
    wifi: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114 0M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/></svg>',
    parking: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 010 6H9"/></svg>',
    terrace: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7h20zM2 7v15h20V7M8 22V10M16 22V10"/></svg>',
    nature: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20V8M8 14l4-6 4 6M6 18l6-8 6 8M4 22h16"/></svg>'
  };
  return svgs[icon] || '';
}

/* --- API --- */
function apiGet(path, params) {
  params = params || {};
  params.org = ORG_ID;
  var qs = Object.keys(params).map(function(k){ return k+'='+encodeURIComponent(params[k]); }).join('&');
  return fetch(API_BASE + '/v1/booking/' + path + '?' + qs).then(function(r){ return r.json(); });
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

var _lastStep = 0;

/* --- Render --- */
function render() {
  var stepChanged = state.step !== _lastStep;
  _lastStep = state.step;

  var html = '';

  // Header
  if (state.style) {
    html += '<div class="widget-header">';
    if (state.style.show_logo && state.style.logo_url) {
      html += '<img src="' + esc(state.style.logo_url) + '" alt="">';
    }
    if (state.style.property_name) {
      html += '<span class="prop-name">' + esc(state.style.property_name) + '</span>';
    }
    html += '</div>';
  }

  // Stepper (hide on success)
  var steps = getSteps();
  var sStep = successStep();
  if (state.step < sStep) {
    html += '<div class="stepper">';
    for (var i = 0; i < steps.length; i++) {
      var cls = (i + 1) < state.step ? 'stepper-item done' : ((i + 1) === state.step ? 'stepper-item active' : 'stepper-item');
      html += '<div class="' + cls + '">';
      html += '<div class="step-circle">' + ((i + 1) < state.step ? svgCheck() : (i + 1)) + '</div>';
      html += '<div class="step-label">' + steps[i] + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Content — only animate on actual step changes
  html += '<div class="' + (stepChanged ? 'step-content' : 'step-content-static') + '">';
  if (state.loading) {
    html += renderShimmer();
  } else if (state.step === 1) {
    html += renderSearch();
  } else if (state.step === 2) {
    html += renderRooms();
  } else if (state.step === 3) {
    html += renderExtras();
  } else if (state.step === 4) {
    html += renderDetails();
  } else if (state.step === 5 && state.paymentEnabled) {
    html += renderPayment();
  } else if (state.step === successStep()) {
    html += renderSuccess();
  }
  html += '</div>';

  html += '<div class="powered">Powered by <a href="#">HotelTech</a></div>';

  $app.innerHTML = html;
  bindEvents();
  notifyHeight();
}

/* --- Shimmer --- */
function renderShimmer() {
  var h = '<div class="card">';
  h += '<div class="shimmer shimmer-line" style="width:50%;height:20px;margin-bottom:12px"></div>';
  h += '<div class="shimmer shimmer-line" style="width:80%"></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">';
  h += '<div class="shimmer" style="height:42px"></div><div class="shimmer" style="height:42px"></div>';
  h += '<div class="shimmer" style="height:42px"></div><div class="shimmer" style="height:42px"></div>';
  h += '</div>';
  h += '<div class="shimmer" style="height:44px;margin-top:16px"></div>';
  h += '</div>';
  return h;
}

/* --- Step 1: Search --- */
function renderSearch() {
  var today = new Date().toISOString().slice(0, 10);
  var h = '<div class="card">';
  h += '<div class="card-title">Find Your Perfect Stay</div>';
  h += '<div class="card-sub">Select your dates and guests to see available rooms</div>';
  if (state.error) h += errorHtml(state.error);

  // Date picker triggers
  h += '<div class="row">';
  h += '<div class="field"><label>Check-in</label>';
  h += '<button class="date-trigger' + (state.calendarOpen && !state.pickingCheckout ? ' active' : '') + '" id="w-ci-trigger">';
  h += svgCalendar();
  h += '<div class="date-text"><span class="date-label">Check-in</span>';
  h += state.checkIn ? '<span class="date-value">' + formatDate(state.checkIn) + '</span>' : '<span class="date-placeholder">Select date</span>';
  h += '</div></button></div>';

  h += '<div class="field"><label>Check-out</label>';
  h += '<button class="date-trigger' + (state.calendarOpen && state.pickingCheckout ? ' active' : '') + '" id="w-co-trigger">';
  h += svgCalendar();
  h += '<div class="date-text"><span class="date-label">Check-out</span>';
  h += state.checkOut ? '<span class="date-value">' + formatDate(state.checkOut) + '</span>' : '<span class="date-placeholder">Select date</span>';
  h += '</div></button></div></div>';

  h += '<div class="row">';
  h += field('Adults', selectHtml('w-adults', range(1, 10), state.adults));
  h += field('Children', selectHtml('w-children', range(0, 6), state.children));
  h += '</div>';
  h += field('Promo Code <span style="font-weight:400;opacity:.7">(optional)</span>', '<input type="text" id="w-promo" value="' + esc(state.promo) + '" placeholder="Enter code">');
  h += '<button class="btn btn-primary" id="w-search"' + (state.searching ? ' disabled' : '') + '>';
  h += state.searching ? spinner() + ' Searching...' : svgSearch() + ' Search Rooms';
  h += '</button>';
  h += '</div>';

  // Calendar popup
  if (state.calendarOpen) {
    h += renderCalendar();
  }

  return h;
}

/* --- Calendar popup --- */
function renderCalendar() {
  var h = '<div class="cal-overlay" id="cal-overlay">';
  h += '<div class="cal-popup">';

  // Header
  h += '<div class="cal-header">';
  h += '<h3>' + (state.pickingCheckout ? 'Select check-out date' : 'Select check-in date') + '</h3>';
  h += '<button class="cal-close" id="cal-close">&times;</button>';
  h += '</div>';

  // Two months
  h += '<div class="cal-months">';
  h += renderMonth(state.calendarYear, state.calendarMonth);
  var nextMonth = state.calendarMonth + 1;
  var nextYear = state.calendarYear;
  if (nextMonth > 11) { nextMonth = 0; nextYear++; }
  h += renderMonth(nextYear, nextMonth);
  h += '</div>';

  // Footer with summary
  h += '<div class="cal-footer">';
  var summaryText = '';
  if (state.checkIn && state.checkOut) {
    var n = nights();
    summaryText = '<strong>' + formatDate(state.checkIn) + '</strong> &mdash; <strong>' + formatDate(state.checkOut) + '</strong> &middot; ' + n + ' night' + (n > 1 ? 's' : '');
  } else if (state.checkIn) {
    summaryText = '<strong>' + formatDate(state.checkIn) + '</strong> &mdash; select check-out';
  } else {
    summaryText = 'Select your dates';
  }
  h += '<div class="cal-summary">' + summaryText + '</div>';
  h += '<button class="cal-apply" id="cal-apply"' + (state.checkIn && state.checkOut ? '' : ' disabled') + '>Apply</button>';
  h += '</div>';

  h += '</div></div>';
  return h;
}

function renderMonth(year, month) {
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dows = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  var today = new Date().toISOString().slice(0,10);

  var h = '<div class="cal-month">';

  // Month header with nav
  h += '<div class="cal-month-header">';
  if (month === state.calendarMonth && year === state.calendarYear) {
    h += '<button class="cal-nav" id="cal-prev">&lsaquo;</button>';
  } else {
    h += '<div></div>';
  }
  h += '<div class="cal-month-title">' + months[month] + ' ' + year + '</div>';
  if (month !== state.calendarMonth || year !== state.calendarYear) {
    h += '<button class="cal-nav" id="cal-next">&rsaquo;</button>';
  } else {
    h += '<div></div>';
  }
  h += '</div>';

  // DOW headers
  h += '<div class="cal-grid">';
  dows.forEach(function(d) { h += '<div class="cal-dow">' + d + '</div>'; });

  // First day of month (Monday = 0)
  var firstDate = new Date(year, month, 1);
  var startDow = (firstDate.getDay() + 6) % 7; // 0=Mon
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty cells before first day
  for (var e = 0; e < startDow; e++) {
    h += '<div class="cal-day empty"><div class="day-inner"></div></div>';
  }

  // Day cells
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isPast = dateStr < today;
    var isStart = state.checkIn === dateStr;
    var isEnd = state.checkOut === dateStr;
    var inRange = state.checkIn && state.checkOut && dateStr > state.checkIn && dateStr < state.checkOut;

    var cls = 'cal-day';
    if (isPast) cls += ' disabled';
    if (isStart) cls += ' range-start';
    if (isEnd) cls += ' range-end';
    if (inRange) cls += ' in-range';

    h += '<div class="' + cls + '" data-date="' + dateStr + '">';
    h += '<div class="day-inner">';
    h += '<span class="day-num">' + d + '</span>';

    // Price under date
    var price = state.calendarPrices[dateStr];
    if (price && !isPast) {
      var cheapest = getCheapestPrice();
      var isCheap = cheapest > 0 && price <= cheapest * 1.1;
      h += '<span class="day-price' + (isCheap ? ' cheap' : '') + '">' + formatCompactPrice(price) + '</span>';
    }

    h += '</div></div>';
  }

  h += '</div></div>';
  return h;
}

/* --- Step 2: Rooms --- */
function renderRooms() {
  var n = nights();
  var h = '<div class="page-layout">';
  h += '<div>';  // left column
  h += '<div style="margin-bottom:20px">';
  h += '<h2 style="font-family:var(--font-display);font-size:1.8rem;font-weight:600;margin-bottom:4px">Available Rooms</h2>';
  h += '<p style="font-size:13px;color:var(--text-secondary)">' + formatDate(state.checkIn) + ' &mdash; ' + formatDate(state.checkOut) + ' &middot; ' + n + ' night' + (n > 1 ? 's' : '') + ' &middot; ' + state.adults + ' adult' + (state.adults > 1 ? 's' : '') + (state.children ? ', ' + state.children + ' child' + (state.children > 1 ? 'ren' : '') : '') + '</p>';
  h += '</div>';

  if (state.available.length === 0) {
    h += '<div class="card" style="text-align:center;padding:48px 20px;color:var(--text-secondary)">';
    h += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:16px;opacity:.4"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>';
    h += '<p style="font-size:15px;font-weight:600">No rooms available</p>';
    h += '<p style="font-size:13px;margin-top:6px">Try different dates or fewer guests</p></div>';
  } else {
    state.available.forEach(function(u) {
      var sel = state.selectedUnit && state.selectedUnit.id === u.id;
      var img = getRoomImage(u);
      // Use API-provided tags/amenities from admin, fallback to derived
      var tags = (u.tags && u.tags.length) ? u.tags : getRoomTags(u);
      var apiAmenities = (u.amenities && u.amenities.length) ? u.amenities.map(function(a) {
        var label = a.charAt(0).toUpperCase() + a.slice(1).replace(/_/g, ' ');
        return {icon: a, label: label};
      }) : null;
      var amenities = apiAmenities || getRoomAmenities(u);

      h += '<div class="room-card' + (sel ? ' selected' : '') + '" data-unit="' + esc(u.id) + '">';
      // Hero image
      h += '<div class="room-hero">';
      h += '<img src="' + esc(img) + '" alt="' + esc(u.name) + '" loading="lazy">';
      if (tags.length) {
        h += '<div class="room-tags">';
        tags.forEach(function(t) { h += '<span class="room-tag">' + esc(t) + '</span>'; });
        h += '</div>';
      }
      h += '</div>';
      // Body
      h += '<div class="room-body">';
      h += '<div class="room-name">' + esc(u.name) + '</div>';
      // Specs
      h += '<div class="room-specs">';
      h += '<span class="room-spec"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Max ' + (u.max_guests || '--') + ' guests</span>';
      if (u.bed_type) h += '<span class="room-spec">&middot; ' + esc(u.bed_type) + '</span>';
      if (u.size) h += '<span class="room-spec">&middot; ' + esc(u.size) + '</span>';
      h += '</div>';
      if (u.description) h += '<div class="room-desc">' + esc(u.description) + '</div>';
      // Amenities
      if (amenities.length) {
        h += '<div class="room-amenities">';
        amenities.forEach(function(a) {
          h += '<span class="room-amenity">' + svgAmenity(a.icon) + ' ' + a.label + '</span>';
        });
        h += '</div>';
      }
      // Footer with price + button
      h += '<div class="room-footer">';
      h += '<div class="room-pricing">';
      h += '<span class="room-price">' + formatCurrency(u.price_per_night) + '</span>';
      h += '<span class="room-price-unit">/ night</span>';
      h += '<span class="room-total">&middot; ' + formatCurrency(u.price_per_night * n) + ' total</span>';
      h += '</div>';
      h += '<button class="room-select-btn">' + (sel ? svgCheck() + ' Selected' : 'Choose this room') + '</button>';
      h += '</div>';
      h += '</div></div>';
    });
  }

  h += '<div class="btn-row">';
  h += '<button class="btn btn-outline" id="w-back1">' + svgArrowLeft() + ' Back</button>';
  if (state.available.length > 0) {
    h += '<button class="btn btn-primary" id="w-next2"' + (state.selectedUnit ? '' : ' disabled') + '>Continue ' + svgArrowRight() + '</button>';
  }
  h += '</div>';
  h += '</div>';  // end left column

  // Right sidebar — summary
  h += renderSummary();
  h += '</div>';  // end page-layout
  return h;
}

/* --- Sticky Summary Sidebar --- */
function renderSummary() {
  var n = nights();
  var q = state.quote || {};
  var h = '<div class="summary-sidebar">';

  // Hero image if room selected
  if (state.selectedUnit) {
    var img = getRoomImage(state.selectedUnit);
    h += '<div class="summary-hero">';
    h += '<img src="' + esc(img) + '" alt="' + esc(state.selectedUnit.name) + '">';
    h += '<div class="summary-hero-overlay"></div>';
    h += '<div class="summary-hero-title">' + esc(state.selectedUnit.name) + '</div>';
    h += '</div>';
  }

  h += '<div class="summary-card" style="' + (state.selectedUnit ? 'border-radius:0 0 var(--radius) var(--radius)' : '') + '">';
  h += '<h3>' + svgClipboard() + ' Your Stay Summary</h3>';

  // Dates with icons
  h += '<div class="summary-line"><span>' + svgCalendarSmall() + ' Check-in</span><span>' + formatDate(state.checkIn) + '</span></div>';
  h += '<div class="summary-line"><span>' + svgCalendarSmall() + ' Check-out</span><span>' + formatDate(state.checkOut) + '</span></div>';
  h += '<div class="summary-line"><span>' + svgMoon() + ' Duration</span><span>' + n + ' night' + (n > 1 ? 's' : '') + '</span></div>';
  h += '<div class="summary-line"><span>' + svgUsers() + ' Guests</span><span>' + state.adults + ' adult' + (state.adults > 1 ? 's' : '') + (state.children ? ', ' + state.children + ' child' + (state.children > 1 ? 'ren' : '') : '') + '</span></div>';

  if (state.selectedUnit) {
    h += '<div style="margin:12px 0;padding-top:12px;border-top:1px solid var(--border)">';
    h += '<div class="summary-line"><span>' + svgBed() + ' ' + esc(state.selectedUnit.name) + '</span><span>' + formatCurrency(q.room_total || state.selectedUnit.price_per_night * n) + '</span></div>';
    h += '</div>';
  }

  if (q.extras && q.extras.length) {
    q.extras.forEach(function(ex) {
      h += '<div class="summary-line"><span>' + svgStar() + ' ' + esc(ex.name) + '</span><span>' + formatCurrency(ex.price) + '</span></div>';
    });
  }

  // Extras from selection (before quote)
  if (!q.extras && state.config && state.config.extras) {
    var selExtras = state.config.extras.filter(function(ex) { return state.selectedExtras[ex.id]; });
    if (selExtras.length) {
      selExtras.forEach(function(ex) {
        h += '<div class="summary-line"><span>' + svgStar() + ' ' + esc(ex.name) + '</span><span>' + formatCurrency(ex.price) + '</span></div>';
      });
    }
  }

  var total = q.total || (state.selectedUnit ? state.selectedUnit.price_per_night * n : 0);
  if (!q.total && state.config && state.config.extras) {
    state.config.extras.forEach(function(ex) { if (state.selectedExtras[ex.id]) total += (ex.price || 0); });
  }
  if (total > 0) {
    h += '<div class="summary-total"><span>Total</span><span>' + formatCurrency(total) + '</span></div>';
  }

  // Continue button in summary
  if (state.step === 2 && state.selectedUnit) {
    h += '<button class="btn btn-primary" id="w-summary-next" style="margin-top:16px">Continue ' + svgArrowRight() + '</button>';
  } else if (state.step === 3) {
    h += '<button class="btn btn-primary" id="w-summary-quote" style="margin-top:16px"' + (state.quoteLoading ? ' disabled' : '') + '>';
    h += state.quoteLoading ? spinner() + ' Calculating...' : 'Review Booking ' + svgArrowRight();
    h += '</button>';
  } else if (state.step === 4) {
    if (state.paymentEnabled) {
      h += '<button class="btn btn-primary" id="w-to-payment" style="margin-top:16px">Continue to Payment ' + svgArrowRight() + '</button>';
    } else {
      h += '<button class="btn btn-primary" id="w-summary-confirm" style="margin-top:16px"' + (state.confirming ? ' disabled' : '') + '>';
      h += state.confirming ? spinner() + ' Confirming...' : svgLock() + ' Confirm Booking';
      h += '</button>';
    }
  } else if (state.step === 5 && state.paymentEnabled) {
    h += '<button class="btn btn-primary" id="w-summary-confirm" style="margin-top:16px"' + (state.paymentProcessing ? ' disabled' : '') + '>';
    h += state.paymentProcessing ? spinner() + ' Processing...' : svgLock() + ' Pay & Confirm';
    h += '</button>';
  }

  h += '</div></div>';
  return h;
}

/* --- Step 3: Extras --- */
function renderExtras() {
  var extras = (state.config && state.config.extras) || [];
  var h = '<div class="page-layout">';
  h += '<div>';
  h += '<div class="card">';
  h += '<div class="card-title">Enhance Your Stay</div>';
  h += '<div class="card-sub">Add optional extras to make your visit even better</div>';

  if (extras.length === 0) {
    h += '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:14px">No extras available for this booking.</div>';
  } else {
    extras.forEach(function(ex) {
      var checked = !!state.selectedExtras[ex.id];
      h += '<div class="extra-card' + (checked ? ' checked' : '') + '" data-extra-card="' + esc(ex.id) + '">';
      var exImg = resolveStorageImage(ex.image);
      if (exImg) {
        h += '<div class="extra-hero"><img src="' + esc(exImg) + '" alt="' + esc(ex.name) + '" onerror="this.parentNode.style.display=\'none\'"></div>';
      }
      h += '<div class="extra-body">';
      h += '<div class="extra-check">' + (checked ? svgCheck('#fff') : '') + '</div>';
      h += '<div class="extra-info"><div class="extra-name">' + esc(ex.name) + '</div>';
      if (ex.description) h += '<div class="extra-desc">' + esc(ex.description) + '</div>';
      h += '</div>';
      h += '<div class="extra-price">' + formatCurrency(ex.price) + '</div>';
      h += '</div>';
      h += '</div>';
    });
  }

  h += '<div class="btn-row">';
  h += '<button class="btn btn-outline" id="w-back2">' + svgArrowLeft() + ' Back</button>';
  h += '<button class="btn btn-primary" id="w-next3"' + (state.quoteLoading ? ' disabled' : '') + '>';
  h += state.quoteLoading ? spinner() + ' Calculating...' : 'Review Booking ' + svgArrowRight();
  h += '</button></div></div>';
  h += '</div>';
  h += renderSummary();
  h += '</div>';
  return h;
}

/* --- Step 4: Details --- */
function renderDetails() {
  var h = '';
  if (state.error) h += errorHtml(state.error);

  h += '<div class="page-layout">';

  // Guest form
  h += '<div class="card"><div class="card-title">Guest Details</div>';
  h += '<div class="card-sub">Fill in your information to complete the reservation</div>';
  h += '<div class="row">';
  h += field('First Name *', '<input id="w-fname" value="' + esc(state.firstName) + '" placeholder="John">');
  h += field('Last Name *', '<input id="w-lname" value="' + esc(state.lastName) + '" placeholder="Doe">');
  h += '</div>';
  h += field('Email Address *', '<input type="email" id="w-email" value="' + esc(state.email) + '" placeholder="john@example.com">');
  h += field('Phone Number', '<input type="tel" id="w-phone" value="' + esc(state.phone) + '" placeholder="+1 234 567 890">');
  h += field('Special Requests', '<textarea id="w-requests" placeholder="Any special requirements...">' + esc(state.requests) + '</textarea>');
  h += '<div class="btn-row">';
  h += '<button class="btn btn-outline" id="w-back3">' + svgArrowLeft() + ' Back</button>';

  if (state.paymentEnabled) {
    // When payment is enabled, this step just collects details — payment is next
    h += '<button class="btn btn-primary" id="w-to-payment">Continue to Payment ' + svgArrowRight() + '</button>';
  } else {
    h += '<button class="btn btn-primary" id="w-confirm"' + (state.confirming ? ' disabled' : '') + '>';
    h += state.confirming ? spinner() + ' Confirming...' : svgLock() + ' Confirm Booking';
    h += '</button>';
  }
  h += '</div></div>';

  // Summary sidebar with hero
  h += renderSummary();

  h += '</div>'; // page-layout
  return h;
}

/* --- Step 5: Payment (Stripe) --- */
function renderPayment() {
  var q = state.quote || {};
  var h = '';
  if (state.error) h += errorHtml(state.error);
  if (state.paymentError) h += errorHtml(state.paymentError);

  h += '<div class="page-layout">';
  h += '<div>';

  h += '<div class="card">';
  h += '<div class="card-title">' + svgLock() + ' Secure Payment</div>';
  h += '<div class="card-sub">Enter your card details below. Your payment is secured by Stripe.</div>';

  // Amount summary
  h += '<div style="background:var(--primary-light);border:1px solid color-mix(in srgb, var(--primary) 20%, transparent);border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">';
  h += '<span style="font-size:14px;font-weight:600;color:var(--text)">Total Amount</span>';
  h += '<span style="font-size:22px;font-weight:700;color:var(--primary)">' + formatCurrency(q.gross_total || 0) + '</span>';
  h += '</div>';

  // Stripe card element mount point
  h += '<div class="field"><label>Card Details</label>';
  h += '<div id="stripe-card-element" style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;min-height:44px;transition:border-color .2s"></div>';
  h += '<div id="stripe-card-errors" style="color:var(--error);font-size:12px;margin-top:6px"></div>';
  h += '</div>';

  // Security badges
  h += '<div style="display:flex;align-items:center;gap:8px;margin:16px 0;font-size:11px;color:var(--text-secondary)">';
  h += svgLock() + ' <span>256-bit SSL encryption</span>';
  h += '<span style="margin:0 4px">&middot;</span>';
  h += '<span>Powered by <strong>Stripe</strong></span>';
  h += '</div>';

  h += '<div class="btn-row">';
  h += '<button class="btn btn-outline" id="w-back4">' + svgArrowLeft() + ' Back</button>';
  h += '<button class="btn btn-primary" id="w-pay"' + (state.paymentProcessing ? ' disabled' : '') + '>';
  h += state.paymentProcessing ? spinner() + ' Processing...' : svgLock() + ' Pay & Confirm';
  h += '</button></div>';
  h += '</div>';

  h += '</div>';

  // Summary sidebar
  h += renderSummary();
  h += '</div>';
  return h;
}

/* --- Success Step --- */
function renderSuccess() {
  var c = state.confirmation || {};
  var h = '<div class="card">';
  h += renderConfetti();
  h += '<div class="success-wrap">';
  h += '<div class="success-icon">' + svgCheckLg() + '</div>';
  h += '<h2>Booking Confirmed!</h2>';
  var msg = 'Thank you for your reservation.';
  if (state.paymentEnabled) msg += ' Your payment has been processed successfully.';
  msg += ' A confirmation email has been sent to <strong>' + esc(state.email) + '</strong>.';
  h += '<p>' + msg + '</p>';
  if (c.booking_reference) h += '<div class="success-ref">' + esc(c.booking_reference) + '</div>';
  else if (c.reference) h += '<div class="success-ref">' + esc(c.reference) + '</div>';
  h += '<div style="margin-top:24px"><button class="btn btn-outline" id="w-new" style="max-width:220px;margin:0 auto">Make Another Booking</button></div>';
  h += '</div></div>';
  return h;
}

/* --- Confetti --- */
function renderConfetti() {
  var colors = ['var(--primary)', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#10b981'];
  var h = '<div class="confetti-container">';
  for (var i = 0; i < 18; i++) {
    var left = Math.random() * 100;
    var delay = Math.random() * 0.6;
    var c = colors[i % colors.length];
    h += '<div class="confetti-piece" style="left:' + left + '%;background:' + c + ';animation-delay:' + delay.toFixed(2) + 's;top:-10px"></div>';
  }
  h += '</div>';
  return h;
}

/* --- Event binding --- */
function bindEvents() {
  on('w-search', 'click', doSearch);
  on('w-back1', 'click', function() { state.step = 1; state.error = null; render(); });
  on('w-back2', 'click', function() { state.step = 2; render(); });
  on('w-back3', 'click', function() { state.step = 3; render(); });
  on('w-back4', 'click', function() { state.step = 4; state.paymentError = null; render(); });
  on('w-next2', 'click', doSelectUnit);
  on('w-next3', 'click', doQuote);
  on('w-confirm', 'click', doConfirm);
  on('w-to-payment', 'click', doGoToPayment);
  on('w-pay', 'click', doPayAndConfirm);
  // Summary sidebar buttons
  on('w-summary-next', 'click', doSelectUnit);
  on('w-summary-quote', 'click', doQuote);
  on('w-summary-confirm', 'click', state.paymentEnabled ? doPayAndConfirm : doConfirm);
  on('w-new', 'click', function() {
    state.step = 1; state.selectedUnit = null; state.selectedExtras = {};
    state.quote = null; state.confirmation = null; state.error = null;
    state.paymentError = null; state.paymentIntentClientSecret = null; state.paymentIntentId = null;
    state.firstName = ''; state.lastName = ''; state.email = ''; state.phone = ''; state.requests = '';
    render();
  });

  // Room cards
  var rooms = document.querySelectorAll('.room-card[data-unit]');
  for (var i = 0; i < rooms.length; i++) {
    (function(el) {
      el.addEventListener('click', function() {
        var uid = el.getAttribute('data-unit');
        state.selectedUnit = state.available.find(function(u) { return String(u.id) === uid; }) || null;
        render();
      });
    })(rooms[i]);
  }

  // Extra cards
  var exCards = document.querySelectorAll('[data-extra-card]');
  for (var j = 0; j < exCards.length; j++) {
    (function(el) {
      el.addEventListener('click', function() {
        var eid = el.getAttribute('data-extra-card');
        if (state.selectedExtras[eid]) delete state.selectedExtras[eid];
        else state.selectedExtras[eid] = true;
        render();
      });
    })(exCards[j]);
  }

  // Calendar triggers — render first, then load prices in background
  on('w-ci-trigger', 'click', function() {
    state.calendarOpen = true;
    state.pickingCheckout = false;
    render();
    loadCalendarPrices();
  });
  on('w-co-trigger', 'click', function() {
    state.calendarOpen = true;
    state.pickingCheckout = true;
    render();
    loadCalendarPrices();
  });

  // Calendar popup events
  on('cal-close', 'click', function() { state.calendarOpen = false; render(); });
  on('cal-overlay', 'click', function(e) {
    if (e.target.id === 'cal-overlay') { state.calendarOpen = false; render(); }
  });
  on('cal-prev', 'click', function() {
    var now = new Date();
    if (state.calendarYear === now.getFullYear() && state.calendarMonth <= now.getMonth()) return;
    state.calendarMonth--;
    if (state.calendarMonth < 0) { state.calendarMonth = 11; state.calendarYear--; }
    render();
    loadCalendarPrices();
  });
  on('cal-next', 'click', function() {
    state.calendarMonth++;
    if (state.calendarMonth > 11) { state.calendarMonth = 0; state.calendarYear++; }
    render();
    loadCalendarPrices();
  });
  on('cal-apply', 'click', function() { state.calendarOpen = false; render(); });

  // Calendar day clicks
  bindCalendarDays();

  // Sync inputs
  onInput('w-adults', function(v) { state.adults = parseInt(v) || 2; });
  onInput('w-children', function(v) { state.children = parseInt(v) || 0; });
  onInput('w-promo', function(v) { state.promo = v; });
  onInput('w-fname', function(v) { state.firstName = v; });
  onInput('w-lname', function(v) { state.lastName = v; });
  onInput('w-email', function(v) { state.email = v; });
  onInput('w-phone', function(v) { state.phone = v; });
  onInput('w-requests', function(v) { state.requests = v; });
}

/* --- Actions --- */
function doSearch() {
  state.error = null;
  if (!state.checkIn || !state.checkOut) { state.error = 'Please select both check-in and check-out dates.'; render(); return; }
  if (state.checkIn >= state.checkOut) { state.error = 'Check-out date must be after check-in.'; render(); return; }
  var cfg = state.config || {};
  var n = nights();
  if (cfg.min_nights && n < cfg.min_nights) { state.error = 'Minimum stay is ' + cfg.min_nights + ' nights.'; render(); return; }
  if (cfg.max_nights && n > cfg.max_nights) { state.error = 'Maximum stay is ' + cfg.max_nights + ' nights.'; render(); return; }

  state.searching = true; render();
  apiGet('availability', {
    check_in: state.checkIn,
    check_out: state.checkOut,
    adults: state.adults,
    children: state.children
  }).then(function(data) {
    state.available = data.available || [];
    state.selectedUnit = null;
    state.step = 2;
    state.searching = false;
    render();
  }).catch(function() {
    state.error = 'Failed to check availability. Please try again.';
    state.searching = false;
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
  var extras = Object.keys(state.selectedExtras).map(function(id) { return { id: id, quantity: 1 }; });

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
    state.error = 'Failed to generate quote. Please try again.';
    render();
  });
}

function doConfirm() {
  state.error = null;
  if (!state.firstName.trim()) { state.error = 'First name is required.'; render(); return; }
  if (!state.lastName.trim()) { state.error = 'Last name is required.'; render(); return; }
  if (!state.email.trim() || state.email.indexOf('@') < 1) { state.error = 'A valid email address is required.'; render(); return; }
  state.confirming = true; render();

  apiPost('confirm', {
    hold_token: state.quote ? state.quote.hold_token : '',
    guest: {
      first_name: state.firstName.trim(),
      last_name: state.lastName.trim(),
      email: state.email.trim(),
      phone: state.phone.trim()
    }
  }).then(function(data) {
    state.confirming = false;
    if (data.error) { state.error = data.error; render(); return; }
    state.confirmation = data;
    state.step = successStep();
    render();
  }).catch(function() {
    state.confirming = false;
    state.error = 'Booking failed. Please try again.';
    render();
  });
}

function doGoToPayment() {
  state.error = null;
  if (!state.firstName.trim()) { state.error = 'First name is required.'; render(); return; }
  if (!state.lastName.trim()) { state.error = 'Last name is required.'; render(); return; }
  if (!state.email.trim() || state.email.indexOf('@') < 1) { state.error = 'A valid email address is required.'; render(); return; }

  // Create a PaymentIntent from the hold token
  state.paymentProcessing = true;
  state.paymentError = null;
  render();

  apiPost('payment-intent', {
    hold_token: state.quote ? state.quote.hold_token : ''
  }).then(function(data) {
    state.paymentProcessing = false;
    if (data.error) { state.error = data.error; render(); return; }
    state.paymentIntentClientSecret = data.client_secret;
    state.paymentIntentId = data.payment_intent_id;
    state.step = 5;
    render();
    // Mount Stripe Elements after DOM is rendered
    mountStripeElement();
  }).catch(function() {
    state.paymentProcessing = false;
    state.error = 'Failed to initialize payment. Please try again.';
    render();
  });
}

function mountStripeElement() {
  if (!state.stripeInstance || !state.paymentIntentClientSecret) return;
  var container = document.getElementById('stripe-card-element');
  if (!container) return;

  var appearance = {
    theme: (state.style && state.style.theme === 'dark') ? 'night' : 'stripe',
    variables: {
      colorPrimary: (state.style && state.style.primary_color) || '#2d6a4f',
      borderRadius: '8px'
    }
  };

  state.stripeElements = state.stripeInstance.elements({
    clientSecret: state.paymentIntentClientSecret,
    appearance: appearance
  });

  state.cardElement = state.stripeElements.create('payment');
  state.cardElement.mount('#stripe-card-element');

  state.cardElement.on('change', function(event) {
    var errEl = document.getElementById('stripe-card-errors');
    if (errEl) errEl.textContent = event.error ? event.error.message : '';
  });
}

function doPayAndConfirm() {
  if (!state.stripeInstance || !state.stripeElements || !state.paymentIntentClientSecret) {
    state.paymentError = 'Payment not initialized. Please go back and try again.';
    render();
    return;
  }

  state.paymentProcessing = true;
  state.paymentError = null;
  render();

  state.stripeInstance.confirmPayment({
    elements: state.stripeElements,
    confirmParams: {
      return_url: window.location.href, // Fallback for 3D Secure redirects
      payment_method_data: {
        billing_details: {
          name: state.firstName.trim() + ' ' + state.lastName.trim(),
          email: state.email.trim(),
          phone: state.phone.trim() || undefined
        }
      }
    },
    redirect: 'if_required'
  }).then(function(result) {
    if (result.error) {
      state.paymentProcessing = false;
      state.paymentError = result.error.message || 'Payment failed. Please try again.';
      render();
      return;
    }

    // Payment succeeded — now confirm the booking
    state.confirming = true;
    render();

    apiPost('confirm', {
      hold_token: state.quote ? state.quote.hold_token : '',
      guest: {
        first_name: state.firstName.trim(),
        last_name: state.lastName.trim(),
        email: state.email.trim(),
        phone: state.phone.trim()
      },
      payment_intent_id: state.paymentIntentId,
      payment_method: 'stripe'
    }).then(function(data) {
      state.confirming = false;
      state.paymentProcessing = false;
      if (data.error) { state.paymentError = data.error; render(); return; }
      state.confirmation = data;
      state.step = successStep();
      render();
    }).catch(function() {
      state.confirming = false;
      state.paymentProcessing = false;
      state.paymentError = 'Payment was processed but booking confirmation failed. Please contact support.';
      render();
    });
  });
}

/* --- Helpers --- */
function on(id, evt, fn) { var el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }
function onInput(id, fn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function() { fn(el.value); });
  if (el.tagName === 'SELECT') el.addEventListener('change', function() { fn(el.value); });
}
function esc(s) { if (s === null || s === undefined) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function nights() {
  if (!state.checkIn || !state.checkOut) return 1;
  return Math.max(1, Math.round((new Date(state.checkOut) - new Date(state.checkIn)) / 86400000));
}
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '';
  var loc = LANG === 'de' ? 'de-DE' : (LANG === 'fr' ? 'fr-FR' : 'en-US');
  return new Intl.NumberFormat(loc, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}
function formatDate(d) {
  if (!d) return '';
  var dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString(LANG === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}
function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
function field(label, input) { return '<div class="field"><label>' + label + '</label>' + input + '</div>'; }
function selectHtml(id, opts, val) {
  var h = '<select id="' + id + '">';
  opts.forEach(function(o) { h += '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>'; });
  h += '</select>';
  return h;
}
function errorHtml(msg) { return '<div class="error-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' + esc(msg) + '</div>'; }
function spinner() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .7s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'; }
function notifyHeight() {
  try { window.parent.postMessage({ type: 'hoteltech-widget-height', height: document.documentElement.scrollHeight }, '*'); } catch (e) {}
}

function getCheapestPrice() {
  var prices = state.calendarPrices;
  var min = Infinity;
  var today = new Date().toISOString().slice(0,10);
  for (var d in prices) {
    if (d >= today && prices[d] > 0 && prices[d] < min) min = prices[d];
  }
  return min === Infinity ? 0 : min;
}

function formatCompactPrice(amount) {
  if (!amount) return '';
  return CURRENCY === 'EUR' ? '\u20ac' + amount : (CURRENCY === 'USD' ? '$' + amount : (CURRENCY === 'GBP' ? '\u00a3' + amount : amount + ' ' + CURRENCY));
}

function svgCalendar() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
}

function loadCalendarPrices() {
  if (state.calendarPricesLoading) return;
  var start = state.calendarYear + '-' + String(state.calendarMonth + 1).padStart(2, '0') + '-01';
  var endDate = new Date(state.calendarYear, state.calendarMonth + 3, 0);
  var end = endDate.toISOString().slice(0, 10);

  // Skip fetch if we already have prices for a sample day in this range
  var sampleDay = state.calendarYear + '-' + String(state.calendarMonth + 1).padStart(2, '0') + '-15';
  if (state.calendarPrices[sampleDay] !== undefined) return;

  state.calendarPricesLoading = true;
  apiGet('calendar-prices', { start: start, end: end })
    .then(function(data) {
      state.calendarPricesLoading = false;
      if (data.prices) {
        var added = false;
        for (var d in data.prices) {
          if (state.calendarPrices[d] === undefined) added = true;
          state.calendarPrices[d] = data.prices[d];
        }
        // Only re-render if calendar is still open and we got new data
        if (added && state.calendarOpen) renderCalendarInPlace();
      }
    })
    .catch(function() {
      state.calendarPricesLoading = false;
    });
}

// Update only the calendar popup DOM without rebuilding the entire widget
function renderCalendarInPlace() {
  var popup = document.querySelector('.cal-popup');
  if (!popup) { render(); return; }
  // Rebuild months content
  var monthsEl = popup.querySelector('.cal-months');
  if (monthsEl) {
    var nextMonth = state.calendarMonth + 1;
    var nextYear = state.calendarYear;
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }
    monthsEl.innerHTML = renderMonth(state.calendarYear, state.calendarMonth) + renderMonth(nextYear, nextMonth);
    bindCalendarDays();
  }
  notifyHeight();
}

function bindCalendarDays() {
  var days = document.querySelectorAll('.cal-day[data-date]:not(.disabled)');
  for (var di = 0; di < days.length; di++) {
    (function(el) {
      el.addEventListener('click', function() {
        var date = el.getAttribute('data-date');
        if (!state.checkIn || state.pickingCheckout === false) {
          state.checkIn = date;
          state.checkOut = '';
          state.pickingCheckout = true;
        } else {
          if (date <= state.checkIn) {
            state.checkIn = date;
            state.checkOut = '';
          } else {
            state.checkOut = date;
            state.calendarOpen = false;
          }
        }
        render();
      });
    })(days[di]);
  }
}

// SVG icons
function svgSearch() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>'; }
function svgCheck(c) { return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + (c || 'currentColor') + '" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'; }
function svgCheckLg() { return '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'; }
function svgArrowLeft() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'; }
function svgArrowRight() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'; }
function svgLock() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'; }
function svgClipboard() { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:4px"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>'; }
function svgCalendarSmall() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:3px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'; }
function svgMoon() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:3px"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'; }
function svgUsers() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:3px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>'; }
function svgBed() { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:3px"><path d="M2 4v16M2 8h18a2 2 0 012 2v10M2 17h20M6 8v-2a2 2 0 012-2h8a2 2 0 012 2v2"/></svg>'; }
function svgStar() { return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:3px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'; }

/* --- Apply style config --- */
function applyStyle(cfg) {
  var s = cfg.style || {};
  state.style = s;
  var root = document.documentElement;
  var theme = s.theme || THEME;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  if (s.primary_color) root.style.setProperty('--primary', s.primary_color);
  if (s.border_radius) root.style.setProperty('--radius', s.border_radius + 'px');
  if (s.font_family) root.style.setProperty('--font', s.font_family);
  if (cfg.currency) CURRENCY = cfg.currency;
}

/* --- Load Stripe.js lazily --- */
function loadStripeJs(cb) {
  if (typeof Stripe !== 'undefined') { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://js.stripe.com/v3/';
  s.async = true;
  s.onload = cb;
  s.onerror = function() { console.warn('Failed to load Stripe.js'); };
  document.head.appendChild(s);
}

/* --- Spin keyframe (inline for spinner) --- */
var styleTag = document.createElement('style');
styleTag.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(styleTag);

/* --- Init --- */
apiGet('config').then(function(data) {
  state.config = data;
  state.loading = false;
  applyStyle(data);

  // Initialize Stripe if payment is enabled
  if (data.payment_enabled && data.stripe_publishable_key) {
    state.paymentEnabled = true;
    state.stripePublishableKey = data.stripe_publishable_key;
    loadStripeJs(function() {
      state.stripeInstance = Stripe(state.stripePublishableKey);
    });
  }

  // Read URL params for pre-fill (from chat widget "Book Now" links)
  var urlParams = {};
  try {
    var sp = new URLSearchParams(window.location.search);
    sp.forEach(function(v, k) { urlParams[k] = v; });
  } catch(e) {}

  // Sensible default dates (overridden by URL params if present)
  var d = new Date();
  d.setDate(d.getDate() + 1);
  state.checkIn = urlParams.check_in || d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 2);
  state.checkOut = urlParams.check_out || d.toISOString().slice(0, 10);

  if (urlParams.adults) state.adults = Math.max(1, Math.min(20, parseInt(urlParams.adults) || 2));
  if (urlParams.children) state.children = Math.max(0, Math.min(10, parseInt(urlParams.children) || 0));

  render();

  // If a room is pre-selected via URL, auto-search and jump to step 2
  if (urlParams.room && state.checkIn && state.checkOut) {
    state.searching = true;
    render();
    apiGet('availability', { check_in: state.checkIn, check_out: state.checkOut, adults: state.adults, children: state.children })
      .then(function(avail) {
        state.searching = false;
        state.available = avail.available || avail.data || [];
        // Pre-select the matching room
        var targetId = urlParams.room;
        var matched = state.available.find(function(u) { return String(u.id) === String(targetId); });
        if (matched) {
          state.selectedUnit = matched;
          state.step = 3; // Jump to extras step
        } else if (state.available.length) {
          state.step = 2; // Show available rooms
        }
        render();
      })
      .catch(function() {
        state.searching = false;
        render();
      });
  }
}).catch(function() {
  state.loading = false;
  state.error = 'Unable to load booking configuration. Please refresh the page.';
  render();
});

})();
</script>
</body>
</html>
