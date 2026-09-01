{{--
  Inside the studio (data-block="gallery", data-variant="organic-mosaic").

  The author's mosaic: a tall arch on the left spanning both rows, and two
  organic crops stacked beside it, each with a pill caption in its corner and
  each with a different organic radius. Repeatable, so nothing here is spelled
  with a literal section key — the id, the data hook and every read come off
  `$section->key`, or `gallery_2` would render as `gallery_1`'s twin.

  THE PICTURES are PageContent::galleryPhotos(), the one allowlisted read of
  this band's eight photo leaves: the same three guards the hero's single
  plate goes through, applied per leaf, with the failures simply absent from
  the list. There is no per-image @if here and no way for an unchecked value
  to reach a src.

  THE THREE SHAPES CYCLE (template fidelity 8.6). `--wide`, `--tall` and
  `--detail` are the author's three placements and they are assigned BY
  POSITION, so a fourth photograph starts the pattern again one row down —
  which is why the stylesheet's appended block sizes the flow rows and
  releases the arch from row 1 for counts of four and up. One and two get a
  composition of their own, because his two-row grid has nothing to span
  against below three.

  CAPTIONS are the author's pills, one leaf per tile (`caption_1`…
  `caption_8`, ordinary content leaves beside the picture leaves the image
  endpoints own). A tile with no caption renders no pill — never an invented
  one, because "The treatment room" and "Botanical textures" are the kit
  author's fictional rooms and publishing them on a real studio's page would
  be words the business never approved.

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

    // The author's three placements, in his own order.
    $shapes = ['wide', 'tall', 'detail'];
@endphp
    <section class="section gallery" id="{{ $section->key }}" data-block="gallery" data-variant="organic-mosaic"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
      <div class="container">
@if ($kicker !== '' || $heading !== '' || $subtext !== '')
        <header class="section-heading section-heading--split gallery__heading">
          <div>
@if ($kicker !== '')
            <p class="eyebrow"><span aria-hidden="true"></span> {{ $kicker }}</p>
@endif
@if ($heading !== '')
            <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@endif
          </div>
@if ($subtext !== '')
          <p>{{ $subtext }}</p>
@endif
        </header>
@endif

        <div class="gallery__grid" data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
          <figure class="gallery__item gallery__item--{{ $shapes[$loop->index % 3] }}">
            <img src="{{ $photo['url'] }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
@if ($photo['caption'] !== '')
            <figcaption>{{ $photo['caption'] }}</figcaption>
@endif
          </figure>
@endforeach
        </div>
      </div>
    </section>
