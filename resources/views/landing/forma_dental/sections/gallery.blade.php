{{--
  Your first visit (data-block="gallery", data-variant="appointment-steps").

  THE ONE BAND THAT IS NOT THE AUTHOR'S COMPOSITION, and the reason is
  written down rather than glossed (med-2, which is the dining kits' rule).
  His band is three numbered step cards on a ruled row under a split section
  heading — a clay ring with the ordinal, a name in the display face and a
  line of prose — and NO photograph. On this platform a `gallery` band IS
  its pictures: PageContent::count() counts photographs for this type, the
  image endpoints are the only writer of its eight slots, and a design that
  drew none would offer eight photo controls that could never appear.

  So the picture fills the step card he drew, inside his own hairline,
  under a veil in his own plum glass token, and his <h3> becomes the
  photograph's caption (`caption_N`) and his line its note
  (`caption_N_note`). His ordinal ring stays, as the tile's number. The
  appended stylesheet (`.visit li.visit__photo`) does the filling; his
  card's `min-height: 16rem` is untouched, so THE BAND IS EXACTLY THE HEIGHT
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
    $subtext = trim((string) ($fields['subtext'] ?? ''));

    $photos = $content->galleryPhotos($section->key);
@endphp
    <section class="visit section container" id="{{ $section->key }}" data-block="gallery" data-variant="appointment-steps"@if ($heading !== '') aria-labelledby="{{ $section->key }}-title"@endif>
@if ($kicker !== '' || $heading !== '' || $subtext !== '')
      <header class="section-heading">
        <div>
@if ($kicker !== '' && $heading !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
@if ($heading !== '')
          <h2 id="{{ $section->key }}-title">{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@elseif ($kicker !== '')
          <h2>{{ Copy::heading($kicker) }}</h2>
@endif
        </div>
@if ($subtext !== '')
        <p>{{ $subtext }}</p>
@endif
      </header>
@endif
      <ol data-count="{{ count($photos) }}">
@foreach ($photos as $photo)
        <li class="visit__photo">
          <span aria-hidden="true">{{ sprintf('%02d', $loop->iteration) }}</span>
          <img src="{{ $photo['url'] }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $photo['alt'] }}">
@if ($photo['caption'] !== '')
          <h3>{{ $photo['caption'] }}</h3>
@endif
@if ($photo['note'] !== '')
          <p>{{ $photo['note'] }}</p>
@endif
        </li>
@endforeach
      </ol>
    </section>
