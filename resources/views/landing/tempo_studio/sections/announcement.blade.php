{{--
  The offer bar (data-block="announcement" — the author names no variant).

  The kit's own first element, above the header and outside <main>: on the
  blue band, an ACID LABEL, a middle dot, one line, a middle dot, and one
  link. The author writes "New member week · First coached session €12 ·
  Choose a time"; the label is `announcement.label` (kit 03-beauty's badge
  leaf, drawn here as his bold acid span), the line is `announcement.text`,
  the link's words are `announcement.cta_label`, and the dots are his. His
  element is a <div> with the text directly inside it, and so is this one.

  EMPTY IS NOT A STATE THIS FILE HANDLES: an announcement with no message
  counts 0 and the layout never includes this partial; a label with no line
  beside it is not a section either. The link renders only where the booking
  flow is actually reachable.
--}}
@php
    $label   = trim((string) ($copy['label'] ?? ''));
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <div class="announcement" data-block="announcement">@if ($label !== '')<span>{{ $label }}</span> · @endif{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</div>
