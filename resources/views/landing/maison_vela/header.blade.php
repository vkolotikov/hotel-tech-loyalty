{{--
  The header (data-block="header", data-variant="heritage-overlay").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the mark is
  the business's initial, the wordmark is its name, the descriptor is its own
  word for what it is, and the links are the bands this page is actually going
  to render. There is no `content.header.*` and there should not be — a nav a
  tenant can type into is a nav that can point at a band that is not there.

  THE AUTHOR'S BAR IS ABSOLUTELY POSITIONED OVER THE HERO PHOTOGRAPH and set
  in white; below 42rem his own stylesheet drops it onto the ink. Both are his
  rules and neither is touched here.

  $navAnchors, $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain.
  The desktop bar takes the first four and the mobile panel takes all five,
  which is exactly what the author's markup does.

  The mobile menu is a native <details>, the author's choice, and it works
  with no JavaScript at all. landing/kit.js only adds the two courtesies a
  native <details> cannot do for itself — close on Escape, close when you tap
  outside.
--}}
@php
    use App\Landing\Copy;

    // The monogram in the brand mark. mb_* because a Cyrillic or Greek
    // business name has a first letter too, and mb_strtoupper because the mark
    // is set in caps by the stylesheet's own display font rather than by CSS
    // text-transform (which would leave a screen reader reading the raw
    // character while the page showed another).
    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';

    // The wordmark's own anchor. #top is the <body> on this kit — the author
    // puts the id there rather than on the hero — so it is always a real
    // destination and needs no fallback.
    $topHref = '#top';
@endphp
  <header class="site-header" data-block="header" data-variant="heritage-overlay">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="{{ $topHref }}" aria-label="{{ $brandName }}">
{{-- THE LOGO, IF THE BUSINESS HAS ONE (template fidelity 4.6). It takes the
     monogram's own disc, so the lockup does not move; the monogram is the
     fallback it always was. aria-hidden and alt="" on both: the wordmark
     beside them already names the business, and the anchor carries its own
     aria-label — a logo read out as well would announce the name twice. --}}
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

@if ($navAnchors->isNotEmpty())
      <nav class="desktop-nav" aria-label="{{ __('Primary navigation') }}">
@foreach ($navAnchors->take(4) as $anchor)
        <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
      </nav>
@endif

@if ($bookingHref !== null)
      <a class="header__book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $bookingLabel }}</a>
@endif

@if ($navAnchors->isNotEmpty() || $bookingHref !== null)
      <details class="mobile-nav">
        <summary>{{ __('Menu') }} <span aria-hidden="true">+</span></summary>
        <nav aria-label="{{ __('Mobile navigation') }}">
@foreach ($navAnchors as $anchor)
          <a href="#{{ $anchor['key'] }}">{{ $anchor['label'] }}</a>
@endforeach
@if ($bookingHref !== null)
          <a href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $bookingLabel }}</a>
@endif
        </nav>
      </details>
@endif
    </div>
  </header>
