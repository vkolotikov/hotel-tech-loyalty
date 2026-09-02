/*
 * The kits' interactive layer — one file, all six templates.
 *
 * SHARED FOR THE REASON landing/shared/kit-icon.blade.php IS (template
 * fidelity 7.1): the six kits declare the SAME integration contract in their
 * own notes — data-action="open-booking", data-action="open-feedback",
 * [data-ai-widget-slot] — and each ships its navigation and its FAQ as a
 * native <details>. There is therefore exactly one behaviour to write, and six
 * copies of it would be six chances for one of them to drift.
 *
 * The only thing the kits spell differently is the class on their mobile menu
 * (`.mobile-menu` in beauty kits 01 and 02, `.mobile-nav` in beauty kit 03 and
 * in all three hospitality kits), which is one selector list rather than one
 * file each — and phase 9-11 added nothing to it at all.
 *
 * One entry point, no dependencies, no build step. Served straight
 * out of public/ under script-src 'self', which is why it exists at all: this
 * page's CSP has no nonce for scripts and no 'unsafe-inline', so an inline
 * handler or an inline <script> would simply never run. The kit's own notes
 * say the same thing from the other side — "Do not add inline scripts,
 * styles, DOM event handlers or javascript: URLs" — so the author's markup
 * and this policy already agree.
 *
 * WHAT IS DELIBERATELY NOT HERE. The author's integration contract names
 * three hooks and only one of them needs JavaScript:
 *
 *   - data-action="open-booking" is a real <a href> to the booking flow,
 *     rendered server-side exactly the way ruled_page's booking band does it
 *     (LandingPageSecurity::widgetUrl('/booking-widget', …), opened in a new
 *     tab). Where no booking origin is configured the link is not rendered at
 *     all rather than rendered dead, so there is nothing for a click handler
 *     to rescue. data-service-id rides along as the author specified it —
 *     see the services partial for why the booking widget cannot consume it
 *     yet, and why that is recorded rather than faked.
 *   - data-action="open-feedback" is the same story: a real href at the
 *     tenant's own review form, present only when one is actually reachable.
 *   - [data-ai-widget-slot] is the one that does: the launcher is this
 *     template's own button and the panel is an iframe on the admin origin,
 *     so the toggle has to live somewhere, and it lives here.
 *
 * The mobile menu, the FAQ and the gallery are native <details> and native
 * scroll-snap in the author's markup. They keep working with this file
 * blocked; all this adds to them is the two courtesies a native <details>
 * menu cannot do for itself (close on Escape, close when you tap outside it).
 */
(function () {
  'use strict';

  /* 1 — the chat dock ------------------------------------------------------
     The kit reserves [data-ai-widget-slot] "for the future AI chat widget"
     and ships no behaviour for it. The widget is now real, and it is FRAMED
     from the admin origin rather than inlined, for the reason the landing
     layout documents at length: it injects an inline <script> and writes its
     positions as inline style ATTRIBUTES, and a nonce reaches neither. So
     the only thing left on this side is a toggle — show the frame, say so on
     aria-expanded, and let the stylesheet swap the glyph off that same
     attribute.

     NOT an enhancement, and the only thing in this file that is not: with
     this script blocked the launcher is an inert button and the panel stays
     hidden. That is the correct resting state — a chat panel nobody can
     close would be worse — and it is why the panel ships `hidden` in the
     markup rather than being hidden by a class this file adds. */
  var launcher = document.querySelector('.ai-launcher');
  var panel = document.querySelector('.ai-panel');

  if (launcher && panel) {
    // The frame's own origin, read off the src the template rendered. This
    // file is static and same-origin, so it cannot be told the admin origin
    // any other way — and postMessage must never be handed '*' when the page
    // it is addressing is cross-origin.
    var chatOrigin = null;
    try { chatOrigin = new URL(panel.getAttribute('src'), location.href).origin; } catch (e) {}

    var setChat = function (open) {
      panel.hidden = !open;
      launcher.setAttribute('aria-expanded', open ? 'true' : 'false');

      var label = launcher.getAttribute(open ? 'data-label-close' : 'data-label-open');
      if (label) { launcher.setAttribute('aria-label', label); }

      if (open && chatOrigin && panel.contentWindow) {
        // Re-opening after the visitor closed the panel from INSIDE the
        // frame: the widget is still mounted there but its own panel is
        // hidden, and only the frame can press its launcher again.
        // Harmlessly dropped on the first open, when the frame has not
        // loaded yet and the widget opens itself.
        try { panel.contentWindow.postMessage({ htchat: 'open' }, chatOrigin); } catch (e) {}
      }

      if (!open) { try { launcher.focus(); } catch (e) {} }
    };

    launcher.addEventListener('click', function () {
      setChat(panel.hidden);
    });

    document.addEventListener('keydown', function (event) {
      if (panel.hidden) { return; }
      if (event.key === 'Escape' || event.key === 'Esc') { setChat(false); }
    });

    // The widget's own header carries an X. Pressing it closes the panel
    // INSIDE the frame, which would otherwise leave this page holding an
    // open iframe with nothing painted in it. Identified by the window the
    // message came from rather than by its origin string: the frame is the
    // only window this page ever listens to, and nothing can forge
    // event.source.
    window.addEventListener('message', function (event) {
      if (event.source !== panel.contentWindow) { return; }
      if (event.data && event.data.htchat === 'closed') { setChat(false); }
    });
  }

  /* 2 — the mobile menu ----------------------------------------------------
     A native <details>, which is the author's choice and the reason the menu
     works with no script at all. What a native <details> cannot do is close
     itself once you have used it, so a visitor who taps "Rituals" arrives at
     the price list with the panel still covering it. Three lines, all of
     them removing state rather than creating any. */
  var menu = document.querySelector('.mobile-menu, .mobile-nav');

  if (menu) {
    var closeMenu = function () {
      if (menu.open) { menu.open = false; }
    };

    menu.addEventListener('click', function (event) {
      var link = event.target.closest ? event.target.closest('a') : null;
      if (link) { closeMenu(); }
    });

    document.addEventListener('click', function (event) {
      if (!menu.open) { return; }
      if (!menu.contains(event.target)) { closeMenu(); }
    });

    document.addEventListener('keydown', function (event) {
      if (!menu.open) { return; }
      if (event.key === 'Escape' || event.key === 'Esc') { closeMenu(); }
    });
  }
}());
