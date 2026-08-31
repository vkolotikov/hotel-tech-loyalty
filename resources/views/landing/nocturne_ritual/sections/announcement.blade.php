{{--
  The offer bar (data-block="announcement", data-variant="quiet-offer").

  The kit's own first element, above the header and outside <main>: a single
  quiet line and one link. The stylesheet hides it entirely below 37rem —
  the author's decision, not a fallback — so nothing essential may ever live
  here, and nothing does: this band is one sentence the tenant wrote.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0 (PageContent::count()'s 'announcement' arm), has() is false, the
  layout never includes this partial, and no empty bar appears above the
  header. The link is separate: it renders only where the booking flow is
  actually reachable, and its label falls back to the industry's own verb
  rather than to invented copy.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $label   = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <aside class="announcement" data-block="announcement" data-variant="quiet-offer" aria-label="{{ __('Current offer') }}">
    <p>{{ $message }}</p>
@if ($bookingHref !== null)
    <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $label !== '' ? $label : $bookingLabel }}</a>
@endif
  </aside>
