{{--
  The header (data-block="header", data-variant="floating").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the
  wordmark is the business's name, the descriptor is the city it is in, and
  the links are the bands this page is actually going to render, labelled
  with the industry's own vocabulary. There is no `content.header.*` and
  there should not be — a nav a tenant can type into is a nav that can point
  at a band that is not there.

  $navAnchors, $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain.
  The desktop bar takes the first four and the mobile panel takes all five,
  which is exactly what the author's markup does (four links up top, those
  four plus FAQ in the panel).

  The mobile menu is a native <details>, the author's choice, and it works
  with no JavaScript at all. nocturne_ritual.js only adds the two courtesies
  a native <details> cannot do for itself — close on Escape, close when you
  tap outside — so a blocked script costs nothing here.
--}}
@php
    // The monogram in the brand mark. mb_* because a Cyrillic or Greek
    // business name has a first letter too, and mb_strtoupper because the
    // mark is set in caps by the stylesheet's own font, not by CSS
    // text-transform (which would leave a screen reader reading the raw
    // character while the page showed another).
    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';

    // The wordmark's own anchor. #top is the hero band; with the hero
    // switched off there is no #top on the page, and a brand mark linking to
    // nothing is the dead control this template refuses everywhere else.
    $topHref = $renders('hero') ? '#top' : '#main-content';
@endphp
  <header class="site-header" data-block="header" data-variant="floating">
    <div class="shell site-header__inner">
@if (filled($brandName))
      <a class="brand" href="{{ $topHref }}" aria-label="{{ $brandName }}">
{{-- THE LOGO, IF THE BUSINESS HAS ONE (template fidelity 4.6). It takes the
     monogram's own box, so the lockup does not move; the monogram is the
     fallback it always was for a tenant who has uploaded none.
     aria-hidden and alt="" on both: the wordmark beside them already names
     the business, and the anchor carries its own aria-label — a logo read
     out as well would announce the name twice. --}}
@if ($content->contact->logoUrl !== null)
        <span class="brand__mark" aria-hidden="true"><img src="{{ $content->contact->logoUrl }}" alt="" decoding="async"></span>
@elseif ($brandInitial !== '')
        <span class="brand__mark" aria-hidden="true">{{ $brandInitial }}</span>
@endif
        <span class="brand__wordmark">{{ $brandName }}</span>
@if ($brandDescriptor !== '')
        <span class="brand__descriptor">{{ $brandDescriptor }}</span>
@endif
      </a>
@endif

@if ($navAnchors->isNotEmpty())
      <nav class="desktop-nav" aria-label="Primary navigation">
@foreach ($navAnchors->take(4) as $anchor)
        <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
      </nav>
@endif

@if ($bookingHref !== null)
      <div class="header-actions">
        <a class="button button--light button--compact" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.nocturne_ritual.icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
      </div>
@endif

@if ($navAnchors->isNotEmpty() || $bookingHref !== null)
      <details class="mobile-menu">
        <summary aria-label="Open navigation">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </summary>
        <nav class="mobile-menu__panel" aria-label="Mobile navigation">
@foreach ($navAnchors as $anchor)
          <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
@if ($bookingHref !== null)
          <a class="button button--accent" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.nocturne_ritual.icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif
        </nav>
      </details>
@endif
    </div>
  </header>
