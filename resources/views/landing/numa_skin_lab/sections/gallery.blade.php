{{--
  The method (data-block="gallery", data-variant="method-grid").

  THE ONE BAND THAT IS NOT THE AUTHOR'S COMPOSITION, and the reason is
  written down rather than glossed (med-2, which is the dining kits' rule).
  His band is three ruled cards on a blue gradient under a two-track header
  (eyebrow | heading) — a mono tag ("SCAN / 01"), a name in the display face
  and a line of prose — and NO photograph. On this platform a `gallery` band
  IS its pictures: PageContent::count() counts photographs for this type,
  the image endpoints are the only writer of its eight slots, and a design
  that drew none would offer eight photo controls that could never appear.

  So the picture fills the card he drew, inside his own hairline, under a
  veil in his own shade tokens, and his <h3> becomes the photograph's
  caption (`caption_N`), his line its note (`caption_N_note`) and the word
  before his slash the tenant's own (`caption_N_label`, the leaf kit
  02-beauty's "01 / Layers" reads) — the ordinal is derived. The appended
  stylesheet (`.method-grid article.method__photo`) does the filling; his
  card's `min-height: 15rem` is untouched, so THE BAND IS EXACTLY THE HEIGHT
  HE DREW IT at every count, and `data-count` closes the row up for one or
  two photographs.

  PageContent::galleryPhotos() is the one reader: it walks the eight slots
  in order, drops the empty ones and resolves each URL through the same
  three guards the hero's picture passes.
--}}
@php
    use App\Landing\Copy;

    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));

    $photos = $content->galleryPhotos($section->key);
@endphp
    <section class="method section" id="{{ $section->key }}" data-block="gallery" data-variant="method-grid"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
      <div class="container">
@if ($kicker !== '' || $heading !== '')
        <header>
@if ($kicker !== '' && $heading !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@else
          <span aria-hidden="true"></span>
@endif
@if ($heading !== '')
          <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@else
          <h2>{{ Copy::heading($kicker) }}</h2>
@endif
        </header>
@endif
        <div class="method-grid" data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
          <article class="method__photo">
            <span aria-hidden="true">{{ $photo['label'] !== '' ? $photo['label'] . ' / ' : '' }}{{ sprintf('%02d', $loop->iteration) }}</span>
            <img src="{{ $photo['url'] }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
@if ($photo['caption'] !== '')
            <h3>{{ $photo['caption'] }}</h3>
@endif
@if ($photo['note'] !== '')
            <p>{{ $photo['note'] }}</p>
@endif
          </article>
@endforeach
        </div>
      </div>
    </section>
