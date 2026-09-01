{{--
  The atelier (data-block="story", data-variant="image-led-manifesto").

  The author's ink band: a twelve-column heading block — eyebrow, an oversized
  display heading, a paragraph in the last four columns — and under it a
  full-width photograph with a small-caps caption pinned to its corner.

  The section KEY is `about` (that is what the catalogue, the editor and
  every existing page call this band) and the BLOCK is `story` (that is what
  the kits' shared contract calls it). Both are true and both are written
  down: `id="about"` is what the nav anchors point at, `data-block="story"`
  is the author's hook. The author's own markup uses `#story` for both; the
  anchor here follows the platform's key, exactly as kit 01's conversion
  does, because the nav is generated from what actually renders.

  THE PHOTOGRAPH is gated on PageContent::imageUrl('about') — the same one
  allowlisted read, with the same three guards, that the hero's plate goes
  through. With no picture the whole media block goes and the band is the
  heading alone: a frame with no photograph in it is the one thing this band
  must never render.

  THIS AUTHOR DRAWS NO LEDGER AND NO ASIDE. `about.fact_1..3` (kit 01's
  numbered guidance) and `about.note_*` (kit 03's ingredient note) are read
  by neither this file nor this design, so `content_fields` does not offer
  either family here — the same rule that keeps this kit's `edition` off the
  other two designs.

  count() gates the band on the BODY: an eyebrow, a heading or a photograph
  with no prose is a fragment, not a section.
--}}
@php
    use App\Landing\Copy;

    $storyImage = $content->imageUrl('about');

    // The tenant's own caption, else the address this band has always
    // printed under the frame — which is what the author writes there
    // ("48 Harper Street / London W1"). filled() rather than ??, because an
    // empty stored caption must not shadow the fallback.
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
@endphp
    <section class="story section section--ink" id="about" data-block="story" data-variant="image-led-manifesto">
      <div class="container story__heading">
        {{-- THE TYPE HIERARCHY, mapped onto the three fields this band has.
             The catalogue gives it `kicker`, `lead` and `body`: the kicker is
             the eyebrow, the lead is the display heading (which is what "one
             sentence set large" has always meant for this band), and the body
             is the paragraph beside it.

             The eyebrow changes ELEMENT rather than style when there is no
             lead, and that is not decoration: with no display heading this
             band would otherwise have no heading at all, which puts a
             nameless section in the document outline and under the nav
             anchor that points at it. --}}
@if ($lead !== '')
        <p class="kicker kicker--inverse">{{ $copy['kicker'] ?? $profile->kicker('about') }}</p>
        <h2>{{ Copy::heading($lead, $copy['lead_accent'] ?? null) }}</h2>
@else
        <h2 class="kicker kicker--inverse">{{ $copy['kicker'] ?? $profile->kicker('about') }}</h2>
@endif
@foreach ($paragraphs as $paragraph)
        <p>{{ trim($paragraph) }}</p>
@endforeach
      </div>

@if ($storyImage !== null)
      <div class="container story__media">
        <img src="{{ $storyImage }}" width="1537" height="1023" loading="lazy" decoding="async" alt="{{ $content->imageAlt('about') }}">
@if ($storyCaption !== '')
        <p class="story__caption">{{ $storyCaption }}</p>
@endif
      </div>
@endif
    </section>
