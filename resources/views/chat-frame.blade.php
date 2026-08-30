<!DOCTYPE html>
{{--
  The chat PANEL, and nothing else, on the admin origin.

  A landing page frames this. It is not a page anyone visits: it has no
  chrome, no background of its own and no launcher -- the launcher belongs to
  the page doing the framing, in that page's own tokens, and this document
  exists so that the widget's inline script and inline style attributes have
  an origin whose policy permits them. See routes/web.php (/chat-frame) and
  LandingPageSecurity::WIDGET_FRAME_PATHS for the boundary either side of it.

  Distinct from chat-widget-host.blade.php, which is the member app's WebView
  screen: that one is keyed by the brand's widget_token, paints its own dark
  background, and pre-captures the signed-in member's identity as a lead.
  This one is keyed by the widget key, paints nothing, and knows no visitor.
--}}
<html lang="{{ $lang }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  {{-- A fragment of another page. It has no standalone value in an index and
       every URL under it is a tenant's widget key. --}}
  <meta name="robots" content="noindex, nofollow">
  <title>Chat</title>
  <style>
    /* TRANSPARENT, and deliberately so: the framing page sizes the iframe and
       the panel's own rounded corners are what the visitor sees. A background
       here would paint a rectangle behind them. */
    html, body { margin: 0; padding: 0; height: 100%; background: transparent;
                 overflow: hidden; -webkit-tap-highlight-color: transparent; }

    /* The widget's launcher never appears. There is one launcher and it is
       the template's, on the framing page, where it can be styled in the
       tenant's accent and reached by the keyboard. !important beats the
       inline display the widget's own togglePanel() writes. */
    #htchat-launcher { display: none !important; }

    /* The panel IS this document, so it fills it.
       :not(#htchat-launcher) is a specificity device, not a filter -- the
       panel is never the launcher. The widget's injected stylesheet lands in
       <head> AFTER this block and carries rules like
       `#htchat-panel:not(.htchat-classic) { height: 78dvh !important }`
       under its own mobile media query; that is (1,1,0) and !important, so
       a plain #htchat-panel rule here loses on both specificity and source
       order. The extra id lifts this to (2,0,0), which nothing the widget
       writes can reach. */
    #htchat-panel:not(#htchat-launcher) {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      /* The widget slides and scales the panel in. Here the FRAME is what
         appears, so an inner animation is a second, contradictory one. */
      transform: none !important;
      transition: none !important;
    }

    /* Appendix B spec 1.1's calming, at the only address it can still reach.
       While the widget ran inside the landing page, ruled_page.css held these
       rules; framed, that stylesheet cannot cross the boundary and they moved
       here with the widget. Attention-grab animation is refused on a page the
       visitor has already chosen to open. */
    #htchat-panel, #htchat-panel *,
    #htchat-panel::before, #htchat-panel::after {
      animation: none !important;
      -webkit-animation: none !important;
      animation-name: none !important;
    }
  </style>
</head>
<body>
  {{-- data-widget-key, not window.HotelChat: the widget derives its API base
       as /api/v1/widget/{key} from the attribute, which is root-relative and
       therefore same-origin with this page by construction. No inline
       assignment, no second copy of the origin to keep in step. --}}
  <script src="{{ $scriptSrc }}" data-widget-key="{{ $widgetKey }}"></script>
  <script>
    /*
     * Two jobs, and only two.
     *
     * 1. Open the panel. The visitor already pressed a launcher -- the
     *    framing page's -- so being shown a second one to press would be the
     *    frame leaking. The widget has no "start open" option, so its own
     *    (hidden) launcher is clicked once it exists, which is also what
     *    starts its session and polling.
     *
     * 2. Tell the parent when the panel closes from INSIDE. The widget's
     *    header carries its own X, and pressing it would otherwise leave the
     *    parent holding an open iframe with nothing painted in it. The
     *    PANEL'S OWN CLASS is what is watched rather than that one button,
     *    so every route to closed reports itself.
     *
     * Inline script is fine here and nowhere else in this feature: this
     * origin sends no script-src. The framing page sends one, which is the
     * whole reason this document exists.
     */
    (function () {
      'use strict';

      var parentWindow = window.parent;

      // Opened directly rather than framed: nothing to talk to, and the two
      // jobs above are both about the frame. Still open the panel, since a
      // blank transparent page is the alternative.
      var framed = parentWindow && parentWindow !== window;

      // Address the parent by origin rather than '*'. document.referrer is
      // the framing page; under its own Referrer-Policy
      // (strict-origin-when-cross-origin) that arrives as the bare origin,
      // which is exactly what postMessage wants. '*' only if there is none.
      var target = '*';
      try {
        if (document.referrer) target = new URL(document.referrer).origin;
      } catch (e) {}

      function tell(type) {
        if (!framed) return;
        try { parentWindow.postMessage({ htchat: type }, target); } catch (e) {}
      }

      var launcher = null;
      var panel = null;
      var tries = 0;

      function open() {
        if (!launcher || !panel) return;
        if (!panel.classList.contains('hidden')) return;
        try { launcher.click(); } catch (e) {}
      }

      function mounted() {
        launcher = document.getElementById('htchat-launcher');
        panel = document.getElementById('htchat-panel');

        if (!launcher || !panel) {
          // The widget builds its DOM after fetching its own config, so
          // there is a real wait here. Bounded: a widget that never mounts
          // (network down, key revoked between render and load) leaves a
          // transparent frame rather than a timer running for the life of
          // the page.
          if (tries++ < 100) setTimeout(mounted, 100);
          return;
        }

        open();

        if (window.MutationObserver) {
          new MutationObserver(function () {
            if (panel.classList.contains('hidden')) tell('closed');
          }).observe(panel, { attributes: true, attributeFilter: ['class'] });
        }
      }

      window.addEventListener('message', function (event) {
        if (event.source !== parentWindow) return;
        if (event.data && event.data.htchat === 'open') open();
      });

      // Escape has to be handled on BOTH sides. The framing page listens for
      // it too, but a keydown is delivered to the document that has focus,
      // and once the visitor is typing in the chat that document is this one
      // -- the parent never sees the key at all. Reported rather than acted
      // on: the parent owns whether the frame is shown.
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' || event.key === 'Esc') tell('closed');
      });

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mounted);
      } else {
        mounted();
      }
    })();
  </script>
</body>
</html>
