/**
 * Hotel Tech — Embeddable Booking Widget Loader
 *
 * Usage:
 *   <div id="hoteltech-booking"></div>
 *   <script src="https://yourdomain.com/widget/booking-loader.js"
 *           data-org="ORG_ID"
 *           data-lang="en"
 *           data-primary-color="#c9a84c"></script>
 *
 * The script injects an iframe pointing at the hosted widget page,
 * passing the organisation ID so each company gets isolated data.
 */
;(function () {
  'use strict'

  // Find our own script tag to read data-* attributes
  var scripts = document.getElementsByTagName('script')
  var me = scripts[scripts.length - 1]

  var orgId        = me.getAttribute('data-org') || ''
  var lang         = me.getAttribute('data-lang') || 'en'
  var primaryColor = me.getAttribute('data-primary-color') || ''
  var theme        = me.getAttribute('data-theme') || ''
  var containerId  = me.getAttribute('data-container') || 'hoteltech-booking'

  if (!orgId) {
    console.error('[HotelTech] Missing data-org attribute on booking widget script tag.')
    return
  }

  // Resolve base URL from the script src (same origin as the loader)
  var src = me.getAttribute('src') || ''
  var baseUrl = src.replace(/\/widget\/booking-loader\.js.*$/, '')

  // Build iframe URL
  var iframeSrc = baseUrl + '/booking-widget?org=' + encodeURIComponent(orgId)
  if (lang)         iframeSrc += '&lang=' + encodeURIComponent(lang)
  if (primaryColor) iframeSrc += '&color=' + encodeURIComponent(primaryColor)
  if (theme)        iframeSrc += '&theme=' + encodeURIComponent(theme)

  // Create or find container
  var container = document.getElementById(containerId)
  if (!container) {
    container = document.createElement('div')
    container.id = containerId
    me.parentNode.insertBefore(container, me)
  }

  // Inject iframe
  var iframe = document.createElement('iframe')
  iframe.src = iframeSrc
  iframe.style.cssText = 'width:100%;min-height:620px;border:none;border-radius:12px;'
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('title', 'Book your stay')

  container.innerHTML = ''
  container.appendChild(iframe)

  // Listen for height messages from the widget so the iframe auto-resizes
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'hoteltech-widget-height' && e.data.height) {
      iframe.style.height = e.data.height + 'px'
    }
  })
})()
