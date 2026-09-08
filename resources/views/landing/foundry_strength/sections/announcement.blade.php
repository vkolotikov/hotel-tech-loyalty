{{--
  The club note (data-block="announcement" — the author names no variant).

  The kit's own first element, above the header and outside <main>: one
  bold line on the bronze band, a middle dot, and one link. The author
  writes "Private training · limited memberships · View assessment times",
  and that is the shape here — the line is `announcement.text`, the link's
  words are `announcement.cta_label`, and the dot between them is his. His
  element is a <div> with the text directly inside it, and so is this one.

  NO BADGE: `announcement.label` is not read here and not offered on this
  design. EMPTY IS NOT A STATE THIS FILE HANDLES: an announcement with no
  message counts 0, the layout never includes this partial, and no empty bar
  appears above the header. The link renders only where the booking flow is
  actually reachable, and its label falls back to the industry's own verb.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <div class="announcement" data-block="announcement">{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</div>
