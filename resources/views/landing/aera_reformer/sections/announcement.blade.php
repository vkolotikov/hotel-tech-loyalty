{{--
  The studio note (data-block="announcement", data-variant="studio-note").

  The kit's own first element, above the header and outside <main>: one
  quiet sentence on the terracotta band, a middle dot, and one link. The
  author writes "Introductory private sessions now available · View times",
  and that is the shape here — the sentence is `announcement.text`, the
  link's words are `announcement.cta_label`, and the dot is his.

  NO BADGE. Kit 03-beauty draws a pill before its sentence
  (`announcement.label`); this author does not, so the leaf is not read here
  and `content_fields` does not offer it on this design.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0, has() is false, the layout never includes this partial, and no
  empty bar appears above the header. The link is separate: it renders only
  where the booking flow is actually reachable, and its label falls back to
  the industry's own verb rather than to invented copy.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $cta     = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="studio-note" aria-label="{{ __('Current offer') }}">
    <p>{{ $message }}@if ($bookingHref !== null) · <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $cta !== '' ? $cta : $bookingLabel }}</a>@endif</p>
  </aside>
