{{--
  The closing panel (data-block="booking", data-variant="evening-invitation").

  The author's ember band, set in his night ink: a mono eyebrow, a display
  heading broken onto two lines, and a column holding the sentence, the cream
  button and the phone number as a ruled link.

  NO PHOTOGRAPH, NO PROMISE CHIPS AND NO ORNAMENTAL NUMERAL — this author draws
  none of them, so `booking.promise_1..3`, `booking.index`, `booking.alt` and
  `booking.caption` are not read here and `content_fields` does not offer them
  on this design.

  THE WIDGET IS FRAMED, NEVER INLINED — that is a security ruling and not a
  layout preference, and it is why this band renders a LINK rather than an
  embed. LandingHostGuard refuses the widget host pages on the landing origin:
  the booking widget's isolation from customer-supplied content is a browser
  ORIGIN boundary, which an XSS on this page cannot cross, where a routing rule
  would only be a routing rule.

  Nor is the href spelled here. LandingPageSecurity::widgetUrl() builds it from
  app.url — the same value its own frame-src is built from — so the destination
  is permitted by construction, and $bookingHref is null when there is no origin
  to name.

  THE PHONE LINE is the author's bare number under the button. He writes NO
  wording beside it, so `booking.call_label` is optional here: written, it sits
  in front of the number exactly as it does on the other two hospitality
  templates; blank, the number stands alone, which is his own page.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer, and
  since template fidelity phase 6 that is a CAPABILITY test, not an industry
  test: a hotel (the stay widget) or any tenant with a bookable service, section
  and schedule (the appointment widget, in its restaurant vocabulary — "Booking
  / Section"). A restaurant that cannot yet take a reservation online closes on
  the phone or the footer's contact hub instead — which is exactly where its
  fixed Reserve pill then points. This partial does not second-guess that: it
  is only included when the band is going to render.
--}}
@php
    use App\Landing\Copy;

    // The one paragraph above the button. `terms` is the leaf every design uses
    // for the sentence beside a Reserve control; this author's is "Live
    // reservations show the next available tables."
    $terms = trim((string) ($copy['terms'] ?? ''));

    // The phone action. tel: wants dialling characters and nothing else; the
    // display string keeps whatever spacing the tenant typed. A + is meaningful
    // only in first position, so any later one is dropped rather than dialled —
    // the same sanitiser the footer hub uses.
    $phone = $content->contact->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $callLabel = trim((string) ($copy['call_label'] ?? ''));
    $callShort = trim((string) ($copy['call_short'] ?? ''));
@endphp
    <section class="booking" id="booking" data-block="booking" data-variant="evening-invitation">
      <div class="container booking__inner">
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
        <h2>{{ Copy::heading($copy['heading'] ?? __('Choose an evening.'), $copy['heading_accent'] ?? null) }}</h2>
        <div>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
@if ($bookingHref !== null)
          <a class="button button--cream" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <a href="tel:{{ $dial }}"@if ($callShort !== '') aria-label="{{ $callShort }}"@endif>@if ($callLabel !== ''){{ $callLabel . ' ' }}@endif{{ $phone }}</a>
@endif
        </div>
      </div>
    </section>
