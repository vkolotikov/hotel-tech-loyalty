{{--
  The lab note (data-block="announcement", data-variant="lab-note").

  The author's ice-blue mono strip above the header: one line, a middle dot,
  and an underlined link — "Skin analysis consultations · Tuesday to Saturday
  · Book". The line is `announcement.text`, the link's words
  `announcement.cta_label` with the resolved Book label as the fallback, and
  the link's destination is the layout's primary action: the booking flow
  where it is on offer, the phone or the footer hub otherwise (6.4). With no
  action at all the strip is the line alone. PageContent::has('announcement')
  gates the band on the line, so a strip with nothing to say never renders.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="lab-note" aria-label="{{ __('Current offer') }}">
    <p>{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</p>
  </aside>
