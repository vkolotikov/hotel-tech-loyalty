{{--
  The kitchen (data-block="story", data-variant="dish-manifesto").

  The author's cream band, split with the photograph on the narrower side: an
  ember eyebrow, a display heading broken onto two lines, a lead paragraph and a
  row of outlined mono pills.

  The section KEY is `about` (that is what the catalogue, the editor and every
  existing page call this band) and the BLOCK is `story` (that is what the kits'
  shared contract calls it). Both are true and both are written down:
  `id="about"` is what the nav anchors point at, `data-block="story"` is the
  author's hook.

  THE PILLS ARE THE ASIDE FAMILY, drawn as his outlined chips.
  `about.note_1..3` are the lines and they are the SAME leaves kits 02 and
  03-beauty use for the same shape; this author writes no label above them, so
  `about.note_label` is not read here and `content_fields` does not offer it on
  this design.

  THIS AUTHOR DRAWS NO NUMBERED LEDGER. `about.fact_N` and its captions are kit
  01-hospitality's <dl> of figures, and are not read here.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the media column goes and the grid collapses to one
  (`.kitchen--solo`). A half-band with a hole in it is the one thing this band
  must never render. There is no caption under it: the author draws none, so
  `about.caption` is not read here either.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph with
  no prose is a fragment, not a section.
--}}
@php
    use App\Landing\Copy;

    $storyImage = $content->imageUrl('about');

    $lead = trim((string) ($copy['lead'] ?? ''));
    $body = trim((string) ($copy['body'] ?? ''));

    // Paragraph breaks the tenant typed survive as paragraphs. \R is any line
    // ending, so a page edited on Windows behaves like one edited anywhere
    // else. Every fragment is still echoed through the escaping braces.
    $paragraphs = array_values(array_filter(
        preg_split('/\R{2,}/u', $body) ?: [$body],
        static fn ($p) => filled(trim((string) $p))
    ));

    // The pills. Each leaf SPELLED at its call site rather than passed as a
    // name: `content_fields` is derived by reading this file for the leaves it
    // consumes, so a leaf read through a variable is a leaf the editor would
    // stop offering.
    $noteLines = collect([$copy['note_1'] ?? null, $copy['note_2'] ?? null, $copy['note_3'] ?? null])
        ->map(fn ($line) => trim((string) (is_scalar($line) ? $line : '')))
        ->filter(fn ($line) => $line !== '')
        ->values();
@endphp
    <section @class(['kitchen', 'kitchen--solo' => $storyImage === null]) id="about" data-block="story" data-variant="dish-manifesto">
@if ($storyImage !== null)
      <div class="kitchen__image"><img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}"></div>
@endif
      <div class="kitchen__copy">
        {{-- THE TYPE HIERARCHY, mapped onto the three fields this band has: the
             kicker is the eyebrow, the lead is the display heading (which is
             what "one sentence set large" has always meant for this band), and
             the body follows it.

             The eyebrow changes ELEMENT rather than style when there is no
             lead, and that is not decoration: with no display heading this band
             would otherwise have no heading at all, which puts a nameless
             section in the document outline and under the nav anchor that
             points at it. --}}
@if ($lead !== '')
        <p class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2 class="eyebrow">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
@if ($noteLines->isNotEmpty())
        <div>
@foreach ($noteLines as $line)
          <span>{{ $line }}</span>
@endforeach
        </div>
@endif
      </div>
    </section>
