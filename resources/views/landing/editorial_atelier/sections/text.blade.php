{{--
  A tenant-added words band (data-block="text", data-variant="editorial-note").

  THE BAND THE AUTHOR DID NOT DRAW, and the one a tenant needs when their
  business does not fit the eleven he composed. Template fidelity 3.2's rule
  is that the picker filters on what a template actually renders AND that the
  partial ships, because the owner asked for all sections — a control that
  saves words the page then drops is the failure this project refuses.

  ASSEMBLED FROM THE AUTHOR'S OWN PARTS, deliberately: the split section
  header his services and lookbook bands already use, and the story band's
  full-bleed frame with its corner caption. Drawing a NEW composition would
  mean new CSS in a stylesheet whose whole contract is that it is the
  author's file; the one rule this band adds is a reading measure for prose,
  and it is in the appended tenant-state block with its reason beside it.

  WHAT IT DOES NOT COPY from the story band: `.story__heading`, whose last
  paragraph is coloured `--color-paper-deep` because that band is always on
  ink. This one sits on the page's own cream, so it uses the split header
  instead — the same two-column shape, in the right colours for the surface.

  REPEATABLE, so nothing below is spelled with a literal section key: a page
  may carry up to SectionType::MAX_INSTANCES_PER_TYPE of these and every one
  renders through this file. The id, the copy reads and the photograph all
  come off `$section->key`, or `text_2` would render as `text_1`'s twin.

  count() gates the band on the BODY, so an added band the tenant has not
  written into yet is not in the document at all.
--}}
@php
    use App\Landing\Copy;

    // $copy is $page->content[$section->key], a schemaless `array` cast: a
    // row hand-edited (or written before this column had a shape at all) can
    // legitimately hold a string here. (string) casts on each leaf, never on
    // $copy — the same guard every other partial under this directory makes.
    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $body    = trim((string) ($fields['body'] ?? ''));

    $plate = $content->imageUrl($section->key);

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    $intro = array_shift($paragraphs);

    // The photograph's own words, if the tenant wrote them. Alt describes the
    // picture for somebody who cannot see it; the caption is printed in the
    // author's corner pill. Neither is invented.
    $alt     = trim((string) ($fields['alt'] ?? ''));
    $caption = trim((string) ($fields['caption'] ?? ''));
@endphp
    <section class="section story" id="{{ $section->key }}" data-block="text" data-variant="editorial-note">
      <div class="container section-heading section-heading--split">
        <div>
{{-- The eyebrow changes ELEMENT rather than style when there is no heading:
     with no h2 this band would otherwise have no heading at all, which puts a
     nameless section in the document outline. With neither, the band is prose
     under the tenant's own paragraph rhythm and needs no heading invented for
     it — there is no industry word to fall back on here. --}}
@if ($heading !== '')
@if ($kicker !== '')
          <p class="kicker">{{ $kicker }}</p>
@endif
          <h2>{{ Copy::heading($heading, $fields['heading_accent'] ?? null) }}</h2>
@elseif ($kicker !== '')
          <h2 class="kicker">{{ $kicker }}</h2>
@endif
        </div>
@if ($intro !== null)
        <p>{{ trim($intro) }}</p>
@endif
      </div>

@if ($paragraphs !== [])
      <div class="container text-band__body">
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
      </div>
@endif

@if ($plate !== null)
      <div class="container story__media">
        <img src="{{ $plate }}" width="1537" height="1023" loading="lazy" decoding="async" alt="{{ $alt }}">
@if ($caption !== '')
        <p class="story__caption">{{ $caption }}</p>
@endif
      </div>
@endif
    </section>
