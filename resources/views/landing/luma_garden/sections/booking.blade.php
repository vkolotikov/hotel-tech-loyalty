{{--
  The closing panel (data-block="booking", data-variant="garden-invitation").

  The author's pine card, inset from the page on its own large radius: an
  eyebrow, a two-tone display heading broken onto two lines and a paragraph on
  one side; the shell button and a phone line for large parties on the other.

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
  is permitted by construction, and $bookingHref is null when there is no
  origin to name.

  THE PHONE LINE is the author's "Groups of eight or more? +371 20 000 212":
  `booking.call_label` is the wording and the number is the one the business
  already publishes. Only the NUMBER is the link, which is what he draws and
  what stops a screen reader announcing a question as a phone number.

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

    // The one paragraph under the heading. `terms` is the leaf every design
    // uses for the sentence beside a Reserve control; this author's is "Choose
    // a date, service and party size to see live availability."
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
    <section class="booking" id="booking" data-block="booking" data-variant="garden-invitation">
      <div class="booking__card">
        <div>
          <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? __('Your table in the garden can start here.'), $copy['heading_accent'] ?? null) }}</h2>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
        </div>
        <div>
@if ($bookingHref !== null)
          <a class="button button--cream" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <p class="booking-phone">@if ($callLabel !== ''){{ $callLabel }} @endif<a href="tel:{{ $dial }}"@if ($callShort !== '') aria-label="{{ $callShort }}"@endif>{{ $phone }}</a></p>
@endif
        </div>
      </div>
    </section>
