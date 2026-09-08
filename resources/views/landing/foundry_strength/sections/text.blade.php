{{--
  A tenant-added words band (data-block="text", data-variant="club-words").

  THE BAND THE AUTHOR DID NOT DRAW, assembled from his own parts: the split
  `.section-heading` his training ledger uses — eyebrow and display heading
  on the left, the opening paragraph on the right — then the prose in his
  body face, and a photograph in his radius and shadow. The rules this band
  adds are in the stylesheet's appended block with their reason beside them.

  REPEATABLE, so nothing below is spelled with a literal section key. THE
  PHOTOGRAPH is PageContent::imageUrl($section->key), with the same three
  guards every other picture on this page goes through. count() gates the
  band on the BODY.
--}}
@php
    use App\Landing\Copy;

    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $body    = trim((string) ($fields['body'] ?? ''));

    $plate = $content->imageUrl($section->key);

    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    $intro = array_shift($paragraphs);

    $alt     = trim((string) ($fields['alt'] ?? ''));
    $caption = trim((string) ($fields['caption'] ?? ''));
@endphp
    <section class="section container" id="{{ $section->key }}" data-block="text" data-variant="club-words">
      <header class="section-heading">
        <div>
@if ($heading !== '')
@if ($kicker !== '')
          <p class="eyebrow">{{ $kicker }}</p>
@endif
          <h2>{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@elseif ($kicker !== '')
          <h2 class="eyebrow">{{ $kicker }}</h2>
@endif
        </div>
@if ($intro !== null)
        <p>{{ trim($intro) }}</p>
@endif
      </header>
@if ($paragraphs !== [])
      <div class="text-band__body">
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
      </div>
@endif
@if ($plate !== null)
      <figure class="text-band__media">
        <img src="{{ $plate }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $alt }}">
@if ($caption !== '')
        <figcaption>{{ $caption }}</figcaption>
@endif
      </figure>
@endif
    </section>
