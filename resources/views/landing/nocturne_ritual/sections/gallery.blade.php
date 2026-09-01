{{--
  Inside the house (data-block="gallery", data-variant="mosaic").

  The author's dark mosaic: a wide tile and a tall tile flanking two squares,
  each with a glass caption pill, turning into a horizontal snap-scroller
  below 37rem. Repeatable, so nothing here is spelled with a literal section
  key — the id, the data hook and every read come off `$section->key`, or
  `gallery_2` would render as `gallery_1`'s twin.

  THE PICTURES are PageContent::galleryPhotos(), the one allowlisted read of
  this band's eight photo leaves: the same three guards the hero's single
  plate goes through, applied per leaf, with the failures simply absent from
  the list. There is no per-image @if here and no way for an unchecked value
  to reach a src. Each tile arrives with its own words as well as its URL —
  the design's description of its own photograph while that photograph is
  what is showing, and the tenant's caption whenever they have written one.

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

  CAPTIONS are the author's glass pills, and since template fidelity 4.3
  there is a leaf per tile to fill them (`caption_1`…`caption_8`, ordinary
  content leaves beside the picture leaves the image endpoints own). A tile
  with no caption renders no pill — never an invented one, because "Ritual
  details" and "Amber Hour" are the kit author's fictional rooms and
  treatments, and publishing them on a real studio's page would be words the
  business never approved.
--}}
@php
    $fields  = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));

    $photos  = $content->galleryPhotos($section->key);
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
        <div class="gallery__grid" data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
          <figure @class([
            'gallery__item',
            'gallery__item--wide' => $loop->iteration === 1 && $loop->count > 1,
            'gallery__item--tall' => $loop->iteration === 2 && $loop->count > 2,
          ])>
            <img src="{{ $photo['url'] }}" width="1024" height="1536" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
@if ($photo['caption'] !== '')
            <figcaption>{{ $photo['caption'] }}</figcaption>
@endif
          </figure>
@endforeach
        </div>
      </div>
    </section>
