{{--
  Start with a conversation (data-block="booking", data-variant="consultation-panel").

  The author's closing band on a copper-to-ink gradient with a faint ring in
  its corner: an eyebrow and a two-line display heading on the left, and on
  the right one sentence, the paper button with his calendar before its
  label and a "Prefer to call? +371 …" line under it. NO PHOTOGRAPH, NO
  PROMISE CHIPS and NO ORNAMENTAL NUMERAL — so `booking.promise_1..3`,
  `booking.index` and the photograph slot are not read here and
  `content_fields` does not offer them on this design.

  THE WIDGET IS FRAMED, NEVER INLINED — that is a security ruling and not a
  layout preference, and it is why this band renders a LINK rather than an
  embed. LandingHostGuard refuses the widget host pages on the landing
  origin: the booking widget's isolation from customer-supplied content is a
  browser ORIGIN boundary, which an XSS on this page cannot cross.

  Nor is the href spelled here. LandingPageSecurity::widgetUrl() builds it
  from app.url — the same value its own frame-src is built from — so the
  destination is permitted by construction, and $bookingHref is null when
  there is no origin to name.

  THE PHONE LINE is the author's "Prefer to call? +371 20 000 412":
  `booking.call_label` is the wording and the number is the one the business
  already publishes; only the NUMBER is the link, which is what he draws.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer,
  and that is a CAPABILITY test, not an industry test: any tenant with a
  bookable service, practitioner and schedule (the appointment widget), or
  a hotel (the stay widget). A clinic that cannot yet be booked online
  closes on the phone or the footer's contact hub instead. This partial
  does not second-guess that: it is only included when the band is going to
  render.
--}}
@php
    use App\Landing\Copy;

    $terms = trim((string) ($copy['terms'] ?? ''));

    // The phone action. tel: wants dialling characters and nothing else; the
    // display string keeps whatever spacing the tenant typed. A + is
    // meaningful only in first position, so any later one is dropped rather
    // than dialled — the same sanitiser the footer hub uses.
    $phone = $content->contact->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $callLabel = trim((string) ($copy['call_label'] ?? ''));
@endphp
    <section class="booking" id="booking" data-block="booking" data-variant="consultation-panel">
      <div class="container booking__inner">
        <div>
          <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
        </div>
        <div>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
@if ($bookingHref !== null)
          <a class="button button--light" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <p class="booking__phone">@if ($callLabel !== ''){{ $callLabel }} @endif<a href="tel:{{ $dial }}">{{ $phone }}</a></p>
@endif
        </div>
      </div>
    </section>
