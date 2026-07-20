/*! HexaTech survey widget — floating button / popup / slide-up for feedback surveys.
 *
 * Embed (attributes control everything — no extra config calls):
 *   <script src="https://loyalty.hotel-tech.ai/widget/hotel-survey.js"
 *           data-survey="12" data-key="EMBED_KEY"
 *           data-mode="button|popup|slideup" data-position="right|left"
 *           data-label="Feedback" data-color="#2563eb"
 *           data-delay="5" data-frequency="90" async></script>
 *
 * Modes:
 *   button  — a side tab is always available; click opens the survey.
 *   popup   — centered modal opens automatically after data-delay seconds.
 *   slideup — compact card slides up in the corner after data-delay seconds.
 *
 * Frequency capping (localStorage, per survey):
 *   submitted  → suppressed for data-frequency days (default 90)
 *   dismissed  → suppressed for 7 days (auto-open only; the button stays)
 */
(function () {
  'use strict';
  if (window.__htSurveyWidget) return; // single instance
  window.__htSurveyWidget = true;

  var script = document.currentScript;
  if (!script) return;

  var FORM = script.getAttribute('data-survey');
  var KEY = script.getAttribute('data-key');
  if (!FORM || !KEY) return;

  var MODE = (script.getAttribute('data-mode') || 'button').toLowerCase();
  var POS = (script.getAttribute('data-position') || 'right').toLowerCase() === 'left' ? 'left' : 'right';
  var LABEL = script.getAttribute('data-label') || 'Feedback';
  var COLOR = script.getAttribute('data-color') || '#2563eb';
  var DELAY = Math.max(0, parseInt(script.getAttribute('data-delay') || '5', 10) || 0);
  var FREQ_DAYS = Math.max(1, parseInt(script.getAttribute('data-frequency') || '90', 10) || 90);
  var DISMISS_DAYS = 7;

  var ORIGIN = (function () {
    try { return new URL(script.src).origin; } catch (e) { return ''; }
  })();
  var SURVEY_URL = ORIGIN + '/review/' + encodeURIComponent(FORM) + '?key=' + encodeURIComponent(KEY);

  var LS_PREFIX = 'htsv:' + FORM + ':';
  function stamp(key) { try { localStorage.setItem(LS_PREFIX + key, String(Date.now())); } catch (e) {} }
  function within(key, days) {
    try {
      var ts = Number(localStorage.getItem(LS_PREFIX + key) || 0);
      return ts > 0 && (Date.now() - ts) < days * 86400000;
    } catch (e) { return false; }
  }

  var submitted = within('submitted', FREQ_DAYS);
  var dismissed = within('dismissed', DISMISS_DAYS);

  var open = false;
  var overlay = null;

  function el(tag, styles, parent) {
    var node = document.createElement(tag);
    for (var k in styles) node.style[k] = styles[k];
    if (parent) parent.appendChild(node);
    return node;
  }

  function openSurvey(kind) {
    if (open) return;
    open = true;

    var isMobile = window.innerWidth < 640;
    var slide = kind === 'slideup' && !isMobile;

    overlay = el('div', {
      position: 'fixed', zIndex: '2147483000', inset: '0',
      background: slide ? 'transparent' : 'rgba(15,23,42,.45)',
      pointerEvents: slide ? 'none' : 'auto',
      display: 'flex',
      alignItems: slide ? 'flex-end' : 'center',
      justifyContent: slide ? (POS === 'left' ? 'flex-start' : 'flex-end') : 'center',
      padding: slide ? '0 24px 24px' : '16px',
    }, document.body);

    if (!slide) overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSurvey(true); });

    var frameWrap = el('div', {
      position: 'relative',
      width: slide ? '380px' : 'min(460px, 96vw)',
      height: slide ? 'min(600px, 78vh)' : 'min(680px, 92vh)',
      borderRadius: '18px', overflow: 'hidden',
      boxShadow: '0 24px 64px rgba(0,0,0,.35)',
      background: '#fff',
      pointerEvents: 'auto',
      transform: 'translateY(24px)', opacity: '0',
      transition: 'transform .3s ease, opacity .3s ease',
    }, overlay);
    if (isMobile) { frameWrap.style.width = '100vw'; frameWrap.style.height = '100vh'; frameWrap.style.borderRadius = '0'; overlay.style.padding = '0'; }

    var close = el('button', {
      position: 'absolute', top: '10px', right: '10px', zIndex: '2',
      width: '32px', height: '32px', borderRadius: '999px', border: 'none',
      background: 'rgba(15,23,42,.35)', color: '#fff', fontSize: '18px',
      lineHeight: '1', cursor: 'pointer',
    }, frameWrap);
    close.innerHTML = '×';
    close.setAttribute('aria-label', 'Close survey');
    close.addEventListener('click', function () { closeSurvey(true); });

    var iframe = el('iframe', { width: '100%', height: '100%', border: '0' }, frameWrap);
    iframe.src = SURVEY_URL;
    iframe.title = 'Feedback survey';

    requestAnimationFrame(function () {
      frameWrap.style.transform = 'none';
      frameWrap.style.opacity = '1';
    });
  }

  function closeSurvey(byUser) {
    if (!open) return;
    open = false;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    // Dismissing without submitting suppresses future AUTO-opens only;
    // the side button (when present) stays available.
    if (byUser && !submitted) stamp('dismissed');
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.source !== 'hotel-tech-review') return;
    if (d.event === 'review-submitted') {
      submitted = true;
      stamp('submitted');
      // Leave the thank-you (and any share-to-Google prompt) on screen;
      // the guest closes when done. It just never auto-opens again.
    }
  });

  function mountButton() {
    var btn = el('button', {
      position: 'fixed', zIndex: '2147482999',
      top: '50%',
      transform: 'translateY(-50%) rotate(' + (POS === 'left' ? '90deg' : '-90deg') + ')',
      transformOrigin: POS === 'left' ? 'left top' : 'right top',
      background: COLOR, color: '#fff',
      border: 'none', borderRadius: '10px 10px 0 0',
      padding: '10px 18px', fontSize: '13px', fontWeight: '700',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      letterSpacing: '.02em', cursor: 'pointer',
      boxShadow: '0 -2px 14px rgba(0,0,0,.22)',
    }, document.body);
    btn.style[POS] = '0';
    btn.textContent = LABEL;
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', function () { openSurvey('modal'); });
  }

  function boot() {
    if (MODE === 'button') {
      if (!submitted) mountButton();
      return;
    }
    // popup / slideup — auto-open once per visit unless suppressed.
    if (submitted || dismissed) return;
    setTimeout(function () { openSurvey(MODE === 'slideup' ? 'slideup' : 'modal'); }, DELAY * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
