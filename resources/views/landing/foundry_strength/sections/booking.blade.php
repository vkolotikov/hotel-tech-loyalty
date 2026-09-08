{{--
  Your starting point (data-block="booking", data-variant="assessment-cta").

  The author's closing band on smoke: an eyebrow and a two-line display
  heading on the left, and on the right one sentence, the bone button and a
  "Prefer to call? +371 …" line under it. NO PHOTOGRAPH, NO PROMISE CHIPS,
  NO ORNAMENTAL NUMERAL — none of those leaves is read here.

  THE WIDGET IS FRAMED, NEVER INLINED: this band renders a LINK, built by
  LandingPageSecurity::widgetUrl() from app.url, and $bookingHref is null
  when there is no origin to name. WHEN THIS BAND RENDERS AT ALL is
  PageContent::count('booking')'s answer, a CAPABILITY test: a club that
  cannot yet be booked online closes on the phone or the footer hub.

  THE PHONE LINE: `booking.call_label` is the wording and the number is the
  one the business already publishes; only the NUMBER is the link.
--}}
@php
    use App\Landing\Copy;

    $terms = trim((string) ($copy['terms'] ?? ''));

    $phone = $content->contact->phone;
    $dial  = filled($phone) ? preg_replace(['/[^0-9+]/', '/(?<=.)\+/'], '', (string) $phone) : null;
    $dial  = filled($dial) && preg_match('/\d/', $dial) ? $dial : null;

    $callLabel = trim((string) ($copy['call_label'] ?? ''));
@endphp
    <section class="booking" id="booking" data-block="booking" data-variant="assessment-cta">
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
          <a class="button button--light" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $bookingLabel }}</a>
@endif
@if ($dial !== null)
          <p>@if ($callLabel !== ''){{ $callLabel }} @endif<a href="tel:{{ $dial }}">{{ $phone }}</a></p>
@endif
        </div>
      </div>
    </section>
