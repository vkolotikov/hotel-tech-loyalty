/*
 * The Ruled Page — the interactive layer.
 *
 * Appendix B 4.7's whole budget: one file, one entry point, no dependencies,
 * no build step. It is served straight out of public/ under script-src 'self',
 * exactly as /w/chat.js is, and it never reaches Laravel — so it needs nothing
 * from LandingHostGuard's allow-list.
 *
 * EVERYTHING HERE IS AN ENHANCEMENT. Blocked, removed, or simply still in
 * flight, the page it decorates is finished: the action bar is visible, the
 * reviews track scrolls natively, and the reading spine sits at zero.
 *
 * The one rule in the stylesheet that HIDES something is the action bar's
 * resting state, and it is switched on by body.bar-managed, which is set
 * INSIDE the branch that can also switch it off again. A page-wide "js is
 * running" class would not do, and an earlier revision of this file proved
 * it: the class went on before this code knew whether IntersectionObserver
 * existed, and where it does not, the bar sat translated off the bottom of
 * the screen with nothing left to reveal it -- the page's only mobile CTA and
 * tel: link gone, their 64px still reserved. A guard that can fail closed on
 * the one control that matters is worse than no guard.
 *
 * Five jobs, and only the five with no CSS-only equivalent:
 *   1. the mobile action bar's reveal, and its retract over the booking widget
 *   2. the reviews index — counter, ticks, arrow keys
 *   3. the reading spine, ONLY where scroll-driven CSS is unavailable
 *   4. the scroll reveals (Task 4, phase 3c) — this file ADDS the .reveal
 *      class itself, so the shipped markup never starts anything hidden
 *   5. the nav's condense-on-scroll class
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // A programmatic scroll is travel, and travel is what reduced motion asks to
  // be spared. Read at call time: the setting can change mid-session.
  function behaviour() {
    return reduced.matches ? 'auto' : 'smooth';
  }

  /* 1 — the mobile action bar (3.9) --------------------------------------- */
  var bar = document.querySelector('.rp-bar');
  var booking = document.getElementById('booking');

  if (bar && window.IntersectionObserver) {
    // Set here and nowhere earlier: this class switches on the rule that
    // hides the bar, so it belongs where there is also something to reveal
    // it again.
    document.body.classList.add('bar-managed');

    var trigger = document.querySelector('.rp-hero .rp-cta') || document.querySelector('.rp-hero');
    var scrolled = !trigger;
    var onBooking = false;

    var apply = function () {
      var show = scrolled && !onBooking;
      bar.classList.toggle('is-in', show);
      // 3.6 keys the chat launcher's offset off this class, and the
      // stylesheet keys the body's reserved height off it too, so both track
      // the bar rather than the viewport width. Written from one place, so
      // they cannot disagree about whether the bar is on screen.
      document.body.classList.toggle('has-actionbar', show);
    };

    if (trigger) {
      new IntersectionObserver(function (entries) {
        var entry = entries[0];
        // Above the fold there is exactly one CTA, not two: the bar appears
        // only once the hero's own has scrolled off the TOP, never while the
        // page is merely still short of it.
        scrolled = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        apply();
      }).observe(trigger);
    }

    if (booking) {
      // Retract while the booking band is on screen, so the bar can never
      // cover a date picker.
      //
      // A SENTINEL, not a ratio. 3.9 specifies threshold 0.25, and a ratio
      // test cannot express what is wanted here at all: intersectionRatio is
      // visible area over TOTAL area, so a band taller than four viewports
      // can never reach 0.25 however much of the screen the widget fills. Two
      // successive attempts to patch around that failed in the same way. An
      // observer fires only when a LISTED threshold is crossed, and
      // intersectionRect.height caps at the viewport, so a height backstop can
      // only ever be evaluated where some listed t satisfies
      // vh/2 <= t*H <= vh. Each threshold added covers one more interval of
      // band heights and leaves gaps either side of it: with
      // [0,.05,.1,.25,.5] the bar still never retracted for a band between 4
      // and 5 viewports, which is the ordinary size of a booking band and the
      // original symptom exactly.
      //
      // Collapsing the root to a zero-height line at the viewport's middle
      // asks the question directly -- is the booking band under the middle of
      // the screen -- and answers it with isIntersecting alone. No height
      // arithmetic, no thresholds to enumerate, and no band height that can
      // fall between them.
      new IntersectionObserver(function (entries) {
        onBooking = entries[0].isIntersecting;
        apply();
      }, { threshold: 0, rootMargin: '-50% 0px -50% 0px' }).observe(booking);
    }

    apply();
  }

  /* 2 — the reviews index (4.5.6) ----------------------------------------- */
  var track = document.querySelector('.rp-reviews__track');
  var items = track ? Array.prototype.slice.call(track.children) : [];

  // One review has nothing to index, and 4.5.6 says so: ticks, counter and the
  // keyboard handler are all omitted rather than rendered inert.
  if (track && items.length > 1) {
    var origin = items[0].offsetLeft;

    var goTo = function (n) {
      track.scrollTo({ left: items[n].offsetLeft - origin, behavior: behaviour() });
    };

    var index = document.createElement('div');
    var counter = document.createElement('p');
    var strip = document.createElement('div');

    index.className = 'rp-index';
    counter.className = 'rp-index__counter';
    strip.className = 'rp-index__ticks';

    // Built here rather than in Blade on purpose: a tick is a button, and a
    // button rendered by a template that ships no script is a control that
    // does nothing when it is pressed.
    var buttons = items.map(function (item, i) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rp-index__tick';
      button.setAttribute('aria-label', item.getAttribute('aria-label') || 'Review ' + (i + 1));
      button.addEventListener('click', function () { goTo(i); });
      strip.appendChild(button);
      return button;
    });

    index.appendChild(counter);
    index.appendChild(strip);
    track.parentNode.insertBefore(index, track.nextSibling);

    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var current = -1;

    var sync = function () {
      var middle = track.scrollLeft + track.clientWidth / 2;
      var n = 0;
      var i;

      for (i = 0; i < items.length; i++) {
        if (items[i].offsetLeft - origin < middle) { n = i; }
      }

      if (n === current) { return; }
      current = n;

      // A genuine index, which is what earns the numbering here where a
      // decorative 01/02/03 marker elsewhere on this page would not.
      counter.textContent = pad(n + 1) + ' / ' + pad(items.length);

      for (i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle('is-on', i === n);
        buttons[i].setAttribute('aria-current', i === n ? 'true' : 'false');
      }
    };

    var pending = false;

    track.addEventListener('scroll', function () {
      if (pending) { return; }
      pending = true;
      requestAnimationFrame(function () { pending = false; sync(); });
    }, { passive: true });

    track.addEventListener('keydown', function (event) {
      var step = event.key === 'ArrowRight' ? 1 : (event.key === 'ArrowLeft' ? -1 : 0);
      if (!step) { return; }
      event.preventDefault();
      goTo(Math.min(items.length - 1, Math.max(0, current + step)));
    });

    sync();
  }

  /* 3 — the reading spine (4.3.5) ----------------------------------------- */
  // Feature-detected, and the listener is not attached AT ALL where the CSS
  // drives it: a scroll handler running beside a scroll-driven animation is
  // pure cost. --p is written through CSSOM, which CSP does not police, so
  // this needs neither a style attribute nor a nonce.
  if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()'))) {
    var spine = document.querySelector('.rule-progress');

    if (spine) {
      var queued = false;

      var write = function () {
        var travel = root.scrollHeight - window.innerHeight;
        root.style.setProperty('--p', travel > 0 ? (window.scrollY / travel).toFixed(3) : '1');
        queued = false;
      };

      window.addEventListener('scroll', function () {
        if (queued) { return; }
        queued = true;
        requestAnimationFrame(write);
      }, { passive: true });

      write();
    }
  }

  /* 4 — scroll reveals (Task 4, landing phase 3c) -------------------------- */
  // THE MARKUP SHIPS REVEAL-FREE. This block adds .reveal itself, on a
  // curated selector list, and only where an IntersectionObserver exists to
  // add .is-visible back — so a blocked script, an old engine, or a reader
  // who asked for reduced motion gets a page where nothing ever started
  // hidden. The stylesheet's reduced-motion block covers the mid-session
  // toggle the load-time check below cannot see.
  //
  // Curation, not a wildcard: .band__kicker is deliberately ABSENT (its
  // desktop treatment is a rotate transform that .reveal's translateY and
  // .is-visible's transform:none would both destroy — see the stylesheet's
  // note on the vertical eyebrow), and so is .rp-book__frame (animating a
  // container whose iframe loads asynchronously double-flashes; the
  // partial's own comment rules it out). Task 5 drops .rp-hero__plate from
  // the plan for the same kind of reason: it is now the photo hero's
  // full-bleed BACKDROP and the LCP element — fading the whole stage in
  // over 1.1s is a worse first paint, and the reference reveals the hero's
  // CONTENT, never its photograph. The pair of CTAs reveals as one
  // .rp-hero__actions block; the imageless monogram device joins instead.
  //
  // Each entry is [selector, delay]: 0 means no data-delay, 1-4 a fixed
  // stagger step, and 'stagger' cycles 1-4 across the matches so lists
  // (menu rows, portraits, quotes) cascade the way the reference pages do.
  if (window.IntersectionObserver && !reduced.matches) {
    // Task 7 renames: the services rows are .rp-pillar now (numbered pillar
    // rows), the about plate is .rp-about__frame (the cinematic frame — the
    // frame reveals as one object, tag and accent border included), and the
    // booking band adds its perks row. The booking CARD itself is
    // deliberately NOT in the plan for the same reason .rp-book__frame never
    // was: it contains the async iframe, and animating that container
    // double-flashes — its title/terms/perks reveal individually instead.
    var revealPlan = [
      ['.rp-hero__chip', 0], ['.rp-hero h1', 0], ['.rp-hero__sub', 1], ['.rp-hero__actions', 2], ['.rp-hero__device', 3],
      ['.rp-services__title', 0], ['.rp-services__sub', 1], ['.rp-pillar', 'stagger'], ['.rp-services__cta', 2],
      ['.rp-about__frame', 0], ['.rp-about__lead', 1], ['.rp-about__body', 2],
      // The tenant-added text band (repeatable-sections round). Selectors,
      // not keys: a page may carry six of these and every one renders
      // through the same partial, so one entry per element covers all of
      // them. Its eyebrow is .band__kicker, which stays excluded for the
      // rotation reason above.
      ['.rp-text__frame', 0], ['.rp-text__title', 0], ['.rp-text__prose', 1],
      ['.rp-team__title', 0], ['.rp-team__sub', 1], ['.rp-member', 'stagger'],
      ['.rp-reviews__aggregate', 0], ['.rp-review', 'stagger'],
      ['.rp-book__title', 0], ['.rp-book__terms', 1], ['.rp-book__perks', 1],
      ['.rp-field', 'stagger'], ['.rp-hours', 2], ['.rp-map', 3],
      ['.rp-footer__top', 0]
    ];

    var revealer = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (entries[e].isIntersecting) {
          entries[e].target.classList.add('is-visible');
          revealer.unobserve(entries[e].target);
        }
      }
    }, { threshold: 0.15 });

    for (var p = 0; p < revealPlan.length; p++) {
      var matches = document.querySelectorAll(revealPlan[p][0]);
      var delay = revealPlan[p][1];

      for (var m = 0; m < matches.length; m++) {
        matches[m].classList.add('reveal');
        if (delay === 'stagger') {
          if (m % 4 !== 0) { matches[m].setAttribute('data-delay', String(m % 4)); }
        } else if (delay > 0) {
          matches[m].setAttribute('data-delay', String(delay));
        }
        revealer.observe(matches[m]);
      }
    }
  }

  /* 5 — the nav condense (Task 4, landing phase 3c) ------------------------ */
  // A passive, rAF-throttled scroll listener toggling one class at 24px of
  // travel; the stylesheet owns what condensing looks like, and switches its
  // transition off under prefers-reduced-motion. Attached only when the
  // layout actually rendered a nav.
  var nav = document.querySelector('.nav');

  if (nav) {
    var navQueued = false;

    var condense = function () {
      nav.classList.toggle('is-condensed', window.scrollY > 24);
      navQueued = false;
    };

    window.addEventListener('scroll', function () {
      if (navQueued) { return; }
      navQueued = true;
      requestAnimationFrame(condense);
    }, { passive: true });

    condense();
  }

  /* 6 — the chat dock (Task 8, landing phase 3c) --------------------------- */
  // The launcher is the template's own button and the panel is an iframe on
  // the admin origin, because the widget's inline script and inline style
  // ATTRIBUTES are both refused by this page's CSP and no nonce reaches an
  // attribute (see layout.blade.php's own note). So the only thing left on
  // this side is a toggle: show the frame, say so on aria-expanded, and let
  // the stylesheet swap the glyph off that same attribute.
  //
  // NOT an enhancement, unlike everything above it, and it is the one place
  // in this file where that is true: with this script blocked the launcher is
  // an inert button and the panel stays hidden. That is the correct resting
  // state -- a chat panel nobody can close would be worse -- and it is why
  // the panel ships `hidden` in the markup rather than being hidden by a
  // class this file adds.
  var chat = document.querySelector('.rp-chat');
  var chatLauncher = chat && chat.querySelector('.rp-chat__launcher');
  var chatPanel = chat && chat.querySelector('.rp-chat__panel');

  if (chatLauncher && chatPanel) {
    // The frame's own origin, read off the src the template rendered. This
    // file is static and same-origin, so it cannot be told the admin origin
    // any other way -- and postMessage must never be handed '*' when the
    // page it is addressing is cross-origin.
    var chatOrigin = null;
    try { chatOrigin = new URL(chatPanel.getAttribute('src'), location.href).origin; } catch (e) {}

    var setChat = function (open) {
      chatPanel.hidden = !open;
      chatLauncher.setAttribute('aria-expanded', open ? 'true' : 'false');

      var label = chatLauncher.getAttribute(open ? 'data-label-close' : 'data-label-open');
      if (label) { chatLauncher.setAttribute('aria-label', label); }

      if (open && chatOrigin && chatPanel.contentWindow) {
        // Re-opening after the visitor closed the panel from INSIDE the
        // frame: the widget is still mounted there but its panel is hidden,
        // and only the frame can press its launcher again. Harmlessly
        // dropped on the first open, when the frame has not loaded yet and
        // the widget opens itself.
        try { chatPanel.contentWindow.postMessage({ htchat: 'open' }, chatOrigin); } catch (e) {}
      }

      if (!open) { try { chatLauncher.focus(); } catch (e) {} }
    };

    chatLauncher.addEventListener('click', function () {
      setChat(chatPanel.hidden);
    });

    document.addEventListener('keydown', function (event) {
      if (chatPanel.hidden) { return; }
      if (event.key === 'Escape' || event.key === 'Esc') { setChat(false); }
    });

    // The widget's own header carries an X. Pressing it closes the panel
    // INSIDE the frame, which would otherwise leave this page holding an
    // open iframe with nothing painted in it; the frame reports the close
    // and this side catches up. Identified by the window it came from rather
    // than by its origin string: the frame is the only window this page ever
    // listens to, and nothing else can forge event.source.
    window.addEventListener('message', function (event) {
      if (event.source !== chatPanel.contentWindow) { return; }
      if (event.data && event.data.htchat === 'closed') { setChat(false); }
    });
  }
}());
