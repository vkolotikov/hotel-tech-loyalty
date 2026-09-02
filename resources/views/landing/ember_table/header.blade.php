{{--
  The header (data-block="header", data-variant="night-bar").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the mark is
  the business's initials, the wordmark is its name, the descriptor is its own
  word for what it is, and the links are the bands this page is actually going
  to render. There is no `content.header.*` and there should not be — a nav a
  tenant can type into is a nav that can point at a band that is not there.

  THE MARK IS TWO LETTERS ON THIS DESIGN. The author's disc reads `E/T` — the
  initials of both words of his name, joined by a slash and set in the mono
  face — where the other four kit templates draw a single display-face letter.
  It is derived from the same $brandName chain and degrades to ONE letter for a
  one-word business, which is exactly what those four already draw.

  THE BAR IS ABSOLUTELY POSITIONED OVER THE HERO PHOTOGRAPH and set in
  warm-white; below 48rem his own stylesheet drops it onto the night. Both are
  his rules and neither is touched here.

  $navAnchors, $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain. The
  desktop bar takes the first four and the mobile panel takes all five, which is
  exactly what the author's markup does.

  The mobile menu is a native <details>, the author's choice, and it works with
  no JavaScript at all. landing/kit.js only adds the two courtesies a native
  <details> cannot do for itself — close on Escape, close when you tap outside.
--}}
@php
    use App\Landing\Copy;

    // mb_* throughout, because a Cyrillic or Greek business name has first
    // letters too, and mb_strtoupper because the mark is set in caps by the
    // stylesheet's own mono font rather than by CSS text-transform (which would
    // leave a screen reader reading the raw characters while the page showed
    // another).
    $brandInitial = collect(preg_split('/\s+/u', trim((string) $brandName), -1, PREG_SPLIT_NO_EMPTY) ?: [])
        ->take(2)
        ->map(fn ($word) => mb_strtoupper(mb_substr($word, 0, 1)))
        ->implode('/');
@endphp
  <header class="site-header" data-block="header" data-variant="night-bar">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="#top" aria-label="{{ $brandName }}">
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
