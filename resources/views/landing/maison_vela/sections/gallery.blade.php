{{--
  The rooms (data-block="gallery", data-variant="private-dining").

  The author's olive band: a split header — eyebrow and display heading on one
  side, an intro paragraph settled to the baseline on the other — over a ruled
  row of cards.

  THE ONE BAND ON THIS TEMPLATE THAT IS NOT THE AUTHOR'S COMPOSITION, named
  here rather than glossed. His three cards carry a small label, a name and a
  line of prose and NO photograph — the only text-only `gallery` block in the
  six kits. On this platform a `gallery` band IS its pictures:
  PageContent::count() counts photographs for this type, the eight image slots
  have exactly one writer (the image endpoints), and a design that drew none
  would offer eight photo controls that could never act — the precise defect
  `photo_blocks` exists to prevent.

  So the picture FILLS the card he drew: his border, his `min-height: 13rem`,
  his two overlay tokens as the veil, and his `<h3>` as the photograph's
  caption. The band is exactly the height he drew it at every count, and the
  stylesheet's appended block carries that rule with the same reasoning. What
  is lost is his per-card LINE of prose, which has no leaf — the same
  shortfall kit 02's per-tile word has, and recorded the same way.

  THE ORDINAL IS DERIVED. A stored number goes stale the moment a photograph
  is removed. (The author writes a phrase there — "Walk-ins welcome" — which
  has no leaf either; kits 02 and 03 write exactly this ordinal.)

  THE PICTURES are PageContent::galleryPhotos(), the one allowlisted read of
  this band's eight photo leaves: the same three guards the hero's plate goes
  through, applied per leaf, with the failures simply absent from the list.
  There is no per-image @if here and no way for an unchecked value to reach a
  src.

  Repeatable, so nothing here is spelled with a literal section key — the id,
  the data hook and every read come off `$section->key`, or `gallery_2` would
  render as `gallery_1`'s twin.

  EMPTY IS NOT A STATE THIS FILE HANDLES. A gallery with no readable pictures
  counts 0, has() is false, and the layout never includes this partial.
--}}
@php
    use App\Landing\Copy;

    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $subtext = trim((string) ($fields['subtext'] ?? ''));

    $photos = $content->galleryPhotos($section->key);
@endphp
    <section class="salon section" id="{{ $section->key }}" data-block="gallery" data-variant="private-dining"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
      <div class="container salon__grid">
        <div>
@if ($kicker !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
@if ($heading !== '')
          <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@endif
        </div>
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
        <div class="salon__cards" data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
          <article>
            <span aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span>
            <img src="{{ $photo['url'] }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
@if ($photo['caption'] !== '')
            <h3>{{ $photo['caption'] }}</h3>
@endif
          </article>
@endforeach
        </div>
      </div>
    </section>
