{{--
  A words band (data-block="text", data-variant="lab-words").

  THE ONE BAND THE AUTHOR DID NOT DRAW. `text` is the repeatable band a
  tenant needs when their business does not fit the eleven he composed, and
  template fidelity 3.2 says every design ships it rather than offering a
  picker entry that renders nothing. It is assembled from HIS OWN PARTS — the
  three-track `.section-heading` his protocols band uses (eyebrow | heading
  | the first paragraph as the lead) — with the remaining paragraphs in a
  measure under it and, where the tenant added one, a photograph in his
  card radius. The three rules that place those are the only additions, in
  the appended block.

  $copy is $page->content[$section->key], a schemaless `array` cast: a row
  hand-edited (or written before this column had a shape at all) can
  legitimately hold a string here. (string) casts on each leaf, never on
  $copy — the same guard every other partial under this directory makes.
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
    <section class="section container" id="{{ $section->key }}" data-block="text" data-variant="lab-words">
      <header class="section-heading">
@if ($heading !== '' && $kicker !== '')
        <p class="eyebrow">{{ $kicker }}</p>
@else
        <span aria-hidden="true"></span>
@endif
@if ($heading !== '')
        <h2>{{ Copy::heading((string) ($fields['heading'] ?? ''), $fields['heading_accent'] ?? null) }}</h2>
@elseif ($kicker !== '')
        <h2>{{ Copy::heading($kicker) }}</h2>
@else
        <span aria-hidden="true"></span>
@endif
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
