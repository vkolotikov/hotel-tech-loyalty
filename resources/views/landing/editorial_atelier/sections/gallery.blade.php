{{--
  The lookbook (data-block="gallery", data-variant="asymmetric-lookbook").

  The author's twelve-column cascade: four cards placed by hand at explicit
  spans, each with its own margin-top, its own aspect ratio and its own
  hand-tuned crop, so the grid steps down the page rather than sitting in
  rows. Repeatable, so nothing here is spelled with a literal section key —
  the id, the data hook and every read come off `$section->key`, or
  `gallery_2` would render as `gallery_1`'s twin.

  THE PICTURES are PageContent::galleryPhotos(), the one allowlisted read of
  this band's eight photo leaves: the same three guards the hero's single
  plate goes through, applied per leaf, with the failures simply absent from
  the list. There is no per-image @if here and no way for an unchecked value
  to reach a src.

  THE FOUR MODIFIERS CYCLE. `--portrait`, `--precision`, `--detail` and
  `--space` are the author's four placements and they are assigned BY
  POSITION, so a fifth photograph lands in the first card's columns on the
  next row and his cascade simply continues. One to three get a composition
  of their own in the stylesheet's appended tenant-state block, because below
  four his spans leave the grid visibly lopsided.

  THE CROPS ARE HIS (D4). Each modifier carries an `object-position` he tuned
  for the photograph he put there — `72% center` on the first, `center 38%`
  on the second. A tenant's replacement inherits a crop chosen for a picture
  they no longer have; that is the trade D4 records, and neutralising them
  would change the author's own page.

  CAPTIONS ARE THE AUTHOR'S TWO-PART FIGCAPTION and only one part of it is
  the tenant's. His reads `<span>01 / Layers</span> Soft structure`: the
  ordinal is DERIVED here (a stored number goes stale the moment a photograph
  is removed) and the words after it are `caption_N`. His per-tile word
  ("Layers", "Shape") has no leaf — see the phase 7/8 report, which names it
  rather than glossing it.

  EMPTY IS NOT A STATE THIS FILE HANDLES. A gallery with no readable pictures
  counts 0, has() is false, and the layout never includes this partial.
--}}
@php
    use App\Landing\Copy;

    $fields  = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $subtext = trim((string) ($fields['subtext'] ?? ''));

    $photos = $content->galleryPhotos($section->key);

    // The author's four placements, in his own order.
    $variants = ['portrait', 'precision', 'detail', 'space'];
@endphp
    <section class="gallery section" id="{{ $section->key }}" data-block="gallery" data-variant="asymmetric-lookbook"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
@if ($kicker !== '' || $heading !== '' || $subtext !== '')
      <div class="container gallery__heading">
@if ($kicker !== '')
        <p class="kicker">{{ $kicker }}</p>
@endif
@if ($heading !== '')
        <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@endif
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
      </div>
@endif

      <div class="container gallery__grid" data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
        <figure class="gallery-card gallery-card--{{ $variants[$loop->index % 4] }}">
          <img src="{{ $photo['url'] }}" width="1024" height="1536" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
          <figcaption><span aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span>{{ $photo['caption'] }}</figcaption>
        </figure>
@endforeach
      </div>
    </section>
