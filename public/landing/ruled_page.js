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
 * Three jobs, and only the three with no CSS-only equivalent:
 *   1. the mobile action bar's reveal, and its retract over the booking widget
 *   2. the reviews index — counter, ticks, arrow keys
 *   3. the reading spine, ONLY where scroll-driven CSS is unavailable
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
}());
