{{--
  The header (data-block="header", data-variant="editorial-sticky").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the
  wordmark is the business's name, the descriptor is its own word for what it
  is, and the links are the bands this page is actually going to render,
  labelled with the industry's own vocabulary. There is no `content.header.*`
  and there should not be — a nav a tenant can type into is a nav that can
  point at a band that is not there.

  $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain.
  The desktop bar takes the first five and the mobile panel takes all five
  with an ordinal beside each, which is exactly what the author's markup does
  (five links up top, the same five numbered 01–05 in the panel).

  THIS KIT HAS NO MONOGRAM (template fidelity 4.6). Kits 01 and 03 draw a
  ~2.5rem square with the business's initial in it and a tenant's logo takes
  that box; here `.brand` is a WORDMARK and a descriptor, so a logo replaces
  the wordmark and gets a wide box of its own (`.brand__logo`, in the
  stylesheet's appended tenant-state block). With no logo the business's name
  is set in the author's own Bodoni, which is the lockup he drew.

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

    // The wordmark's own anchor. #top is the hero band; with the hero
    // switched off there is no #top on the page, and a brand mark linking to
    // nothing is the dead control this template refuses everywhere else.
    $topHref = $renders('hero') ? '#top' : '#main-content';
@endphp
  <header class="site-header" data-block="header" data-variant="editorial-sticky">
    <div class="container site-header__inner">
@if (filled($brandName))
      <a class="brand" href="{{ $topHref }}" aria-label="{{ $brandName }}">
@if ($content->contact->logoUrl !== null)
        {{-- aria-hidden and alt="" together: the anchor already carries the
             business's name as its accessible name, and a logo announced as
             well would say it twice. --}}
        <img class="brand__logo" src="{{ $content->contact->logoUrl }}" alt="" decoding="async">
@else
        <span class="brand__name">{{ $brandName }}</span>
@endif
@if ($brandDescriptor !== '')
        <span class="brand__descriptor">{{ Copy::lines($brandDescriptor) }}</span>
@endif
      </a>
@endif


@if ($bookingHref !== null)
      <a class="button button--ink header-book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $chromeLabels['header'] }}</a>
@endif

    </div>
  </header>
