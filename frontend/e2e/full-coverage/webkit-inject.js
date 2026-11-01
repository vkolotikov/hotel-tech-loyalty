// Loaded first by a WebKit copy of an SPA build (webkit-build.sh writes the clock in): a fixed Date, as Playwright's
// clock.setFixedTime does in shoot.mjs, a count of open fetch/XHR requests, no animations, transitions or caret,
// and the page's errors kept. WebDriver has none of Playwright's hooks, so the page carries them itself.
(() => {
  const fixed = Date.parse("__FC_CLOCK__")
  const RealDate = Date
  function FixedDate(...a) {
    if (!new.target) return new RealDate(fixed).toString()
    return a.length ? new RealDate(...a) : new RealDate(fixed)
  }
  FixedDate.prototype = RealDate.prototype
  FixedDate.now = () => fixed
  FixedDate.parse = RealDate.parse
  FixedDate.UTC = RealDate.UTC
  window.Date = FixedDate
  window.__fcPending = 0
  window.__fcErrors = []
  const realFetch = window.fetch
  window.fetch = function (...a) {
    window.__fcPending++
    return realFetch.apply(this, a).finally(() => { window.__fcPending-- })
  }
  const send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (...a) {
    window.__fcPending++
    this.addEventListener('loadend', () => { window.__fcPending-- }, { once: true })
    return send.apply(this, a)
  }
  window.addEventListener('error', e => window.__fcErrors.push(String(e.message).slice(0, 300)))
  window.addEventListener('unhandledrejection', e => window.__fcErrors.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 300)))
  const style = document.createElement('style')
  style.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}'
  document.head.appendChild(style)
})()
