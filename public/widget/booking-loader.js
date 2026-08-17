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
 * Config may ALSO be placed on the container instead of the script tag, which
 * is what makes this work in page builders that relocate or rewrite scripts:
 *
 *   <div id="hoteltech-booking" data-org="ORG_ID" data-lang="en"></div>
 *   <script src="https://yourdomain.com/widget/booking-loader.js" defer></script>
 *
 * The script injects an iframe pointing at the hosted widget page, passing the
 * organisation ID so each company gets isolated data.
 */
;(function () {
  'use strict'

  /**
   * Find our own <script> tag.
   *
   * The previous implementation used `scripts[scripts.length - 1]`, the classic
   * "the last script is me" trick. That is only true while the document is
   * being parsed and the script is synchronous. It breaks — silently — when the
   * tag carries defer/async, when it is injected after load, or when a CMS or
   * page builder collects scripts and re-emits them elsewhere (Joomla and
   * YOOtheme both do this). The wrong element is then read, `data-org` comes
   * back empty, and the loader bails: a blank space with one console error.
   *
   * document.currentScript is exact whenever it is available. The src match is
   * the fallback for the deferred/relocated case.
   */
  function findSelf() {
    if (document.currentScript) return document.currentScript
    var byName = document.querySelector('script[src*="booking-loader.js"]')
    if (byName) return byName
    var all = document.getElementsByTagName('script')
    return all[all.length - 1] || null
  }

  var me = findSelf()

  /** Read config from the script tag first, then the container. */
  function conf(el, name, fallback) {
    var v = el && el.getAttribute ? el.getAttribute('data-' + name) : null
    return (v === null || v === '') ? fallback : v
  }

  var containerId = conf(me, 'container', '') || 'hoteltech-booking'
  var container   = document.getElementById(containerId)

  var orgId        = conf(me, 'org', '')            || conf(container, 'org', '')
  var lang         = conf(me, 'lang', '')           || conf(container, 'lang', '')  || 'en'
  var primaryColor = conf(me, 'primary-color', '')  || conf(container, 'primary-color', '')
  var theme        = conf(me, 'theme', '')          || conf(container, 'theme', '')

  if (!orgId) {
    console.error(
      '[HotelTech] Booking widget: no data-org found. Put data-org on the ' +
      '<script> tag, or on the container div (e.g. ' +
      '<div id="hoteltech-booking" data-org="123"></div>). Some site builders ' +
      'strip attributes from script tags.'
    )
    return
  }

  // Resolve base URL from the script src (same origin as the loader). Falls
  // back to the page origin when the tag could not be located at all.
  var src = (me && me.getAttribute && me.getAttribute('src')) || ''
  var baseUrl = src
    ? src.replace(/\/widget\/booking-loader\.js.*$/, '')
    : (window.location.protocol + '//' + window.location.host)

  // Build iframe URL
  var iframeSrc = baseUrl + '/booking-widget?org=' + encodeURIComponent(orgId)
  if (lang)         iframeSrc += '&lang=' + encodeURIComponent(lang)
  if (primaryColor) iframeSrc += '&color=' + encodeURIComponent(primaryColor)
  if (theme)        iframeSrc += '&theme=' + encodeURIComponent(theme)

  // Everything above ran synchronously so document.currentScript and the
  // script's own attributes were still valid. The DOM work below is deferred
  // when the document is not ready yet — a loader placed in <head>, or one a
  // page builder moved there, would otherwise throw on document.body being
  // null and render nothing.
  function mount() {
    var el = document.getElementById(containerId)

    if (!el) {
      el = document.createElement('div')
      el.id = containerId
      // Insert next to the script tag when we found it and it is still in the
      // document; otherwise append to <body>, which is where a relocated
      // script would have left the widget nowhere at all.
      if (me && me.parentNode) {
        me.parentNode.insertBefore(el, me)
      } else {
        document.body.appendChild(el)
      }
    }

    var iframe = document.createElement('iframe')
    iframe.src = iframeSrc
    iframe.style.cssText = 'width:100%;min-height:620px;border:none;border-radius:12px;'
    iframe.setAttribute('allowtransparency', 'true')
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('title', 'Booking')

    el.innerHTML = ''
    el.appendChild(iframe)

    // The widget posts its height so the iframe can grow with the content.
    window.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'hoteltech-widget-height' && e.data.height) {
        iframe.style.height = e.data.height + 'px'
      }
    })
  }

  if (document.readyState === 'loading' && !document.body) {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
