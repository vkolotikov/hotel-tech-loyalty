{{--
  The header (data-block="header", data-variant="studio-sticky").

  The author's sticky cream bar: the brand lockup — a plum disc with the
  business's initial, the wordmark in the display face, a small uppercase
  descriptor under it — and, at the right edge, his plum "Book a visit" pill
  with a calendar before its label. His navigation is not here (polish-1:
  a landing page is one page), so the grid is brand | book and the
  stylesheet's appended block pins the pill to the end.

  THE LOCKUP IS ONE RESOLVED NAME. `$brandName`, `$brandInitial` and
  `$brandDescriptor` are resolved once in the layout and read here and in
  the footer, so the two lockups can never disagree. A brand with a real
  logo puts it in the disc (the appended `.brand > span img` rule sizes it);
  the derived infix emphasis on a conjunction in the business's own name is
  Copy::wordmark()'s.

  THE BOOK PILL is the layout's primary action, whatever that resolved to:
  the booking flow, the phone, or the footer hub — and it says which (6.4).
--}}
@php
    use App\Landing\Copy;
@endphp
  <header class="site-header" data-block="header" data-variant="studio-sticky">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="#top" aria-label="{{ $brandName }}">
@if ($content->contact->logoUrl !== null)
        <span aria-hidden="true"><img src="{{ $content->contact->logoUrl }}" alt="" decoding="async"></span>
@elseif ($brandInitial !== '')
        <span aria-hidden="true">{{ $brandInitial }}</span>
@endif
        <strong>{{ Copy::wordmark($brandName) }}</strong>
@if ($brandDescriptor !== '')
        <small>{{ $brandDescriptor }}</small>
@endif
      </a>
@endif
@if ($bookingHref !== null)
      <a class="header__book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $chromeLabels['header'] }}</a>
@endif
    </div>
  </header>
