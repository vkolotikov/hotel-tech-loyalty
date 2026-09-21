{{--
  The header (data-block="header", data-variant="dark-overlay").

  The author's glass bar floating over the hero: the brand lockup — a ruled
  ring with the business's initial, the wordmark in the body face, a small
  mono descriptor under it — and, at the right edge, his mono "Start
  consultation" link with a calendar before its label. His navigation is
  not here (polish-1: a landing page is one page), so the grid is brand |
  book and the stylesheet's appended block pins the control to the end.

  THE LOCKUP IS ONE RESOLVED NAME. `$brandName`, `$brandInitial` and
  `$brandDescriptor` are resolved once in the layout and read here and in
  the footer, so the two lockups can never disagree. A brand with a real
  logo puts it in the ring (the appended `.brand > span img` rule sizes it);
  the derived infix emphasis on a conjunction in the business's own name is
  Copy::wordmark()'s.

  THE BOOK CONTROL is the layout's primary action, whatever that resolved
  to: the booking flow, the phone, or the footer hub — and it says which (6.4).
--}}
@php
    use App\Landing\Copy;
@endphp
  <header class="site-header" data-block="header" data-variant="dark-overlay">
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
