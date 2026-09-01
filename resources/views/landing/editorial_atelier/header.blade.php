{{--
  The header (data-block="header", data-variant="editorial-sticky").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the
  wordmark is the business's name, the descriptor is its own word for what it
  is, and the links are the bands this page is actually going to render,
  labelled with the industry's own vocabulary. There is no `content.header.*`
  and there should not be — a nav a tenant can type into is a nav that can
  point at a band that is not there.

  $navAnchors, $brandName, $brandDescriptor and the booking trio are all
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

@if ($navAnchors->isNotEmpty())
      <nav class="desktop-nav" aria-label="Primary navigation">
@foreach ($navAnchors as $anchor)
        <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
      </nav>
@endif

@if ($bookingHref !== null)
      <a class="button button--ink header-book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

@if ($navAnchors->isNotEmpty() || $bookingHref !== null)
      <details class="mobile-menu">
        <summary>
          <span>{{ __('Menu') }}</span>
          <span class="mobile-menu__mark" aria-hidden="true">+</span>
        </summary>
        <nav class="mobile-menu__panel" aria-label="Mobile navigation">
@foreach ($navAnchors as $anchor)
          {{-- The author's own ordinal beside each link, computed from the
               loop and never stored: a stored number goes stale the moment a
               band is switched off. aria-hidden because "Services 01" is not
               what the link says. --}}
          <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }} <span aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span></a>
@endforeach
@if ($bookingHref !== null)
          <a class="button button--oxblood" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
        </nav>
      </details>
@endif
    </div>
  </header>
