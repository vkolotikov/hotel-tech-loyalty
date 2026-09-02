{{--
  The quiet offer (data-block="announcement", data-variant="quiet-offer").

  The kit's own first element, above the header and outside <main>: one
  centred line on the oxblood bar, with the action as an underlined RUN INSIDE
  the sentence rather than a control beside it. That is this author's shape
  and it is why the message and the link wording are two leaves — his own line
  reads "Lunch returns Friday — reserve the first table", where the sentence
  sets up the link and the link finishes it.

  THIS AUTHOR DRAWS NO BADGE. `announcement.label` is kit 03's pill and is not
  read here, so `content_fields` does not offer it on this design.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0, has() is false, the layout never includes this partial, and no
  empty bar appears above the header. The link is separate: it renders only
  where the booking flow is actually reachable, and its label falls back to
  the industry's own verb — "Reserve a table" on a restaurant page — rather
  than to invented copy.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="quiet-offer" aria-label="{{ __('Current offer') }}">
    <p>{{ $message }}@if ($bookingHref !== null) <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</p>
  </aside>
