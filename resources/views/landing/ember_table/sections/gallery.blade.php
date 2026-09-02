{{--
  The experience (data-block="gallery", data-variant="service-moments").

  The author's aubergine band: a header whose gold eyebrow and display heading
  sit at opposite ends of one baseline, over a ruled row of three cards.

  THE ONE BAND ON THIS TEMPLATE THAT IS NOT THE AUTHOR'S COMPOSITION, named here
  rather than glossed. His three cards carry an ordinal, a name and a line of
  prose and NO photograph. On this platform a `gallery` band IS its pictures:
  PageContent::count() counts photographs for this type, the eight image slots
  have exactly one writer (the image endpoints), and a design that drew none
  would offer eight photo controls that could never act — the precise defect
  `photo_blocks` exists to prevent.

  So the picture FILLS the card he drew: his hairline, his `min-height: 18rem`,
  a veil in his own overlay token, and his `<h3>` as the photograph's caption.
  The band is exactly the height he drew it at every count, and the stylesheet's
  appended block carries that rule with the same reasoning. What is lost is his
  per-card LINE of prose, which has no leaf — the same shortfall kit 02-beauty's
  per-tile word has, and recorded the same way.

  THE ORDINAL IS DERIVED, and it is the author's own: he prints exactly `01`…
  `03` there. A stored number goes stale the moment a photograph is removed.

  THIS DESIGN DRAWS NO INTRO PARAGRAPH. His header is an eyebrow and a heading
  at opposite ends of a flex row, so `gallery.subtext` is not read here and
  `content_fields` does not offer it on this design.

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

    $photos = $content->galleryPhotos($section->key);
@endphp
    <section class="experience section" id="{{ $section->key }}" data-block="gallery" data-variant="service-moments"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
      <div class="container">
@if ($kicker !== '' || $heading !== '')
        <header>
@if ($kicker !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
@if ($heading !== '')
          <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@endif
        </header>
@endif
        <div class="experience-grid" data-count="{{ count($photos) }}">
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
