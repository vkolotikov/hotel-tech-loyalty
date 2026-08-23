{{--
  Reserve (Appendix B 4.5.7).

  THE WIDGET IS FRAMED, NEVER INLINED, and that is a security ruling rather
  than a layout preference. LandingHostGuard refuses /api/v1/booking/*,
  /api/v1/services/*, /api/v1/public/reviews/* and the widget host pages
  /book/{token}, /form/{x}, /review/{id} and /k/{d} on the landing origin: the
  booking widget's isolation from customer-supplied content is a browser
  origin boundary, which an XSS on this page cannot cross, where a routing
  rule would only be a routing rule. Inlining the widget here to save one
  iframe would require widening that allow-list and would throw the boundary
  away. Do not.

  The src is not spelled here either. LandingPageSecurity::widgetUrl() builds
  it from app.url — the same value its own frame-src is built from — so the
  frame this section renders is permitted by construction. It returns null
  when there is no origin to name, which is exactly when frame-src is 'none',
  and the band falls back to the phone rather than framing a blank box.

  A light clearing between two dark bands, and the practical choice as well:
  the widget is a light surface and 3.5 keeps it in its light theme on all
  three templates.
--}}
@php
    $phone = $content->contact?->phone;

    // tel: wants dialling characters and nothing else; the display string
    // keeps whatever spacing the tenant typed. A + is meaningful only in
    // first position, so any later one is dropped rather than dialled.
    $dial = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;
@endphp
<section id="booking" data-section="booking" class="band band--paper-2 rp-book">
  <div class="wrap">
    <div class="rp-book__col">
      <p class="band__kicker">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
      <h2 class="rp-book__title">{{ $copy['heading'] ?? 'Pick an hour. That’s the whole process.' }}</h2>

      {{-- One line of honest operational detail. It is the thing people
           actually want to know before they commit to a time. --}}
      <p class="rp-book__terms">{{ $copy['terms'] ?? 'Confirmation is instant. Cancel free up to 24 hours before.' }}</p>

      @if (filled($bookingUrl ?? null))
        {{-- No scroll-reveal on this frame: animating a container whose
             contents load asynchronously produces a visible double-flash.
             The skeleton sits BEHIND the iframe rather than being removed by
             a script, so it is covered the moment the widget paints and is
             still there if the widget never does. --}}
        <div class="rp-book__frame">
          <p class="rp-book__skeleton" aria-hidden="true">Loading booking…</p>
          <iframe class="rp-book__iframe" src="{{ $bookingUrl }}"
                  title="{{ $profile->primaryCta }}" loading="lazy"></iframe>
        </div>
      @endif

      @if ($dial !== null)
        {{-- Set at the heading's weight, deliberately. A studio that answers
             the phone is making a promise the form cannot, and burying that
             in a footnote under an embed throws away the strongest
             commercial line on the page. --}}
        <p class="rp-book__or">{{ $copy['call_label'] ?? 'Or call' }}</p>
        <a class="rp-book__phone" href="tel:{{ $dial }}">{{ $phone }}</a>
      @endif
    </div>
  </div>

  {{-- The mobile action bar (3.9). It lives inside this band because this is
       the only band that always renders, so the bar cannot outlive its own
       anchor: switch booking off and the bar goes with it, along with the
       body padding and the launcher offset that both key on its presence.

       3.9 reveals and retracts it with an IntersectionObserver, and
       public/landing/ruled_page.js does exactly that: the bar waits for the
       hero's own CTA to leave the screen, and retracts again while this band
       sits under the middle of the viewport, so it can never cover a date
       picker. Where that script does not run — blocked, or a browser with no
       IntersectionObserver — the bar is simply always there below 600px,
       which is a correct resting state rather than a half-working one.
       <body> reserves its height either way, so nothing the bar could cover
       is ever at the bottom of the document, and the chat launcher is raised
       clear of it in the stylesheet by offset only: never restyled. --}}
  <div class="rp-bar" role="group" aria-label="{{ $profile->primaryCta }}">
    @if ($dial !== null)
      <a class="rp-bar__call" href="tel:{{ $dial }}">{{ $copy['call_short'] ?? 'Call' }}</a>
    @endif
    <a class="rp-bar__cta" href="#booking">{{ $profile->primaryCta }}</a>
  </div>
</section>
