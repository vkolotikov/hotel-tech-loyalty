{{--
  Your baseline matters (data-block="booking", data-variant="analysis-invitation").

  The author's closing band on an ice gradient with a faint ring in its
  corner, a three-track row: the mono eyebrow, a two-line display heading,
  and a column with one sentence, the ink button with his calendar before
  its label and, under it, the bare phone number in mono. NO PHOTOGRAPH, NO
  PROMISE CHIPS, NO ORNAMENTAL NUMERAL and NO WORDS BEFORE THE NUMBER — so
  `booking.promise_1..3`, `booking.index`, `booking.call_label` and the
  photograph slot are not read here and `content_fields` does not offer
  them on this design.

  THE WIDGET IS FRAMED, NEVER INLINED — a security ruling, not a layout
  preference, and why this band renders a LINK: LandingHostGuard refuses the
  widget host pages on the landing origin, and LandingPageSecurity::widgetUrl()
  builds the href from app.url, the same value its own frame-src is built
  from, so the destination is permitted by construction.

  THE NUMBER is the one the business already publishes, and it is the link,
  which is what he draws.

  WHEN THIS BAND RENDERS AT ALL is PageContent::count('booking')'s answer, a
  CAPABILITY test, not an industry test: any tenant with a bookable service,
  practitioner and schedule (the appointment widget), or a hotel (the stay
  widget). This partial is only included when the band is going to render.
--}}
@php
    use App\Landing\Copy;

    $terms = trim((string) ($copy['terms'] ?? ''));

    $phone = $content->contact->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;
@endphp
    <section class="booking" id="booking" data-block="booking" data-variant="analysis-invitation">
      <div class="container booking__inner">
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
        <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
        <div>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
@if ($bookingHref !== null)
          <a class="button button--ink" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <a href="tel:{{ $dial }}">{{ $phone }}</a>
@endif
        </div>
      </div>
    </section>
