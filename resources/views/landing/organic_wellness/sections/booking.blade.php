{{--
  The closing panel (data-block="booking", data-variant="guided-cta").

  The author's moss card: a light eyebrow, a two-tone heading and a line of
  copy on one side, and on the other the cream button with a phone line under
  it. NO PHOTOGRAPH and NO PROMISE CHIPS — kit 01 draws both and this author
  draws neither, so `booking.promise_1..3`, `booking.alt`, `booking.caption`
  and `booking.index` are not read here and `content_fields` does not offer
  them on this design.

  THE WIDGET IS FRAMED, NEVER INLINED — that is a security ruling and not a
  layout preference, and it is why this band renders a LINK rather than an
  embed. LandingHostGuard refuses the widget host pages on the landing origin:
  the booking widget's isolation from customer-supplied content is a browser
  ORIGIN boundary, which an XSS on this page cannot cross, where a routing
  rule would only be a routing rule.

  Nor is the href spelled here. LandingPageSecurity::widgetUrl() builds it
  from app.url — the same value its own frame-src is built from — so the
  destination is permitted by construction, and $bookingHref is null when
  there is no origin to name.

  THE PHONE LINE is the author's "Prefer a person? Call +371 20 000 000":
  `booking.call_label` is the wording and the number is the one the business
  already publishes. Both leaves have been in the catalogue since template
  fidelity 1.3 surfaced them and only the Ruled Page drew them; kits 02 and 03
  both put a phone action beside the button, which is what D6 records.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer, and
  since template fidelity phase 6 that is a CAPABILITY test, not an industry
  test: a hotel (the stay widget) or any tenant with a bookable ritual,
  therapist and schedule (the appointment widget). A studio that cannot yet
  be booked online closes on the phone or the footer's contact hub instead.
  This partial does not second-guess that: it is only included when the band
  is going to render.
--}}
@php
    use App\Landing\Copy;

    // The one paragraph under the heading. `terms` is the leaf every design
    // uses for the sentence beside a Book button; this author's is "Browse
    // live availability, choose a therapist or start with the time that fits
    // your week."
    $terms = trim((string) ($copy['terms'] ?? ''));

    // The phone action. tel: wants dialling characters and nothing else; the
    // display string keeps whatever spacing the tenant typed. A + is
    // meaningful only in first position, so any later one is dropped rather
    // than dialled — the same sanitiser the footer hub uses.
    $phone = $content->contact->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $callLabel = trim((string) ($copy['call_label'] ?? ''));
    $callShort = trim((string) ($copy['call_short'] ?? ''));
@endphp
    <section class="section booking" id="booking" data-block="booking" data-variant="guided-cta">
      <div class="container booking__card">
        <div class="booking__copy">
          <p class="eyebrow eyebrow--light"><span aria-hidden="true"></span> {{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
        </div>
        <div class="booking__actions">
@if ($bookingHref !== null)
          <a class="button button--cream button--large" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          {{-- The author's own shape: the wording is the tenant's
               (`call_label`), the number is the one their contact details
               already publish, and only the NUMBER is the link — which is
               what he draws and what stops a screen reader announcing a
               question as a phone number. `call_short` is the compact label
               the anchor's accessible name uses where one is written. --}}
          <p>@include('landing.shared.kit-icon', ['name' => 'phone'])<span>@if ($callLabel !== ''){{ $callLabel }} @endif<a href="tel:{{ $dial }}"@if ($callShort !== '') aria-label="{{ $callShort }}"@endif>{{ $phone }}</a></span></p>
@endif
        </div>
      </div>
    </section>
