{{--
  The header (data-block="header" — the author names no variant on it).

  The author's floating glass pill, 2.4rem below the top edge, holding the
  brand lockup, a centred uppercase nav and the Book control with his arrow
  after its label; below 74rem the nav and the control fold into a native
  <details> menu.

  THE LOCKUP IS THE AUTHOR'S OWN MONOGRAM IDIOM: the business's initial in
  an acid circle, then `<strong>` holding the wordmark with the descriptor
  `<small>` INSIDE it (his `.brand > strong` is a grid). A tenant's logo takes
  the circle on a hairline instead of the acid fill (`.brand__mark--logo`, in
  the stylesheet's appended block). The wordmark is the business's name as
  the business spells it; its conjunction, if any, is set in the accent by
  App\Landing\Copy::wordmark().

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the links
  are the bands this page is actually going to render. The mobile menu is a
  native <details>; landing/kit.js only adds close-on-Escape and
  close-on-tap-outside.

  NO NAVIGATION (polish-1, 2026-09-08, the owner's ruling): a landing page is
  ONE page, so the header carries the brand and the Book control and nothing
  else — no anchor list, no mobile menu. The author hid the Book control at
  his mobile breakpoint in favour of a menu; the stylesheet's appended block
  shows it there instead, in his own header grid (brand | book).
--}}
@php
    use App\Landing\Copy;

    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <header class="site-header" data-block="header">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="#top" aria-label="{{ $brandName }}">
@if ($content->contact->logoUrl !== null)
        <span class="brand__mark--logo" aria-hidden="true"><img src="{{ $content->contact->logoUrl }}" alt="" decoding="async"></span>
@elseif ($brandInitial !== '')
        <span aria-hidden="true">{{ $brandInitial }}</span>
@endif
        <strong>{{ Copy::wordmark($brandName) }}@if ($brandDescriptor !== '')<small>{{ $brandDescriptor }}</small>@endif</strong>
      </a>
@endif
@if ($bookingHref !== null)
      <a class="header__book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $chromeLabels['header'] }}@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@endif
    </div>
  </header>
