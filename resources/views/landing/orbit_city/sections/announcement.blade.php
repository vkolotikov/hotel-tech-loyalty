{{--
  The offer bar (data-block="announcement").

  The kit's own first element, above the header and outside <main>: one
  quiet sentence on the terracotta band, a middle dot, and one link. The
  author writes "Direct arrival · Check in before you land ·
  Check your dates", and that is the shape here — the sentence is
  `announcement.text`, the link's words are `announcement.cta_label`, and
  the dot is his. On his hotel pages the bar is a plain <div> with no
  data-variant (his gym pages wrapped it in an <aside> and a <p>); his
  element is kept.

  NO BADGE. Kit 03-beauty draws a pill before its sentence
  (`announcement.label`); this author does not on this page, so the leaf is
  not read here and `content_fields` does not offer it on this design.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0, has() is false, the layout never includes this partial, and no
  empty bar appears above the header. The link is separate: it renders only
  where the booking flow is actually reachable, and its label falls back to
  the industry's own verb rather than to invented copy.
--}}
@php
    // ORBIT'S BAR LEADS WITH A LABEL (hotel-10): the author writes "Direct
    // arrival · Check in before you land · Book a room", the first phrase in
    // a <span> his stylesheet sets in the acid — kit 03-beauty's badge and
    // Tempo's shape, read from `announcement.label`. A blank label draws no
    // span and no leading dot.
    $label   = trim((string) ($copy['label'] ?? ''));
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <div class="announcement" data-block="announcement">@if ($label !== '')<span>{{ $label }}</span> · @endif{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</div>
