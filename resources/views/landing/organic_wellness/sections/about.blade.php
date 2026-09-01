{{--
  Our approach (data-block="story", data-variant="image-philosophy").

  The author's moss band: a photograph in an organic frame with a caption
  under it on one side, and on the other a light eyebrow, a two-tone display
  heading, a lead, prose, and a bordered aside of bulleted lines.

  The section KEY is `about` (that is what the catalogue, the editor and every
  existing page call this band) and the BLOCK is `story` (that is what the
  kits' shared contract calls it). Both are true and both are written down:
  `id="about"` is what the nav anchors point at, `data-block="story"` is the
  author's hook.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the whole media column goes, the grid collapses to
  one (`.story__grid--solo`) and the copy keeps a reading measure. A frame
  with no photograph in it is the one thing this band must never render.

  THE ASIDE IS ITS OWN FAMILY (template fidelity 5.2). `about.note_label` is
  its heading ("Our ingredient philosophy") and `note_1..3` are its lines.
  They are deliberately NOT three more `fact_N`: kit 01's numbered ledger is
  what to do before you arrive and this is what the studio stands behind, and
  a design that draws one draws it in a different shape from the other.

  THIS AUTHOR DRAWS NO LEDGER. `about.fact_1..3` is kit 01's numbered list and
  is not read here, so `content_fields` does not offer it on this design.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph
  with no prose is a fragment, not a section.
--}}
@php
    use App\Landing\Copy;

    $storyImage = $content->imageUrl('about');

    // The tenant's own caption, else the address this band has always printed
    // under the frame. filled() rather than ??, because an empty stored
    // caption must not shadow the fallback.
    $storyCaption = $content->imageCaption('about');

    if ($storyCaption === '') {
        $storyCaption = trim((string) ($content->contact->address ?? ''));
    }

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else. Every fragment is still echoed through the escaping braces.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // The aside. Each leaf SPELLED at its call site rather than passed as a
    // name: `content_fields` is derived by reading this file for the leaves
    // it consumes, so a leaf read through a variable is a leaf the editor
    // would stop offering.
    $noteLabel = trim((string) ($copy['note_label'] ?? ''));
    $noteLines = collect([$copy['note_1'] ?? null, $copy['note_2'] ?? null, $copy['note_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();
@endphp
    <section class="section story" id="about" data-block="story" data-variant="image-philosophy">
      <div @class(['container', 'story__grid', 'story__grid--solo' => $storyImage === null])>
@if ($storyImage !== null)
        <figure class="story__media">
          <img src="{{ $storyImage }}" width="1536" height="1024" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
          <figcaption>{{ $storyCaption }}</figcaption>
@endif
        </figure>
@endif

        <div class="story__content">
          {{-- THE TYPE HIERARCHY, mapped onto the three fields this band has:
               the kicker is the eyebrow, the lead is the display heading
               (which is what "one sentence set large" has always meant for
               this band), and the body's first paragraph takes the author's
               larger opening line.

               The eyebrow changes ELEMENT rather than style when there is no
               lead, and that is not decoration: with no display heading this
               band would otherwise have no heading at all, which puts a
               nameless section in the document outline and under the nav
               anchor that points at it. --}}
@if ($lead !== '')
          <p class="eyebrow eyebrow--light"><span aria-hidden="true"></span> {{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
          <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
          <h2 class="eyebrow eyebrow--light"><span aria-hidden="true"></span> {{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
@if ($loop->first)
          <p class="story__lead">{{ trim($paragraph) }}</p>
@else
          <p>{{ trim($paragraph) }}</p>
@endif
@endforeach

@if ($noteLabel !== '' || $noteLines->isNotEmpty())
          <aside class="ingredient-note" aria-label="{{ $noteLabel !== '' ? $noteLabel : __('What we stand behind') }}">
@if ($noteLabel !== '')
            <p class="ingredient-note__label">{{ $noteLabel }}</p>
@endif
@if ($noteLines->isNotEmpty())
            <ul>
@foreach ($noteLines as $line)
              <li>{{ $line }}</li>
@endforeach
            </ul>
@endif
          </aside>
@endif
        </div>
      </div>
    </section>
