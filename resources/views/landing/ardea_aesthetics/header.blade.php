{{--
  The header (data-block="header", data-variant="quiet-overlay").

  The author's floating glass pill sitting 2.5rem below the top edge (the
  height of his offer bar), holding the brand lockup and the Book control.
  His bar is `position: absolute` over the hero photograph, which is why the
  hero pads for it.

  GENERATED FROM THE PAGE'S OWN DATA, never from tenant copy: the mark is the
  business's initial in his ring, the wordmark is its name, the descriptor
  is its own word for what it is. There is no `content.header.*`.

  THE LOCKUP IS THE AUTHOR'S OWN THREE ELEMENTS — `<span>` ring, `<strong>`
  name, `<small>` descriptor, siblings — and his stylesheet addresses them
  by element, so no class is added to any of them. A tenant's logo takes the
  ring (the appended `.brand > span img` rule keeps it inside), and the
  wordmark's conjunction, if the business has one, is set in the accent by
  App\Landing\Copy::wordmark() — derived from the name, never a leaf.

  NO NAVIGATION (polish-1, the owner's ruling): a landing page is ONE page,
  so the header carries the brand and the Book control and nothing else —
  no anchor list, no mobile menu. The author hid the Book control at his
  74rem breakpoint in favour of a menu; the stylesheet's appended block
  shows it there instead, at the end of his own header grid.
--}}
@php
    use App\Landing\Copy;
@endphp
  <header class="site-header" data-block="header" data-variant="quiet-overlay">
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
