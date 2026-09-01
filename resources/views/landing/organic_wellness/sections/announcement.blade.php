{{--
  The seasonal note (data-block="announcement", data-variant="seasonal").

  The kit's own first element, above the header and outside <main>: a badge
  pill, one quiet sentence and one link, on the moss band. Below 44rem the
  author drops the sentence and keeps the link — his decision, not a
  fallback — so nothing essential may ever live here, and nothing does.

  THE BADGE IS A LEAF OF ITS OWN (`announcement.label`, template fidelity
  5.2). The author writes "Late-summer ritual" there and it is a different
  claim from the sentence beside it — a season, an offer name — so it is its
  own field rather than the first few words of the message. It is NOT the
  band's gate: count() still reads `text` alone, so a badge with no sentence
  beside it is not a section.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0, has() is false, the layout never includes this partial, and no
  empty bar appears above the header. The link is separate: it renders only
  where the booking flow is actually reachable, and its label falls back to
  the industry's own verb rather than to invented copy.
--}}
@php
    $label   = trim((string) ($copy['label'] ?? ''));
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="seasonal" aria-label="{{ __('Current offer') }}">
    <div class="container announcement__inner">
      <p>@if ($label !== '')<span class="announcement__label">{{ $label }}</span> @endif{{ $message }}</p>
@if ($bookingHref !== null)
      <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }} <span aria-hidden="true">↗</span></a>
@endif
    </div>
  </aside>
