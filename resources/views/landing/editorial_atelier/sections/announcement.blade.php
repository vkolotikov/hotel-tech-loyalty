{{--
  The offer bar (data-block="announcement", data-variant="compact").

  The kit's own first element, above the header and outside <main>: a single
  quiet line and one link. Below 46rem the author hides the SENTENCE and
  keeps the link, scrolling horizontally — his decision, not a fallback — so
  nothing essential may ever live here, and nothing does.

  EMPTY IS NOT A STATE THIS FILE HANDLES. An announcement with no message
  counts 0 (PageContent::count()'s 'announcement' arm), has() is false, the
  layout never includes this partial, and no empty bar appears above the
  header. The link is separate: it renders only where the booking flow is
  actually reachable, and its label falls back to the industry's own verb
  rather than to invented copy.

  THE BADGE PILL IS NOT DRAWN HERE. `announcement.label` is kit 03's
  ("Late-summer ritual"); this author writes one plain sentence, and
  `content_fields` therefore does not offer the control on this design.
--}}
@php
    $message = trim((string) ($copy['text'] ?? ''));
    $label   = trim((string) ($copy['cta_label'] ?? ''));
@endphp
  <div class="announcement" data-block="announcement" data-variant="compact" aria-label="{{ __('Current offer') }}">
    <div class="container announcement__inner">
      <p>{{ $message }}</p>
@if ($bookingHref !== null)
      <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $label !== '' ? $label : $bookingLabel }} <span aria-hidden="true">↗</span></a>
@endif
    </div>
  </div>
