{{--
  The offer bar (data-block="announcement", data-variant="new-patient-note").

  The author's plum strip above the header: one sentence, a middle dot, and
  a dotted link — "New patient visits available this month · Choose a time".
  The sentence is `announcement.text`, the link's words `announcement.cta_label`
  with the resolved Book label as the fallback, and the link's destination
  is the layout's primary action: the booking flow where it is on offer, the
  phone or the footer hub otherwise (6.4). With no action at all the bar is
  the sentence alone. PageContent::has('announcement') gates the band on the
  sentence, so a bar with nothing to say never renders.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="new-patient-note" aria-label="{{ __('Current offer') }}">
    <p>{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</p>
  </aside>
