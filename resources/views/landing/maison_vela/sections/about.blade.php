{{--
  The kitchen (data-block="story", data-variant="image-manifesto").

  The author's ink band, split down the middle: a full-bleed photograph on one
  side and, on the other, a brass eyebrow, a display heading, a lead paragraph
  and a ruled ledger of three figures with a caption under each.

  The section KEY is `about` (that is what the catalogue, the editor and every
  existing page call this band) and the BLOCK is `story` (that is what the
  kits' shared contract calls it). Both are true and both are written down:
  `id="about"` is what the nav anchors point at, `data-block="story"` is the
  author's hook.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the media column goes and the grid collapses to one
  (`.story--solo`). A half-band with a hole in it is the one thing this band
  must never render. There is no caption under it: the author draws none, so
  `about.caption` is not read here.

  THE LEDGER IS A PAIR PER LINE, and that is why `about.fact_N_caption` exists
  (this round). The author's `<dl>` is `26 / growers and makers` — a figure in
  the display face over a small caption — which is the SAME superset move
  template fidelity 5.4 made for the trust strip, applied to the one other
  band in the six kits that draws the same shape. `fact_N` did not move and
  goes on meaning what it meant: the line, or the pair's VALUE when a caption
  joins it. A line with no caption is printed on its own, because a whole
  sentence set in 2rem Playfair would break the row.

  THIS AUTHOR DRAWS NO ASIDE. `about.note_label` and `note_1..3` are kits 02
  and 03's bulleted list beside the story, and are not read here.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph
  with no prose is a fragment, not a section.
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

    // The ledger. Each leaf SPELLED at its call site rather than passed as a
    // name: `content_fields` is derived by reading this file for the leaves it
    // consumes, so a leaf read through a variable is a leaf the editor would
    // stop offering.
    $facts = collect([
        ['value' => $copy['fact_1'] ?? null, 'caption' => $copy['fact_1_caption'] ?? null],
        ['value' => $copy['fact_2'] ?? null, 'caption' => $copy['fact_2_caption'] ?? null],
        ['value' => $copy['fact_3'] ?? null, 'caption' => $copy['fact_3_caption'] ?? null],
    ])->map(fn ($pair) => [
        'value'   => trim((string) (is_scalar($pair['value']) ? $pair['value'] : '')),
        'caption' => trim((string) (is_scalar($pair['caption']) ? $pair['caption'] : '')),
    ])->filter(fn ($pair) => $pair['value'] !== '')->values();
@endphp
    <section @class(['story', 'story--solo' => $storyImage === null]) id="about" data-block="story" data-variant="image-manifesto">
@if ($storyImage !== null)
      <div class="story__image"><img src="{{ $storyImage }}" width="1122" height="1402" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}"></div>
@endif
      <div class="story__copy">
        {{-- THE TYPE HIERARCHY, mapped onto the three fields this band has:
             the kicker is the eyebrow, the lead is the display heading (which
             is what "one sentence set large" has always meant for this band),
             and the body follows it.

             The eyebrow changes ELEMENT rather than style when there is no
             lead, and that is not decoration: with no display heading this
             band would otherwise have no heading at all, which puts a nameless
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
@if ($facts->isNotEmpty())
        <dl data-count="{{ $facts->count() }}">
@foreach ($facts as $fact)
          <div><dt>{{ $fact['value'] }}</dt>@if ($fact['caption'] !== '')<dd>{{ $fact['caption'] }}</dd>@endif</div>
@endforeach
        </dl>
@endif
      </div>
    </section>
