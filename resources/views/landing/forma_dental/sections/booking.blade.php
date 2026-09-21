{{--
  A calmer first step (data-block="booking", data-variant="smile-invitation").

  The author's closing card: a rounded plum panel on the porcelain page with
  a faint ring in its corner — on the left an eyebrow, a two-line display
  heading and one sentence in oat; on the right his cream button with the
  calendar before its label and a "Need help? +371 …" line under it. NO
  PHOTOGRAPH, NO PROMISE CHIPS and NO ORNAMENTAL NUMERAL — so
  `booking.promise_1..3`, `booking.index` and the photograph slot are not
  read here and `content_fields` does not offer them on this design.

  THE WIDGET IS FRAMED, NEVER INLINED — a security ruling, not a layout
  preference, and why this band renders a LINK: LandingHostGuard refuses the
  widget host pages on the landing origin, and LandingPageSecurity::widgetUrl()
  builds the href from app.url, the same value its own frame-src is built
  from, so the destination is permitted by construction.

  THE PHONE LINE is the author's "Need help? +371 20 000 523":
  `booking.call_label` is the wording and the number is the one the business
  already publishes; only the NUMBER is the link, which is what he draws.

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

    $callLabel = trim((string) ($copy['call_label'] ?? ''));
@endphp
    <section class="booking" id="booking" data-block="booking" data-variant="smile-invitation">
      <div class="booking__card">
        <div>
          <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('booking') }}</p>
          <h2>{{ Copy::heading($copy['heading'] ?? __('Choose a time. We will take it from there.'), $copy['heading_accent'] ?? null) }}</h2>
@if ($terms !== '')
          <p>{{ $terms }}</p>
@endif
        </div>
        <div>
@if ($bookingHref !== null)
          <a class="button button--cream" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <p class="booking__phone">@if ($callLabel !== ''){{ $callLabel }} @endif<a href="tel:{{ $dial }}">{{ $phone }}</a></p>
@endif
        </div>
      </div>
    </section>
