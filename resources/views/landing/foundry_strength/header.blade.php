{{--
  The header (data-block="header" — the author names no variant on it).

  The author's floating glass bar, 2.4rem below the top edge (the height of
  his offer bar), on his hairline and his small radius: the brand lockup, a
  centred uppercase nav and the Book control; below 74rem the nav and the
  control fold into a native <details> menu. His bar is `position:
  absolute` over the hero photograph, which is why the hero pads for it.

  GENERATED FROM THE PAGE'S OWN NAV DATA, never from tenant copy: the mark
  is the business's initial, the wordmark is its name, the descriptor is its
  own word for what it is, and the links are the bands this page is actually
  going to render. There is no `content.header.*` and there should not be —
  a nav a tenant can type into is a nav that can point at a band that is not
  there.

  THE MARK IS THE TENANT'S INITIAL, NOT THE AUTHOR'S GLYPH (gym-22). His
  lockup opens on a bronze "F" drawn as an inline SVG — Foundry's own mark
  and nobody else's — so it is not transcribed. The same 2.7rem box holds the
  tenant's logo where they have one, else their initial set in the display
  face on a bronze rule (`.brand__mark`, in the stylesheet's appended block),
  and the `<span><strong>…</strong><small>…</small></span>` beside it is his
  markup untouched. The wordmark's conjunction, if the business has one, is
  set in the accent by App\Landing\Copy::wordmark() — derived from the name,
  never a leaf.

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

    $brandInitial = filled($brandName) ? mb_strtoupper(mb_substr(trim((string) $brandName), 0, 1)) : '';
@endphp
  <header class="site-header" data-block="header">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="#top" aria-label="{{ $brandName }}">
@if ($content->contact->logoUrl !== null)
        <span class="brand__mark" aria-hidden="true"><img src="{{ $content->contact->logoUrl }}" alt="" decoding="async"></span>
@elseif ($brandInitial !== '')
        <span class="brand__mark" aria-hidden="true">{{ $brandInitial }}</span>
@endif
        <span><strong>{{ Copy::wordmark($brandName) }}</strong>@if ($brandDescriptor !== '')<small>{{ $brandDescriptor }}</small>@endif</span>
      </a>
@endif
@if ($bookingHref !== null)
      <a class="header__book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>@include('landing.shared.kit-icon', ['name' => 'calendar']){{ $chromeLabels['header'] }}</a>
@endif
    </div>
  </header>
