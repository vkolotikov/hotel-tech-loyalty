{{--
  The header (data-block="header", data-variant="floating-calm").

  The author's floating pill: a glass bar sitting 2.4rem below the top edge
  (the height of his offer bar), holding the brand lockup, a centred
  uppercase nav and the Book control; below 74rem the nav and the control
  fold into a native <details> menu. His bar is `position: absolute` over
  the hero photograph, which is why the hero pads for it.

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the mark is
  the business's initial in his ring, the wordmark is its name, the
  descriptor is its own word for what it is, and the links are the bands this
  page is actually going to render. There is no `content.header.*` and there
  should not be — a nav a tenant can type into is a nav that can point at a
  band that is not there.

  THE LOCKUP IS THE AUTHOR'S OWN THREE ELEMENTS — `<span>` ring, `<strong>`
  name, `<small>` descriptor — and his stylesheet addresses them by element,
  so no class is added to any of them. A tenant's logo takes the ring (the
  appended `.brand span img` rule keeps it inside), and the wordmark's
  conjunction, if the business has one, is set in the accent by
  App\Landing\Copy::wordmark() — derived from the name, never a leaf.

  $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain.
  The desktop bar takes the first four and the mobile panel takes all five,
  which is exactly what the author's markup does.

  The mobile menu is a native <details>, the author's choice, and it works
  with no JavaScript at all. landing/kit.js only adds the two courtesies a
  native <details> cannot do for itself — close on Escape, close when you tap
  outside.

  NO NAVIGATION (polish-1, 2026-09-08, the owner's ruling): a landing page is
  ONE page, so the header carries the brand and the Book control and nothing
  else — no anchor list, no mobile menu. The author hid the Book control at
  his mobile breakpoint in favour of a menu; the stylesheet's appended block
  shows it there instead, in his own header grid (brand | book).
--}}
@php
    use App\Landing\Copy;

    // The monogram in the ring. mb_* because a Cyrillic or Greek business
    // name has a first letter too, and mb_strtoupper because the ring is set
    // in the display face by the stylesheet rather than by text-transform.
    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <header class="site-header" data-block="header" data-variant="floating-calm">
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
