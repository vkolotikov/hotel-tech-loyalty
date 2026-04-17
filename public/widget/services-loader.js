/**
 * Hotel Tech — Embeddable Services Reservation Widget Loader
 *
 * Usage:
 *   <div id="hoteltech-services"></div>
 *   <script src="https://yourdomain.com/widget/services-loader.js"
 *           data-org="ORG_TOKEN"
 *           data-lang="en"
 *           data-primary-color="#c9a84c"></script>
 *
 * Injects an iframe pointing at the hosted /services-widget page and
 * listens for height messages so the embed auto-resizes.
 */
;(function () {
  'use strict'

  var scripts = document.getElementsByTagName('script')
  var me = scripts[scripts.length - 1]

  var orgId        = me.getAttribute('data-org') || ''
  var lang         = me.getAttribute('data-lang') || 'en'
  var primaryColor = me.getAttribute('data-primary-color') || ''
  var theme        = me.getAttribute('data-theme') || ''
  var containerId  = me.getAttribute('data-container') || 'hoteltech-services'
  var categoryId   = me.getAttribute('data-category') || ''
  var serviceId    = me.getAttribute('data-service') || ''

  if (!orgId) {
    console.error('[HotelTech] Missing data-org attribute on services widget script tag.')
    return
  }

  var src = me.getAttribute('src') || ''
  var baseUrl = src.replace(/\/widget\/services-loader\.js.*$/, '')

  var iframeSrc = baseUrl + '/services-widget?org=' + encodeURIComponent(orgId)
  if (lang)         iframeSrc += '&lang=' + encodeURIComponent(lang)
  if (primaryColor) iframeSrc += '&color=' + encodeURIComponent(primaryColor)
  if (theme)        iframeSrc += '&theme=' + encodeURIComponent(theme)
  if (categoryId)   iframeSrc += '&category=' + encodeURIComponent(categoryId)
  if (serviceId)    iframeSrc += '&service=' + encodeURIComponent(serviceId)

  var container = document.getElementById(containerId)
  if (!container) {
    container = document.createElement('div')
    container.id = containerId
    me.parentNode.insertBefore(container, me)
  }

  var iframe = document.createElement('iframe')
  iframe.src = iframeSrc
  iframe.style.cssText = 'width:100%;min-height:680px;border:none;border-radius:16px;'
  iframe.setAttribute('allowtransparency', 'true')
  iframe.setAttribute('loading', 'lazy')
  iframe.setAttribute('title', 'Book a service')

  container.innerHTML = ''
  container.appendChild(iframe)

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'hoteltech-services-height' && e.data.height) {
      iframe.style.height = e.data.height + 'px'
    }
  })
})()
