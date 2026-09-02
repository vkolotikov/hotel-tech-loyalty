{{--
  The header (data-block="header", data-variant="garden-sticky").

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the mark is
  the business's initial, the wordmark is its name, the descriptor is its own
  word for what it is, and the links are the bands this page is actually going
  to render. There is no `content.header.*` and there should not be — a nav a
  tenant can type into is a nav that can point at a band that is not there.

  THE WORDMARK'S LAST WORD IS THIS DESIGN'S SECOND TYPOGRAPHIC GESTURE. The
  author writes `Luma <em>Garden</em>` here and again in his footer, with
  `.brand strong em { color: var(--color-clay) }` — the tail of the lockup set
  in his terracotta accent. It is NOT a leaf and could not be one: the wordmark
  is the `$brandName` chain, which is chrome. App\Landing\Copy::wordmark()
  draws it, out of escaped fragments, and the TAIL is asked for by this design
  alone — kit 01 and kit 03 set no emphasis in their lockups and pass nothing.
  A one-word business name gets no emphasis at all, because a whole name in
  italics is a slanted name rather than a two-tone lockup.

  $navAnchors, $brandName, $brandDescriptor and the booking trio are all
  resolved once in layout.blade.php; see the comments there for each chain.
  The desktop bar takes the first four and the mobile panel takes all five,
  which is exactly what the author's markup does.

  The mobile menu is a native <details>, the author's choice, and it works with
  no JavaScript at all. landing/kit.js only adds the two courtesies a native
  <details> cannot do for itself — close on Escape, close when you tap outside.
--}}
@php
    use App\Landing\Copy;

    // The monogram in the brand mark. mb_* because a Cyrillic or Greek
    // business name has a first letter too, and mb_strtoupper because the mark
    // is set in caps by the stylesheet's own display font rather than by CSS
    // text-transform (which would leave a screen reader reading the raw
    // character while the page showed another).
    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <header class="site-header" data-block="header" data-variant="garden-sticky">
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
        <strong>{{ Copy::wordmark($brandName, true) }}</strong>
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
