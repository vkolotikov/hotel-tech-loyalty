{{--
  Inside the house (data-block="gallery", data-variant="mosaic").

  The author's dark mosaic: a wide tile and a tall tile flanking two squares,
  each with a glass caption pill, turning into a horizontal snap-scroller
  below 37rem. Repeatable, so nothing here is spelled with a literal section
  key — the id, the data hook and every read come off `$section->key`, or
  `gallery_2` would render as `gallery_1`'s twin.

  THE PICTURES are PageContent::galleryImages(), the one allowlisted read of
  this band's eight photo leaves: the same three guards the hero's single
  plate goes through, applied per leaf, with the failures simply absent from
  the list. There is no per-image @if here and no way for an unchecked value
  to reach a src.

  EMPTY IS NOT A STATE THIS FILE HANDLES, deliberately. A gallery with no
  readable pictures counts 0, has() is false, and the layout never includes
  this partial — no empty mosaic, no headed band over blank space, no nav
  anchor pointing at nothing.

  ONE TO THREE PICTURES is a state it does handle, and had to: the author's
  grid is authored for four, and the wide/tall row spans have nothing to span
  against below that. `data-count` carries the real number to the stylesheet's
  appended tenant-state rules, which give one, two and three their own
  compositions rather than stretching a tile across a gap. The wide/tall
  modifiers still land on the first two tiles exactly as the author placed
  them.

  Captions: the author writes one per photograph and a tenant writes none —
  there is no per-photo caption field and an invented one ("Ritual details")
  would be words the business never approved. So the pill is not rendered,
  the alt is empty (a decorative-by-declaration image is skipped by a screen
  reader rather than read out as a filename), and what is left is the
  author's mosaic of the tenant's own photographs.
--}}
@php
    $fields  = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));

    $images  = $content->galleryImages($section->key);
@endphp
    <section class="section section--dark gallery" id="{{ $section->key }}" data-block="gallery" data-variant="mosaic"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
      <div class="shell">
@if ($kicker !== '' || $heading !== '')
        <header class="section-heading section-heading--split">
          <div>
@if ($kicker !== '')
            <p class="eyebrow">{{ $kicker }}</p>
@endif
@if ($heading !== '')
            <h2 id="{{ $section->key }}-title">{{ $heading }}</h2>
@endif
          </div>
        </header>
@endif
        <div class="gallery__grid" data-count="{{ count($images) }}">
@foreach ($images as $image)
          <figure @class([
            'gallery__item',
            'gallery__item--wide' => $loop->iteration === 1 && $loop->count > 1,
            'gallery__item--tall' => $loop->iteration === 2 && $loop->count > 2,
          ])>
            <img src="{{ $image }}" width="1024" height="1536" loading="lazy" decoding="async" alt="">
          </figure>
@endforeach
        </div>
      </div>
    </section>
