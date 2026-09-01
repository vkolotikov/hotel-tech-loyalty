{{--
  A tenant-added words band (data-block="text", data-variant="offset-image").

  THE BAND THE AUTHOR DID NOT DRAW, and the one a tenant needs when their
  business does not fit the other fourteen. Until this file existed the
  editor offered "Add a Text block" on this template, auto-focused an input,
  told the tenant "words you write here" — and then the layout filtered the
  band out of the page, with no error and no explanation. Template fidelity
  3.2 closes that from both ends: the picker now filters on what a template
  actually renders, AND this partial ships, because the owner asked for all
  sections.

  IT IS THE STORY BAND'S COMPOSITION, DELIBERATELY, down to the class names.
  Not laziness and not a shortcut: `story` is the author's own "prose the
  tenant wrote, with an optional photograph beside it" band — the offset ink
  rule, the 3:4 frame, the caption, the `--solo` collapse when there is no
  picture — and it is exactly the shape a text band is. Drawing a NEW
  composition here would mean new CSS in a stylesheet whose whole contract is
  that it is the author's file (see nocturne_ritual.css's own header, and the
  test that pins its :root by value against the kit source). Reusing what the
  author drew adds not one byte to it.

  WHAT IT DOES NOT COPY from the story band: the numbered facts ledger. That
  publishes the business's opening hours in the author's 01/02/03 voice, and
  it belongs to the band that is ABOUT the business — repeating the week on
  every one of six added bands would read as a page nobody looked at, which
  is the same reason the Ruled Page's own text band declines about's
  two-column body.

  REPEATABLE, so nothing below is spelled with a literal section key: a page
  may carry up to SectionType::MAX_INSTANCES_PER_TYPE of these and every one
  renders through this file. The id, the copy reads and the photograph all
  come off `$section->key`, or `text_2` would render as `text_1`'s twin.

  THE PHOTOGRAPH is PageContent::imageUrl($section->key) — the same one
  allowlisted read, with the same three guards, the hero's plate and the
  story band's go through. Absent, stale or hostile resolves to null and the
  media column is dropped entirely; a frame with no photograph in it is the
  one thing this band must never render.

  count() gates the band on the BODY (its 'text' arm), so an added band the
  tenant has not written into yet is not in the document at all — no heading
  over blank space, no nav anchor pointing at nothing.

  Every value reaches the page through the escaping braces, like everything
  else beneath this directory; the no-raw-echo tests scan this file too.
--}}
@php
    // $copy is $page->content[$section->key], a schemaless `array` cast: a
    // row hand-edited (or written before this column had a shape at all) can
    // legitimately hold a string here. (string) casts on each leaf, never on
    // $copy — the same guard every other partial under this directory makes.
    $fields = is_array($copy) ? $copy : [];

    $kicker  = trim((string) ($fields['kicker'] ?? ''));
    $heading = trim((string) ($fields['heading'] ?? ''));
    $body    = trim((string) ($fields['body'] ?? ''));

    $plate = $content->imageUrl($section->key);

    // Paragraph breaks the tenant typed survive as paragraphs, exactly as
    // the story band does it. \R is any line ending, so a page edited on
    // Windows behaves like one edited anywhere else.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // The photograph's own words, if the tenant wrote them (template
    // fidelity 4.3). Alt describes the picture for somebody who cannot see
    // it; the caption is printed under the frame in the author's small-caps
    // voice. Neither is invented — an empty alt on a decorative-by-
    // declaration plate is the honest answer, and no caption means no
    // caption.
    $alt     = trim((string) ($fields['alt'] ?? ''));
    $caption = trim((string) ($fields['caption'] ?? ''));
@endphp
    <section class="section section--paper story" id="{{ $section->key }}" data-block="text" data-variant="offset-image">
      <div @class(['shell', 'story__grid', 'story__grid--solo' => $plate === null])>
@if ($plate !== null)
        <div class="story__media-wrap">
          <figure class="story__media">
            <img src="{{ $plate }}" width="1024" height="1536" loading="lazy" decoding="async" alt="{{ $alt }}">
          </figure>
@if ($caption !== '')
          <p class="story__caption">{{ $caption }}</p>
@endif
        </div>
@endif
        <div class="story__copy">
{{-- The eyebrow changes ELEMENT rather than style when there is no heading,
     the same ruling the story band makes: with no h2 this band would
     otherwise have no heading at all, which puts a nameless section in the
     document outline. With neither, the band is prose under the tenant's own
     paragraph rhythm and needs no heading invented for it — there is no
     industry word to fall back on here, and IndustryProfile::kicker() returns
     '' for a band it never authored. --}}
@if ($heading !== '')
@if ($kicker !== '')
          <p class="eyebrow eyebrow--ink">{{ $kicker }}</p>
@endif
          <h2>{{ $heading }}</h2>
@elseif ($kicker !== '')
          <h2 class="eyebrow eyebrow--ink">{{ $kicker }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
@if ($loop->first)
          <p class="story__lead">{{ trim($paragraph) }}</p>
@else
          <p>{{ trim($paragraph) }}</p>
@endif
@endforeach
        </div>
      </div>
    </section>
