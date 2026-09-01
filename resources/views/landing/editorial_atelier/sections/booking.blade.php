{{--
  The closing panel (data-block="booking", data-variant="editorial-cta").

  The author's ink band: an oversized ornamental numeral in the left column,
  and beside it an eyebrow, a display heading, a line of copy, the primary
  button and a phone text-link. NO PHOTOGRAPH and NO PROMISE CHIPS — kit 01
  draws both and this author draws neither, so `booking.terms`,
  `booking.promise_1..3`, `booking.alt` and `booking.caption` are not read
  here and `content_fields` does not offer them on this design. The sentence
  he does write is the band's `subtext`… which this type does not have, so it
  is `terms` after all: see below.

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

  THE PHONE LINE beside the button is `booking.call_label` plus the number
  the business already publishes. Those two leaves have been in the catalogue
  since template fidelity 1.3 surfaced them and only the Ruled Page drew
  them; both kits 02 and 03 put a phone action beside the button, which is
  what D6 records. `call_short` is the compact label the narrow layout uses.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer,
  and today that is the hotel industry only: the widget asks check-in /
  check-out / adults / children, so no other industry advertises a band it
  cannot honestly fill. A salon on this template therefore closes on the
  footer's contact hub instead. This partial does not second-guess that: it
  is only included when the band is going to render.
--}}
@php
    use App\Landing\Copy;

    // The one paragraph under the heading. `terms` is the leaf every design
    // uses for the sentence beside a Book button; this author's is "Choose a
    // service and stylist online, or contact the studio if you would like a
    // little guidance first." Kit 01 splits the same leaf into chips when the
    // tenant has written no promises — this design draws no chips at all, so
    // the paragraph is always a paragraph here.
    $terms = trim((string) ($copy['terms'] ?? ''));

    // The ornamental numeral. The author's is "06"; blank draws nothing
    // rather than an invented number, and it is aria-hidden either way.
    $index = trim((string) ($copy['index'] ?? ''));

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
    <section class="booking section section--ink" id="booking" data-block="booking" data-variant="editorial-cta">
      <div class="container booking__layout">
@if ($index !== '')
        <p class="booking__index" aria-hidden="true">{{ $index }}</p>
@endif
        <div class="booking__content">
          <p class="kicker kicker--inverse">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
          <div class="booking__actions">
@if ($bookingHref !== null)
            <a class="button button--paper" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
            {{-- The author writes "Call:&nbsp;+44&nbsp;20&nbsp;7946&nbsp;0284"
                 — a label and the number. The label is the tenant's wording
                 (`call_label`), the number is the one their contact details
                 already publish, and the accessible name uses the short
                 label where they have written one so a screen reader is not
                 read a punctuation mark. --}}
            <a class="text-link text-link--inverse" href="tel:{{ $dial }}" aria-label="{{ $callShort !== '' ? $callShort : ($callLabel !== '' ? $callLabel : __('Call us')) }}">@include('landing.shared.kit-icon', ['name' => 'phone'])@if ($callLabel !== ''){{ $callLabel }} @endif{{ $phone }}</a>
@endif
          </div>
        </div>
      </div>
    </section>
